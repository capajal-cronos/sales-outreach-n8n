import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file path
const DB_FILE = path.join(__dirname, '../../data/organizations.json');

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(DB_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Read database
async function readDatabase() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(DB_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    // If file doesn't exist, return empty array
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Write database
async function writeDatabase(data) {
  await ensureDataDir();
  await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Get all organizations
export async function getAllOrganizations() {
  return await readDatabase();
}

// Get organization by domain
export async function getOrganizationByDomain(domain) {
  const orgs = await readDatabase();
  return orgs.find(org => org.domain === domain);
}

// Get organization by id
export async function getOrganizationById(id) {
  const orgs = await readDatabase();
  return orgs.find(org => org.id === id);
}

// Add organization
export async function addOrganization(orgData) {
  const orgs = await readDatabase();
  
  // Generate new ID
  const maxId = orgs.length > 0 ? Math.max(...orgs.map(o => o.id || 0)) : 0;
  const newId = maxId + 1;
  
  const newOrg = {
    id: newId,
    name: orgData.name || '',
    domain: orgData.domain || '',
    industry: orgData.industry || '',
    employees: orgData.employees || '',
    location: orgData.location || '',
    revenue: orgData.revenue || '',
    description: orgData.description || '',
    processed: orgData.processed || '',
    error_message: orgData.error_message || '',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  orgs.push(newOrg);
  await writeDatabase(orgs);
  
  return newId;
}

// Update organization
export async function updateOrganization(id, updates) {
  const orgs = await readDatabase();
  const index = orgs.findIndex(org => org.id === id);
  
  if (index === -1) {
    throw new Error('Organization not found');
  }
  
  orgs[index] = {
    ...orgs[index],
    ...updates,
    updated_at: new Date().toISOString()
  };
  
  await writeDatabase(orgs);
  return true;
}

// Delete organization
export async function deleteOrganization(id) {
  const orgs = await readDatabase();
  const filtered = orgs.filter(org => org.id !== id);
  
  if (filtered.length === orgs.length) {
    throw new Error('Organization not found');
  }
  
  await writeDatabase(filtered);
  return true;
}

// Check if organization exists by domain
export async function organizationExists(domain) {
  const org = await getOrganizationByDomain(domain);
  return !!org;
}

// Get statistics
export async function getStatistics() {
  const orgs = await readDatabase();
  
  return {
    total: orgs.length,
    processed: orgs.filter(o => o.processed === 'yes').length,
    unprocessed: orgs.filter(o => !o.processed || o.processed === '').length,
    errors: orgs.filter(o => o.processed === 'error').length
  };
}