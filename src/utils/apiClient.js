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
 * Delete organization
 */
export async function deleteOrganization(id) {
  await fetchAPI(`/organizations/${id}`, {
    method: 'DELETE',
  });
  return true;
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