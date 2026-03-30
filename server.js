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
import { initializeApolloPending } from './src/api/serverDatabase.js';

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

    // Fetch leads from Pipedrive API with organization details
    const response = await fetch(`https://api.pipedrive.com/v1/leads?api_token=${PIPEDRIVE_API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`Pipedrive API error: ${response.status}`);
    }

    const data = await response.json();
    
    // Transform Pipedrive leads to our format
    const leads = await Promise.all((data.data || []).map(async (lead) => {
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
      
      return {
        id: lead.id,
        title: lead.title,
        personId: lead.person_id,
        personName: lead.person_name || '',
        organizationId: lead.organization_id,
        organization: organizationName,
        value: lead.value?.amount || 0,
        currency: lead.value?.currency || 'USD',
        label: lead.label_ids?.[0] || 'no_label',
        email: personEmail || lead.person?.email?.[0]?.value || '',
        phone: lead.person?.phone?.[0]?.value || '',
        createdAt: lead.add_time,
        updatedAt: lead.update_time,
        ownerId: lead.owner_id
      };
    }));

    res.json({
      success: true,
      leads,
      count: leads.length
    });
  } catch (error) {
    console.error('Error fetching leads from Pipedrive:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Organization API server running on http://localhost:${PORT}`);
  console.log(`📊 GET  http://localhost:${PORT}/api/organizations - Get all organizations`);
  console.log(`📈 GET  http://localhost:${PORT}/api/organizations/statistics - Get statistics`);
  console.log(`➕ POST http://localhost:${PORT}/api/organizations - Add organization`);
  console.log(`📥 POST http://localhost:${PORT}/api/organizations/import - Import organizations`);
  console.log(`🗑️  DEL  http://localhost:${PORT}/api/organizations/:id - Delete organization`);
  console.log(`❌ POST http://localhost:${PORT}/api/organization/error - Mark as error (n8n)`);
  console.log(`✅ POST http://localhost:${PORT}/api/organization/success - Mark as success (n8n)`);
  console.log(`🔍 POST http://localhost:${PORT}/api/apollo/results - Store Apollo search results`);
  console.log(`📋 GET  http://localhost:${PORT}/api/apollo/pending - Get pending Apollo organizations`);
  console.log(`✔️  POST http://localhost:${PORT}/api/apollo/decisions - Accept/decline Apollo orgs`);
  console.log(`📋 GET  http://localhost:${PORT}/api/leads - Get leads from Pipedrive`);
  console.log(`🧹 DEL  http://localhost:${PORT}/api/apollo/pending - Clear Apollo pending queue`);
});