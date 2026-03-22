import {
  addOrganization,
  updateOrganization,
  organizationExists,
  getAllOrganizations,
  getOrganizationByDomain
} from './serverDatabase.js';

/**
 * Handle organization error from n8n
 * POST endpoint to add/update organization with error status
 * 
 * Expected body:
 * {
 *   name: string,
 *   domain: string,
 *   industry?: string,
 *   employees?: string,
 *   location?: string,
 *   revenue?: string,
 *   description?: string,
 *   error?: string  // Error message
 * }
 */
export async function handleOrganizationError(req, res) {
  try {
    const orgData = req.body;
    
    // Validate required fields
    if (!orgData.name && !orgData.domain) {
      return res.status(400).json({
        success: false,
        error: 'Either name or domain is required'
      });
    }

    // Check if organization already exists by domain
    let existingOrg = null;
    if (orgData.domain) {
      existingOrg = await getOrganizationByDomain(orgData.domain);
    }

    if (existingOrg) {
      // Update existing organization with error status
      await updateOrganization(existingOrg.id, {
        processed: 'error',
        error_message: orgData.error || 'Processing failed',
        updated_at: new Date().toISOString()
      });

      return res.status(200).json({
        success: true,
        message: 'Organization updated with error status',
        id: existingOrg.id
      });
    } else {
      // Add new organization with error status
      const newOrg = {
        name: orgData.name || '',
        domain: orgData.domain || '',
        industry: orgData.industry || '',
        employees: orgData.employees || '',
        location: orgData.location || '',
        revenue: orgData.revenue || '',
        description: orgData.description || '',
        processed: 'error',
        error_message: orgData.error || 'Processing failed'
      };

      const id = await addOrganization(newOrg);

      return res.status(201).json({
        success: true,
        message: 'Organization added with error status',
        id: id
      });
    }
  } catch (error) {
    console.error('Error handling organization error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Handle organization success from n8n
 * POST endpoint to update organization with success status
 * If organization doesn't exist, it will be created
 */
export async function handleOrganizationSuccess(req, res) {
  try {
    const orgData = req.body;
    const { domain, id, name } = orgData;
    
    if (!domain && !id) {
      return res.status(400).json({
        success: false,
        error: 'Either domain or id is required'
      });
    }

    // Find organization
    const { getOrganizationById } = await import('./serverDatabase.js');
    let org = id
      ? await getOrganizationById(id)
      : await getOrganizationByDomain(domain);

    if (!org) {
      // Organization doesn't exist, create it with success status
      const newOrg = {
        name: name || orgData.organization_name || '',
        domain: domain || orgData.website_url || '',
        industry: orgData.industry || '',
        employees: orgData.employees || '',
        location: orgData.location || '',
        revenue: orgData.revenue || '',
        description: orgData.description || '',
        processed: 'yes',
        error_message: ''
      };

      const newId = await addOrganization(newOrg);

      return res.status(201).json({
        success: true,
        message: 'Organization created and marked as processed',
        id: newId
      });
    }

    // Update existing organization with success status
    await updateOrganization(org.id, {
      processed: 'yes',
      error_message: '',
      updated_at: new Date().toISOString()
    });

    return res.status(200).json({
      success: true,
      message: 'Organization marked as processed',
      id: org.id
    });
  } catch (error) {
    console.error('Error handling organization success:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get all organizations
 * GET endpoint to retrieve all organizations
 */
export async function handleGetAllOrganizations(req, res) {
  try {
    const organizations = await getAllOrganizations();
    
    return res.status(200).json({
      success: true,
      data: organizations,
      count: organizations.length
    });
  } catch (error) {
    console.error('Error getting organizations:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get statistics
 * GET endpoint to retrieve database statistics
 */
export async function handleGetStatistics(req, res) {
  try {
    const { getStatistics } = await import('./serverDatabase.js');
    const stats = await getStatistics();
    
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Add organization (from UI)
 * POST endpoint to add a new organization
 */
export async function handleAddOrganization(req, res) {
  try {
    const orgData = req.body;
    
    // Validate required fields
    if (!orgData.name && !orgData.domain) {
      return res.status(400).json({
        success: false,
        error: 'Either name or domain is required'
      });
    }

    // Check if organization already exists by domain
    if (orgData.domain) {
      const existing = await getOrganizationByDomain(orgData.domain);
      if (existing) {
        return res.status(409).json({
          success: false,
          error: 'Organization with this domain already exists',
          existingId: existing.id
        });
      }
    }

    const id = await addOrganization(orgData);

    return res.status(201).json({
      success: true,
      message: 'Organization added successfully',
      id: id
    });
  } catch (error) {
    console.error('Error adding organization:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Import multiple organizations
 * POST endpoint to import organizations from file/array
 */
export async function handleImportOrganizations(req, res) {
  try {
    const { organizations } = req.body;
    
    if (!Array.isArray(organizations)) {
      return res.status(400).json({
        success: false,
        error: 'organizations must be an array'
      });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const org of organizations) {
      try {
        // Skip if already exists by domain
        if (org.domain) {
          const exists = await organizationExists(org.domain);
          if (exists) {
            skipped++;
            continue;
          }
        }
        
        await addOrganization(org);
        imported++;
      } catch (err) {
        errors.push({
          organization: org.name || org.domain,
          error: err.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Imported ${imported} organizations`,
      imported: imported,
      skipped: skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error importing organizations:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Delete organization
 * DELETE endpoint to remove an organization
 */
export async function handleDeleteOrganization(req, res) {
  try {
    const id = parseInt(req.params.id);
    
    if (isNaN(id)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid organization ID'
      });
    }

    const { deleteOrganization } = await import('./serverDatabase.js');
    await deleteOrganization(id);

    return res.status(200).json({
      success: true,
      message: 'Organization deleted successfully'
    });
  } catch (error) {
    if (error.message === 'Organization not found') {
      return res.status(404).json({
        success: false,
        error: 'Organization not found'
      });
    }
    
    console.error('Error deleting organization:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Store Apollo search results
 * POST endpoint to receive organizations found by Apollo
 *
 * Expected body:
 * {
 *   apollo_id: string,
 *   name: string,
 *   website_url: string,
 *   linkedin_url: string
 * }
 */
export async function handleApolloSearchResults(req, res) {
  try {
    const apolloOrgs = Array.isArray(req.body) ? req.body : [req.body];
    
    // Validate required fields
    for (const org of apolloOrgs) {
      if (!org.apollo_id || !org.name) {
        return res.status(400).json({
          success: false,
          error: 'apollo_id and name are required for each organization'
        });
      }
    }

    // Store in a temporary table/collection for review
    const { storeApolloResults } = await import('./serverDatabase.js');
    const stored = await storeApolloResults(apolloOrgs);

    return res.status(201).json({
      success: true,
      message: `Stored ${stored} Apollo organizations for review`,
      count: stored
    });
  } catch (error) {
    console.error('Error storing Apollo results:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Get pending Apollo organizations
 * GET endpoint to retrieve organizations awaiting review
 */
export async function handleGetPendingApolloOrgs(req, res) {
  try {
    const { getPendingApolloOrganizations } = await import('./serverDatabase.js');
    const pendingOrgs = await getPendingApolloOrganizations();
    
    return res.status(200).json({
      success: true,
      data: pendingOrgs,
      count: pendingOrgs.length
    });
  } catch (error) {
    console.error('Error getting pending Apollo organizations:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Accept or decline Apollo organizations
 * POST endpoint to process user decisions on Apollo results
 *
 * Expected body:
 * {
 *   decisions: [
 *     { apollo_id: string, action: 'accept' | 'decline' }
 *   ]
 * }
 */
export async function handleApolloDecisions(req, res) {
  try {
    const { decisions } = req.body;
    
    if (!Array.isArray(decisions)) {
      return res.status(400).json({
        success: false,
        error: 'decisions must be an array'
      });
    }

    const { processApolloDecisions } = await import('./serverDatabase.js');
    const result = await processApolloDecisions(decisions);

    return res.status(200).json({
      success: true,
      message: `Processed ${result.accepted} accepted and ${result.declined} declined organizations`,
      accepted: result.acceptedOrganizations,
      acceptedCount: result.accepted,
      declinedCount: result.declined
    });
  } catch (error) {
    console.error('Error processing Apollo decisions:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

/**
 * Clear all Apollo pending organizations
 * DELETE endpoint to reset the Apollo pending queue
 */
export async function handleClearApolloPending(req, res) {
  try {
    const { clearApolloPending } = await import('./serverDatabase.js');
    await clearApolloPending();
    
    return res.status(200).json({
      success: true,
      message: 'Apollo pending queue cleared'
    });
  } catch (error) {
    console.error('Error clearing Apollo pending:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}