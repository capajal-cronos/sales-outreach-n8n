import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file paths
const DB_FILE = path.join(__dirname, '../../data/organizations.json');
const APOLLO_PENDING_FILE = path.join(__dirname, '../../data/apollo_pending.json');

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
    
    // Trim any whitespace and validate JSON
    const trimmedData = data.trim();
    if (!trimmedData) {
      // If file is empty, initialize with empty array
      await writeDatabase([]);
      return [];
    }
    
    try {
      return JSON.parse(trimmedData);
    } catch (parseError) {
      console.error('JSON parse error in organizations.json, resetting file:', parseError);
      // If JSON is corrupted, reset to empty array
      await writeDatabase([]);
      return [];
    }
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

// Read Apollo pending database
async function readApolloPending() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(APOLLO_PENDING_FILE, 'utf-8');
    
    // Trim any whitespace and validate JSON
    const trimmedData = data.trim();
    if (!trimmedData) {
      return [];
    }
    
    try {
      return JSON.parse(trimmedData);
    } catch (parseError) {
      console.error('JSON parse error in apollo_pending.json, resetting file:', parseError);
      // If JSON is corrupted, reset to empty array
      await writeApolloPending([]);
      return [];
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Write Apollo pending database with atomic write
async function writeApolloPending(data) {
  await ensureDataDir();
  const jsonString = JSON.stringify(data, null, 2);
  
  try {
    // Check if target file exists
    let targetExists = false;
    try {
      await fs.access(APOLLO_PENDING_FILE);
      targetExists = true;
    } catch (err) {
      // File doesn't exist
    }
    
    // Write to a temporary file first
    const tempFile = APOLLO_PENDING_FILE + '.tmp';
    await fs.writeFile(tempFile, jsonString, 'utf-8');
    
    // On Windows, delete target file first if it exists before rename
    if (targetExists) {
      await fs.unlink(APOLLO_PENDING_FILE);
    }
    
    // Rename temp file to target (atomic operation)
    await fs.rename(tempFile, APOLLO_PENDING_FILE);
  } catch (error) {
    // Fallback to direct write if atomic write fails
    console.error('Atomic write failed, using direct write:', error);
    await fs.writeFile(APOLLO_PENDING_FILE, jsonString, 'utf-8');
  }
}

// Store Apollo search results for review
export async function storeApolloResults(apolloOrgs) {
  const pending = await readApolloPending();
  let stored = 0;
  
  for (const org of apolloOrgs) {
    // Check if already exists in pending
    const exists = pending.find(p => p.apollo_id === org.apollo_id);
    if (!exists) {
      pending.push({
        apollo_id: org.apollo_id,
        name: org.name,
        website_url: org.website_url || '',
        linkedin_url: org.linkedin_url || '',
        status: 'pending',
        created_at: new Date().toISOString()
      });
      stored++;
    }
  }
  
  await writeApolloPending(pending);
  return stored;
}

// Get pending Apollo organizations
export async function getPendingApolloOrganizations() {
  const pending = await readApolloPending();
  return pending.filter(org => org.status === 'pending');
}

// Process Apollo decisions (accept/decline)
export async function processApolloDecisions(decisions) {
  const pending = await readApolloPending();
  const orgs = await readDatabase();
  
  let accepted = 0;
  let declined = 0;
  const acceptedOrganizations = [];
  const processedIds = [];
  
  for (const decision of decisions) {
    const pendingOrg = pending.find(p => p.apollo_id === decision.apollo_id);
    
    if (!pendingOrg) {
      continue;
    }
    
    if (decision.action === 'accept') {
      // Check if organization already exists in database by apollo_id
      const existingOrg = orgs.find(o => o.apollo_id === pendingOrg.apollo_id);
      
      if (existingOrg) {
        console.log(`Organization with apollo_id ${pendingOrg.apollo_id} already exists, skipping...`);
        acceptedOrganizations.push(existingOrg);
      } else {
        // Add to main organizations database
        const maxId = orgs.length > 0 ? Math.max(...orgs.map(o => o.id || 0)) : 0;
        const newId = maxId + 1;
        
        const newOrg = {
          id: newId,
          name: pendingOrg.name,
          domain: pendingOrg.website_url,
          linkedin: pendingOrg.linkedin_url,
          apollo_id: pendingOrg.apollo_id,
          industry: '',
          employees: '',
          location: '',
          revenue: '',
          description: '',
          processed: 'success',
          error_message: '',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };
        
        orgs.push(newOrg);
        acceptedOrganizations.push(newOrg);
      }
      accepted++;
    } else if (decision.action === 'decline') {
      declined++;
    }
    
    // Mark this ID for removal from pending
    processedIds.push(pendingOrg.apollo_id);
  }
  
  // Remove processed organizations from pending list
  const updatedPending = pending.filter(org => !processedIds.includes(org.apollo_id));
  
  // Save both databases
  await writeDatabase(orgs);
  await writeApolloPending(updatedPending);
  
  return {
    accepted,
    declined,
    acceptedOrganizations
  };
}

// Clear all Apollo pending organizations
export async function clearApolloPending() {
  await writeApolloPending([]);
  return true;
}

// Initialize Apollo pending on startup
export async function initializeApolloPending() {
  try {
    await ensureDataDir();
    await writeApolloPending([]);
    console.log('✅ Apollo pending database initialized (cleared)');
  } catch (error) {
    console.error('Failed to initialize Apollo pending database:', error);
  }
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