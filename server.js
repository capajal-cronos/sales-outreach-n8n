import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import {
  handleOrganizationError,
  handleOrganizationSuccess,
  handleGetAllOrganizations,
  handleGetStatistics,
  handleImportOrganizations,
  handleDeleteOrganization,
  handleAddOrganization,
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
  updateEmailStatus,
  deleteEmailFromQueue,
  clearEmailsByStatus
} from './src/api/serverDatabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Apollo pending database on startup
await initializeApolloPending();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Organization API is running' });
});

// Get all organizations
app.get('/api/organizations', async (req, res) => {
  await handleGetAllOrganizations(req, res);
});

// Get statistics
app.get('/api/organizations/statistics', async (req, res) => {
  await handleGetStatistics(req, res);
});

// Add organization (from UI)
app.post('/api/organizations', async (req, res) => {
  await handleAddOrganization(req, res);
});

// Import multiple organizations
app.post('/api/organizations/import', async (req, res) => {
  await handleImportOrganizations(req, res);
});

// Delete organization
app.delete('/api/organizations/:id', async (req, res) => {
  await handleDeleteOrganization(req, res);
});

// Organization error endpoint - for n8n to POST when processing fails
app.post('/api/organization/error', async (req, res) => {
  await handleOrganizationError(req, res);
});

// Organization success endpoint - for n8n to POST when processing succeeds
app.post('/api/organization/success', async (req, res) => {
  await handleOrganizationSuccess(req, res);
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

    // Fetch leads from Pipedrive API
    const response = await fetch(`https://api.pipedrive.com/v1/leads?api_token=${PIPEDRIVE_API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`Pipedrive API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform and filter Pipedrive leads
    const allLeads = await Promise.all((data.data || []).map(async (lead) => {
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
      
      // If person_id exists, fetch person details to get email
      if (lead.person_id) {
        try {
          const personResponse = await fetch(`https://api.pipedrive.com/v1/persons/${lead.person_id}?api_token=${PIPEDRIVE_API_KEY}`);
          if (personResponse.ok) {
            const personData = await personResponse.json();
            personEmail = personData.data?.email?.[0]?.value || '';
          }
        } catch (err) {
          console.error(`Failed to fetch person ${lead.person_id}:`, err);
        }
      }
      
      // Get label name
      const labelId = lead.label_ids?.[0];
      const labelName = labelId ? labelMapping[labelId] : 'no_label';
      
      return {
        id: lead.id,
        title: lead.title,
        personId: lead.person_id,
        personName: lead.person_name || '',
        organizationId: lead.organization_id,
        organization: organizationName,
        value: lead.value?.amount || 0,
        currency: lead.value?.currency || 'USD',
        label: labelName,
        label_ids: lead.label_ids || [],
        email: personEmail || lead.person?.email?.[0]?.value || '',
        phone: lead.person?.phone?.[0]?.value || '',
        createdAt: lead.add_time,
        updatedAt: lead.update_time,
        ownerId: lead.owner_id
      };
    }));

    // Filter out leads with "answered" or "last_mail" labels
    const filteredLeads = allLeads.filter(lead => {
      const label = lead.label.toLowerCase();
      return label !== 'answered' && label !== 'last_mail' && label !== 'last mail';
    });

    console.log(`Total leads: ${allLeads.length}, Filtered leads (excluding answered/last_mail): ${filteredLeads.length}`);

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
    for (const emailData of emails) {
      // Validate required fields
      if (!emailData.lead_id || !emailData.email || !emailData.subject || !emailData.body) {
        console.error('Invalid email data:', emailData);
        continue;
      }
      
      const newEmail = await addEmailToQueue(emailData);
      addedEmails.push(newEmail);
    }
    
    res.json({
      success: true,
      message: `${addedEmails.length} email(s) added to queue`,
      emails: addedEmails
    });
  } catch (error) {
    console.error('Error adding emails to queue:', error);
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

// Approve email
app.post('/api/email-queue/:id/approve', async (req, res) => {
  try {
    const email = await updateEmailStatus(req.params.id, 'approved', 'approve');
    res.json({
      success: true,
      message: 'Email approved',
      email
    });
  } catch (error) {
    console.error('Error approving email:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Decline email
app.post('/api/email-queue/:id/decline', async (req, res) => {
  try {
    const email = await updateEmailStatus(req.params.id, 'declined', 'decline');
    res.json({
      success: true,
      message: 'Email declined',
      email
    });
  } catch (error) {
    console.error('Error declining email:', error);
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

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Organization API server running on http://localhost:${PORT}`);
  console.log(`\n📊 Organizations:`);
  console.log(`   GET  http://localhost:${PORT}/api/organizations - Get all organizations`);
  console.log(`   GET  http://localhost:${PORT}/api/organizations/statistics - Get statistics`);
  console.log(`   POST http://localhost:${PORT}/api/organizations - Add organization`);
  console.log(`   POST http://localhost:${PORT}/api/organizations/import - Import organizations`);
  console.log(`   DEL  http://localhost:${PORT}/api/organizations/:id - Delete organization`);
  console.log(`\n🔍 Apollo:`);
  console.log(`   POST http://localhost:${PORT}/api/apollo/results - Store Apollo search results`);
  console.log(`   GET  http://localhost:${PORT}/api/apollo/pending - Get pending Apollo organizations`);
  console.log(`   POST http://localhost:${PORT}/api/apollo/decisions - Accept/decline Apollo orgs`);
  console.log(`\n📧 Email Queue:`);
  console.log(`   POST http://localhost:${PORT}/api/email-queue - Add email(s) to queue (n8n)`);
  console.log(`   GET  http://localhost:${PORT}/api/email-queue/pending - Get pending emails`);
  console.log(`   GET  http://localhost:${PORT}/api/email-queue?status=X - Get emails by status`);
  console.log(`   POST http://localhost:${PORT}/api/email-queue/:id/approve - Approve email`);
  console.log(`   POST http://localhost:${PORT}/api/email-queue/:id/decline - Decline email`);
  console.log(`   DEL  http://localhost:${PORT}/api/email-queue/:id - Delete email`);
  console.log(`📋 GET  http://localhost:${PORT}/api/leads - Get leads from Pipedrive`);
  console.log(`🧹 DEL  http://localhost:${PORT}/api/apollo/pending - Clear Apollo pending queue`);
});