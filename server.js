import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import {
  handleApolloSearchResults,
  handleGetPendingApolloOrgs,
  handleApolloDecisions,
  handleClearApolloPending
} from './src/api/organizationEndpoint.js';
import {
  initializeApolloPending,
  addEmailToQueue,
  getPendingEmails,
  getAllEmails,
  deleteEmailFromQueue,
  clearEmailsByStatus,
  addResponse,
  getAllResponses,
  archiveSentEmail
} from './src/api/serverDatabase.js';
import { DB_DRIVER, ping as dbPing, close as dbClose } from './src/api/db/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === 'production';
const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY || process.env.VITE_PIPEDRIVE_API_KEY;

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory workflow error log (survives until server restart)
const workflowErrors = [];
let errorIdCounter = 1;

// Initialize Apollo pending database on startup
await initializeApolloPending();

// CORS: in production the frontend is same-origin (Express serves dist/), so
// browser requests don't need CORS. n8n callbacks are server-to-server and
// CORS doesn't apply. FRONTEND_ORIGIN allows overriding for split deployments.
// In dev, default to the Vite dev server origin.
const corsOrigin = process.env.FRONTEND_ORIGIN
  || (isProduction ? false : 'http://localhost:3000');
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

// Health check endpoint. Pings the DB when the postgres driver is active so
// orchestrators (Cloud Run, etc.) can fail-fast on a broken connection.
app.get('/health', async (req, res) => {
  if (DB_DRIVER === 'postgres') {
    try {
      await dbPing();
    } catch (error) {
      return res.status(503).json({
        status: 'degraded',
        driver: DB_DRIVER,
        error: error.message
      });
    }
  }
  res.json({ status: 'ok', driver: DB_DRIVER, message: 'Organization API is running' });
});

// ============================================
// PIPEDRIVE PROXY ENDPOINTS
// ============================================
// These keep the API key server-side. The browser hits /api/pipedrive/* and
// the server adds the api_token. Responses are passed through unchanged so
// existing client code can read `data.success`, `data.data`, etc.

async function pipedriveProxy(req, res, pipedrivePath, extraQuery = {}) {
  if (!PIPEDRIVE_API_KEY) {
    return res.status(500).json({ success: false, error: 'PIPEDRIVE_API_KEY not configured on the server' });
  }
  try {
    const params = new URLSearchParams({ api_token: PIPEDRIVE_API_KEY, ...extraQuery });
    const limit = req.query.limit;
    if (limit) params.set('limit', String(limit));
    const url = `https://api.pipedrive.com${pipedrivePath}?${params.toString()}`;
    const upstream = await fetch(url);
    const text = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(text);
  } catch (error) {
    console.error(`Pipedrive proxy error (${pipedrivePath}):`, error);
    res.status(502).json({ success: false, error: error.message });
  }
}

app.get('/api/pipedrive/lead-labels', (req, res) => pipedriveProxy(req, res, '/v1/leadLabels'));
app.get('/api/pipedrive/organizations', (req, res) => pipedriveProxy(req, res, '/v1/organizations'));
app.get('/api/pipedrive/organizations/:id', (req, res) => pipedriveProxy(req, res, `/v1/organizations/${encodeURIComponent(req.params.id)}`));
app.get('/api/pipedrive/persons', (req, res) => pipedriveProxy(req, res, '/v1/persons'));
app.get('/api/pipedrive/persons/:id', (req, res) => pipedriveProxy(req, res, `/api/v2/persons/${encodeURIComponent(req.params.id)}`));
app.get('/api/pipedrive/organization-fields', (req, res) => pipedriveProxy(req, res, '/v1/organizationFields'));

// ============================================
// N8N PROXY ENDPOINTS
// ============================================
// The browser hits /api/n8n/<path> on the same origin and the server
// forwards to ${N8N_BASE_URL}/<path>. Keeps the n8n URL out of the public
// bundle and makes it a runtime-only config (no rebuild to switch envs).

const N8N_BASE_URL = (process.env.N8N_BASE_URL || '').replace(/\/+$/, '');

async function n8nProxy(req, res, n8nPath) {
  if (!N8N_BASE_URL) {
    return res.status(500).json({ success: false, error: 'N8N_BASE_URL is not configured on the server' });
  }
  try {
    const url = `${N8N_BASE_URL}${n8nPath}`;
    const upstream = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body ?? {})
    });
    const text = await upstream.text();
    res.status(upstream.status).type(upstream.headers.get('content-type') || 'application/json').send(text);
  } catch (error) {
    console.error(`n8n proxy error (${n8nPath}):`, error);
    res.status(502).json({ success: false, error: error.message });
  }
}

app.post('/api/n8n/organizations', (req, res) => n8nProxy(req, res, '/organizations'));
app.post('/api/n8n/organization-filters', (req, res) => n8nProxy(req, res, '/organization-filters'));
app.post('/api/n8n/organizations-file', (req, res) => n8nProxy(req, res, '/organizations-file'));
app.post('/api/n8n/apollo-accepted-organizations', (req, res) => n8nProxy(req, res, '/apollo-accepted-organizations'));
app.post('/api/n8n/find-people', (req, res) => n8nProxy(req, res, '/find-people'));
app.post('/api/n8n/save-people', (req, res) => n8nProxy(req, res, '/save-people'));
app.post('/api/n8n/make-leads', (req, res) => n8nProxy(req, res, '/make-leads'));
app.post('/api/n8n/send-leads-mails', (req, res) => n8nProxy(req, res, '/send-leads-mails'));

// Apollo search results endpoint - receive organizations from Apollo search
app.post('/api/apollo/results', async (req, res) => {
  await handleApolloSearchResults(req, res);
});

// Get pending Apollo organizations for review
app.get('/api/apollo/pending', async (req, res) => {
  await handleGetPendingApolloOrgs(req, res);
});

// Process Apollo decisions (accept/decline)
app.post('/api/apollo/decisions', async (req, res) => {
  await handleApolloDecisions(req, res);
});

// Clear Apollo pending queue
app.delete('/api/apollo/pending', async (req, res) => {
  await handleClearApolloPending(req, res);
});

// n8n callback: organization successfully added to Pipedrive
app.post('/api/organization/success', (req, res) => {
  console.log('✅ Organization added to Pipedrive:', req.body.name, req.body.domain);
  res.json({ success: true });
});

// n8n callback: organization failed to be added to Pipedrive
app.post('/api/organization/error', (req, res) => {
  console.error('❌ Organization failed:', req.body.name, req.body.error);
  res.json({ success: true });
});

// Get leads from Pipedrive
app.get('/api/leads', async (req, res) => {
  try {
    if (!PIPEDRIVE_API_KEY) {
      console.error('Pipedrive API key not found in environment variables');
      return res.status(500).json({
        success: false,
        error: 'Pipedrive API key not configured'
      });
    }

    // Fetch label mappings first
    const labelsResponse = await fetch(`https://api.pipedrive.com/v1/leadLabels?api_token=${PIPEDRIVE_API_KEY}`);
    const labelsData = await labelsResponse.json();
    const labelMapping = {};
    if (labelsData.success && labelsData.data) {
      labelsData.data.forEach(label => {
        labelMapping[label.id] = label.name.toLowerCase();
      });
    }

    const skipFilter = req.query.showAll === 'true';

    // Fetch leads from Pipedrive API
    const response = await fetch(`https://api.pipedrive.com/v1/leads?api_token=${PIPEDRIVE_API_KEY}&limit=500`);
    
    if (!response.ok) {
      throw new Error(`Pipedrive API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Enrich leads in small batches to avoid hitting Pipedrive rate limits
    const rawLeads = data.data || [];
    const BATCH_SIZE = 5;
    const allLeads = [];

    for (let i = 0; i < rawLeads.length; i += BATCH_SIZE) {
      const batch = rawLeads.slice(i, i + BATCH_SIZE);
      const enriched = await Promise.all(batch.map(async (lead) => {
        let organizationName = lead.organization_name || '';
        let personEmail = '';

        // If organization_id exists but no name, fetch it
        if (lead.organization_id && !organizationName) {
          try {
            const orgResponse = await fetch(`https://api.pipedrive.com/v1/organizations/${lead.organization_id}?api_token=${PIPEDRIVE_API_KEY}`);
            if (orgResponse.ok) {
              const orgData = await orgResponse.json();
              organizationName = orgData.data?.name || '';
            }
          } catch (err) {
            console.error(`Failed to fetch organization ${lead.organization_id}:`, err);
          }
        }

        // person_id can be a plain integer or an object {value: id} depending on API version
        const personId = lead.person_id?.value ?? lead.person_id;
        let personEmails = [];
        if (personId) {
          try {
            const personResponse = await fetch(`https://api.pipedrive.com/v1/persons/${personId}?api_token=${PIPEDRIVE_API_KEY}`);
            if (personResponse.ok) {
              const personData = await personResponse.json();
              personEmails = (personData.data?.email || [])
                .map(e => (e?.value || '').trim().toLowerCase())
                .filter(Boolean);
              personEmail = personEmails[0] || '';
            }
          } catch (err) {
            console.error(`Failed to fetch person ${personId}:`, err);
          }
        }

        // Get label name
        const labelId = lead.label_ids?.[0];
        const labelName = labelId ? labelMapping[labelId] : 'no_label';

        return {
          id: lead.id,
          title: lead.title,
          personId: personId || null,
          personName: lead.person_name || '',
          organizationId: lead.organization_id,
          organization: organizationName,
          value: lead.value?.amount || 0,
          currency: lead.value?.currency || 'USD',
          label: labelName,
          label_ids: lead.label_ids || [],
          email: personEmail || '',
          emails: personEmails,
          phone: '',
          createdAt: lead.add_time,
          updatedAt: lead.update_time,
          ownerId: lead.owner_id
        };
      }));
      allLeads.push(...enriched);
    }

    // Filter out leads with "answered" or "last_mail" labels (skip when showAll=true)
    const filteredLeads = skipFilter ? allLeads : allLeads.filter(lead => {
      const label = lead.label.toLowerCase();
      return label !== 'answered' && label !== 'last_mail' && label !== 'last mail';
    });

    res.json({
      success: true,
      leads: filteredLeads,
      count: filteredLeads.length,
      totalCount: allLeads.length
    });
  } catch (error) {
    console.error('Error fetching leads from Pipedrive:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// EMAIL QUEUE ENDPOINTS
// ============================================

// Endpoint for n8n to add emails to queue
app.post('/api/email-queue', async (req, res) => {
  try {
    const emails = Array.isArray(req.body) ? req.body : [req.body];
    
    const addedEmails = [];
    const rejectedEmails = [];
    
    for (const emailData of emails) {
      // Validate required fields
      if (!emailData.lead_id || !emailData.email || !emailData.subject || !emailData.body || !emailData.first_name) {
        console.error('Invalid email data (missing required fields):', {
          lead_id: emailData.lead_id,
          email: emailData.email,
          first_name: emailData.first_name,
          email_stage: emailData.email_stage
        });
        rejectedEmails.push({
          lead_id: emailData.lead_id,
          reason: 'Missing required fields (email, first_name, subject, or body)'
        });
        continue;
      }
      
      const newEmail = await addEmailToQueue(emailData);
      addedEmails.push(newEmail);
    }
    
    res.json({
      success: true,
      message: `${addedEmails.length} email(s) added to queue, ${rejectedEmails.length} rejected`,
      emails: addedEmails,
      rejected: rejectedEmails
    });
  } catch (error) {
    console.error('Error adding emails to queue:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Approve or decline email endpoint
app.post('/api/emails/decision', async (req, res) => {
  try {
    const { lead_id, decision, email_data } = req.body;
    
    if (!lead_id || !decision) {
      return res.status(400).json({
        success: false,
        error: 'lead_id and decision are required'
      });
    }

    if (decision !== 'approve' && decision !== 'decline') {
      return res.status(400).json({
        success: false,
        error: 'decision must be "approve" or "decline"'
      });
    }

    // Check n8n base URL is configured before deleting from queue
    if (!N8N_BASE_URL) {
      console.error('N8N_BASE_URL not configured');
      return res.status(500).json({ success: false, error: 'N8N_BASE_URL is not configured on the server' });
    }
    const n8nWebhookUrl = `${N8N_BASE_URL}/email-approval`;

    // Archive approved emails so we can recover the original body when
    // a reply comes in (the queue gets cleared right after).
    if (decision === 'approve' && email_data) {
      await archiveSentEmail({ ...email_data, lead_id });
    }

    // Remove email from queue
    if (email_data && email_data.id) {
      try {
        await deleteEmailFromQueue(email_data.id);
      } catch (dbError) {
        console.error('Error removing email from queue:', dbError);
      }
    }

    // Send decision to n8n webhook
    let n8nError = null;
    try {
      const response = await fetch(n8nWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_id,
          decision,
          email_data,
          timestamp: new Date().toISOString()
        })
      });

      if (!response.ok) {
        n8nError = `n8n returned ${response.status}`;
        console.error(`Failed to send decision to n8n: ${response.status}`);
      }
    } catch (error) {
      n8nError = error.message;
      console.error('Error sending decision to n8n:', error);
    }

    res.json({
      success: true,
      message: `Email ${decision}d successfully`,
      lead_id,
      decision,
      ...(n8nError ? { warning: `n8n webhook failed: ${n8nError}` } : {})
    });
  } catch (error) {
    console.error('Error processing email decision:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all pending emails
app.get('/api/email-queue/pending', async (req, res) => {
  try {
    const emails = await getPendingEmails();
    res.json({
      success: true,
      emails,
      count: emails.length
    });
  } catch (error) {
    console.error('Error fetching pending emails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get all emails (with optional status filter)
app.get('/api/email-queue', async (req, res) => {
  try {
    const status = req.query.status;
    const emails = await getAllEmails(status);
    res.json({
      success: true,
      emails,
      count: emails.length
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete email from queue
app.delete('/api/email-queue/:id', async (req, res) => {
  try {
    await deleteEmailFromQueue(req.params.id);
    res.json({
      success: true,
      message: 'Email deleted from queue'
    });
  } catch (error) {
    console.error('Error deleting email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Clear emails by status
app.delete('/api/email-queue/status/:status', async (req, res) => {
  try {
    const count = await clearEmailsByStatus(req.params.status);
    res.json({
      success: true,
      message: `${count} email(s) cleared`,
      count
    });
  } catch (error) {
    console.error('Error clearing emails:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// RESPONSE TRACKING ENDPOINTS
// ============================================

// n8n POSTs reply data here when it detects a reply via IMAP
app.post('/api/responses', async (req, res) => {
  try {
    const payload = Array.isArray(req.body) ? req.body[0] : req.body;
    const response = await addResponse(payload);
    res.json({ success: true, response });
  } catch (error) {
    console.error('Error storing response:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Frontend polls this to display replies
app.get('/api/responses', async (req, res) => {
  try {
    const responses = await getAllResponses();
    res.json({ success: true, responses, count: responses.length });
  } catch (error) {
    console.error('Error fetching responses:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// WORKFLOW ERROR ENDPOINTS
// ============================================

// n8n POSTs errors here (e.g. out-of-credits, API failures)
app.post('/api/workflow-errors', (req, res) => {
  const { workflow, message, details, lead_id } = req.body;
  if (!workflow || !message) {
    return res.status(400).json({ success: false, error: 'workflow and message are required' });
  }
  // Deduplicate: if the same workflow+message is already shown, just update the timestamp
  const existing = workflowErrors.find(e => e.workflow === workflow && e.message === message);
  if (existing) {
    existing.timestamp = new Date().toISOString();
    if (details) existing.details = details;
    return res.json({ success: true, error: existing });
  }
  const error = {
    id: errorIdCounter++,
    workflow,
    message,
    details: details || null,
    lead_id: lead_id || null,
    timestamp: new Date().toISOString()
  };
  workflowErrors.push(error);
  console.error(`[workflow-error] ${workflow}: ${message}`);
  res.json({ success: true, error });
});

// Frontend polls this to display errors
app.get('/api/workflow-errors', (req, res) => {
  res.json({ success: true, errors: workflowErrors, count: workflowErrors.length });
});

// Dismiss a specific error
app.delete('/api/workflow-errors/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const idx = workflowErrors.findIndex(e => e.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, error: 'Error not found' });
  }
  workflowErrors.splice(idx, 1);
  res.json({ success: true });
});

// In production, serve the built frontend from this same Express process so
// browser and API are same-origin (no CORS, no API base URL config needed).
if (isProduction) {
  const distDir = path.join(__dirname, 'dist');
  app.use(express.static(distDir));
  app.get('*', (req, res) => res.sendFile(path.join(distDir, 'index.html')));
}

// Start server
const server = app.listen(PORT, () => {
  console.log(`API ready on http://localhost:${PORT} (db driver: ${DB_DRIVER})`);
});

// Graceful shutdown: stop accepting new connections, drain the DB pool, exit.
async function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(async () => {
    try {
      await dbClose();
    } catch (error) {
      console.error('Error closing DB pool:', error);
    }
    process.exit(0);
  });
  // Hard-exit after 10s if the close hangs (e.g. lingering keep-alive sockets).
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));