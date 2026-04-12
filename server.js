import 'dotenv/config';
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
  getAllResponses
} from './src/api/serverDatabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// In-memory workflow error log (survives until server restart)
const workflowErrors = [];
let errorIdCounter = 1;

// Initialize Apollo pending database on startup
await initializeApolloPending();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Organization API is running' });
});

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

// Get leads from Pipedrive
app.get('/api/leads', async (req, res) => {
  try {
    // Try both VITE_ prefixed and non-prefixed versions
    const PIPEDRIVE_API_KEY = process.env.PIPEDRIVE_API_KEY || process.env.VITE_PIPEDRIVE_API_KEY;
    
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
        if (personId) {
          try {
            const personResponse = await fetch(`https://api.pipedrive.com/v1/persons/${personId}?api_token=${PIPEDRIVE_API_KEY}`);
            if (personResponse.ok) {
              const personData = await personResponse.json();
              personEmail = personData.data?.email?.[0]?.value || '';
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

    // Check n8n webhook is configured before deleting from queue
    const n8nWebhookUrl = process.env.N8N_APPROVAL_WEBHOOK_URL;
    if (!n8nWebhookUrl) {
      console.error('N8N_APPROVAL_WEBHOOK_URL not configured');
      return res.status(500).json({ success: false, error: 'N8N_APPROVAL_WEBHOOK_URL is not configured on the server' });
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  console.log(`\n🔍 Apollo:`);
  console.log(`   POST http://localhost:${PORT}/api/apollo/results - Store Apollo search results`);
  console.log(`   GET  http://localhost:${PORT}/api/apollo/pending - Get pending Apollo organizations`);
  console.log(`   POST http://localhost:${PORT}/api/apollo/decisions - Accept/decline Apollo orgs`);
  console.log(`\n📧 Email Queue:`);
  console.log(`   POST http://localhost:${PORT}/api/email-queue - Add email(s) to queue (n8n)`);
  console.log(`   GET  http://localhost:${PORT}/api/email-queue/pending - Get pending emails`);
  console.log(`   GET  http://localhost:${PORT}/api/email-queue?status=X - Get emails by status`);
  console.log(`   POST http://localhost:${PORT}/api/emails/decision - Approve or decline email`);
  console.log(`   DEL  http://localhost:${PORT}/api/email-queue/:id - Delete email`);
  console.log(`📋 GET  http://localhost:${PORT}/api/leads - Get leads from Pipedrive`);
  console.log(`🧹 DEL  http://localhost:${PORT}/api/apollo/pending - Clear Apollo pending queue`);
});