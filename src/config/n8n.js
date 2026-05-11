// n8n endpoint URLs.
//
// The browser hits same-origin /api/n8n/* paths; the Express server
// forwards them to the real n8n webhook host (configured via the
// N8N_BASE_URL runtime env var on the server). This keeps the n8n URL
// out of the public bundle and makes it runtime-configurable — no
// rebuild needed to switch n8n environments.

export const N8N_ENDPOINTS = {
  organizations:               '/api/n8n/organizations',
  organizationFilters:         '/api/n8n/organization-filters',
  organizationsFile:           '/api/n8n/organizations-file',
  apolloAcceptedOrganizations: '/api/n8n/apollo-accepted-organizations',
  findPeople:                  '/api/n8n/find-people',
  savePeople:                  '/api/n8n/save-people',
  makeLeads:                   '/api/n8n/make-leads',
  sendLeadsMails:              '/api/n8n/send-leads-mails',
};
