import {
  storeApolloResults,
  getPendingApolloOrganizations,
  processApolloDecisions,
  clearApolloPending
} from './serverDatabase.js';

/**
 * Store Apollo search results
 * POST endpoint to receive organizations found by Apollo
 *
 * Expected body formats:
 * 1. Array: [{ apollo_id, name, website_url, linkedin_url }, ...]
 * 2. Object with organizations array: { organizations: [...], searchQuery: {...} }
 * 3. Single object: { apollo_id, name, website_url, linkedin_url }
 */
export async function handleApolloSearchResults(req, res) {
  try {
    let apolloOrgs;
    let bodyData = req.body;

    // Handle if body is a string (double-stringified JSON)
    if (typeof bodyData === 'string') {
      try {
        bodyData = JSON.parse(bodyData);
      } catch (e) {
        console.error('Failed to parse string body:', e);
      }
    }

    // Handle different input formats
    if (bodyData.organizations && Array.isArray(bodyData.organizations)) {
      // Format: { organizations: [...] }
      apolloOrgs = bodyData.organizations;
    } else if (Array.isArray(bodyData)) {
      // Format: [...]
      apolloOrgs = bodyData;
    } else {
      // Format: single object
      apolloOrgs = [bodyData];
    }

    if (apolloOrgs.length === 0) {
      return res.status(200).json({ success: true, message: 'No organizations found', count: 0, organizations: [] });
    }
    
    // Validate required fields
    for (let i = 0; i < apolloOrgs.length; i++) {
      const org = apolloOrgs[i];
      if (!org.apollo_id || !org.name) {
        console.error(`Validation failed for org at index ${i}:`, org);
        return res.status(400).json({
          success: false,
          error: `apollo_id and name are required for each organization. Failed at index ${i}`,
          received: org
        });
      }
    }

    // Store in a temporary table/collection for review
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