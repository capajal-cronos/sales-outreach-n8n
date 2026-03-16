// API client for communicating with the backend server
const API_BASE_URL = 'http://localhost:3001/api';

/**
 * Fetch wrapper with error handling
 */
async function fetchAPI(endpoint, options = {}) {
  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      ...options,
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error);
    throw error;
  }
}

/**
 * Initialize database (no-op for API, kept for compatibility)
 */
export async function initDatabase() {
  // No initialization needed for API client
  return true;
}

/**
 * Get all organizations
 */
export async function getAllOrganizations() {
  const response = await fetchAPI('/organizations');
  return response.data || [];
}

/**
 * Get unprocessed organizations
 */
export async function getUnprocessedOrganizations() {
  const allOrgs = await getAllOrganizations();
  return allOrgs.filter(org => !org.processed || org.processed === '');
}

/**
 * Add organization
 */
export async function addOrganization(org) {
  const response = await fetchAPI('/organizations', {
    method: 'POST',
    body: JSON.stringify(org),
  });
  return response.id;
}

/**
 * Update organization
 */
export async function updateOrganization(id, updates) {
  // For now, we'll get the org, update it, and send it back
  // In a real app, you'd have a PATCH endpoint
  const allOrgs = await getAllOrganizations();
  const org = allOrgs.find(o => o.id === id);
  
  if (!org) {
    throw new Error('Organization not found');
  }

  const updatedOrg = { ...org, ...updates };
  
  // Delete and re-add (simple approach)
  await deleteOrganization(id);
  await fetchAPI('/organizations', {
    method: 'POST',
    body: JSON.stringify(updatedOrg),
  });
  
  return true;
}

/**
 * Delete organization
 */
export async function deleteOrganization(id) {
  await fetchAPI(`/organizations/${id}`, {
    method: 'DELETE',
  });
  return true;
}

/**
 * Check if organization exists by domain
 */
export async function organizationExists(domain) {
  if (!domain) return false;
  
  const allOrgs = await getAllOrganizations();
  return allOrgs.some(org => org.domain === domain);
}

/**
 * Import organizations from file data
 */
export async function importOrganizations(organizations) {
  const response = await fetchAPI('/organizations/import', {
    method: 'POST',
    body: JSON.stringify({ organizations }),
  });
  return response.imported || 0;
}

/**
 * Clear all organizations (not implemented on backend yet)
 */
export async function clearAllOrganizations() {
  const allOrgs = await getAllOrganizations();
  
  for (const org of allOrgs) {
    await deleteOrganization(org.id);
  }
  
  return true;
}

/**
 * Export database as JSON
 */
export async function exportDatabaseAsJSON() {
  return await getAllOrganizations();
}

/**
 * Get statistics
 */
export async function getStatistics() {
  const response = await fetchAPI('/organizations/statistics');
  return response.data || {
    total: 0,
    processed: 0,
    unprocessed: 0,
    errors: 0
  };
}