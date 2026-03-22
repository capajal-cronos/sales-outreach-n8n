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
  console.log(`🧹 DEL  http://localhost:${PORT}/api/apollo/pending - Clear Apollo pending queue`);
});