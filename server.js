import express from 'express';
import cors from 'cors';
import {
  handleOrganizationError,
  handleOrganizationSuccess,
  handleGetAllOrganizations,
  handleGetStatistics,
  handleImportOrganizations,
  handleDeleteOrganization,
  handleAddOrganization
} from './src/api/organizationEndpoint.js';

const app = express();
const PORT = process.env.PORT || 3001;

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
});