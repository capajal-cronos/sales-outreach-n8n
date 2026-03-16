// Simple IndexedDB wrapper for organizations database
const DB_NAME = 'OrganizationsDB';
const DB_VERSION = 1;
const STORE_NAME = 'organizations';

let db = null;

// Initialize IndexedDB database
export async function initDatabase() {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = event.target.result;
      
      // Create object store if it doesn't exist
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = database.createObjectStore(STORE_NAME, { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        
        // Create indexes
        objectStore.createIndex('domain', 'domain', { unique: true });
        objectStore.createIndex('processed', 'processed', { unique: false });
        objectStore.createIndex('created_at', 'created_at', { unique: false });
      }
    };
  });
}

// Get all organizations
export async function getAllOrganizations() {
  if (!db) await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      const orgs = request.result || [];
      // Sort by created_at descending
      orgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(orgs);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Get unprocessed organizations
export async function getUnprocessedOrganizations() {
  if (!db) await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('processed');
    const request = index.getAll('');

    request.onsuccess = () => {
      const orgs = request.result || [];
      orgs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      resolve(orgs);
    };
    
    request.onerror = () => reject(request.error);
  });
}

// Add organization
export async function addOrganization(org) {
  if (!db) await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    
    const orgData = {
      name: org.name || '',
      domain: org.domain || '',
      industry: org.industry || '',
      employees: org.employees || '',
      location: org.location || '',
      revenue: org.revenue || '',
      description: org.description || '',
      processed: org.processed || '',
      error_message: org.error_message || '',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const request = objectStore.add(orgData);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Update organization
export async function updateOrganization(id, updates) {
  if (!db) await initDatabase();
  
  return new Promise(async (resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    
    // Get existing record
    const getRequest = objectStore.get(id);
    
    getRequest.onsuccess = () => {
      const org = getRequest.result;
      if (!org) {
        reject(new Error('Organization not found'));
        return;
      }
      
      // Update fields
      Object.keys(updates).forEach(key => {
        org[key] = updates[key];
      });
      org.updated_at = new Date().toISOString();
      
      // Save updated record
      const putRequest = objectStore.put(org);
      putRequest.onsuccess = () => resolve(true);
      putRequest.onerror = () => reject(putRequest.error);
    };
    
    getRequest.onerror = () => reject(getRequest.error);
  });
}

// Delete organization
export async function deleteOrganization(id) {
  if (!db) await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Check if organization exists by domain
export async function organizationExists(domain) {
  if (!db || !domain) return false;
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('domain');
    const request = index.get(domain);

    request.onsuccess = () => resolve(!!request.result);
    request.onerror = () => reject(request.error);
  });
}

// Import organizations from file data
export async function importOrganizations(organizations) {
  if (!db) await initDatabase();
  
  let imported = 0;
  
  for (const org of organizations) {
    // Skip if already exists
    if (org.domain && await organizationExists(org.domain)) {
      continue;
    }
    
    try {
      await addOrganization(org);
      imported++;
    } catch (err) {
      console.error('Failed to import organization:', err);
    }
  }
  
  return imported;
}

// Clear all organizations
export async function clearAllOrganizations() {
  if (!db) await initDatabase();
  
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

// Export database as JSON
export async function exportDatabaseAsJSON() {
  return await getAllOrganizations();
}

// Get statistics
export async function getStatistics() {
  if (!db) await initDatabase();
  
  const orgs = await getAllOrganizations();
  
  return {
    total: orgs.length,
    processed: orgs.filter(o => o.processed === 'yes').length,
    unprocessed: orgs.filter(o => !o.processed || o.processed === '').length,
    errors: orgs.filter(o => o.processed === 'error').length
  };
}