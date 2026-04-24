// All n8n webhook URLs derived from a single base URL.
// Set VITE_N8N_BASE_URL in .env, e.g.:
//   VITE_N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook

// If VITE_N8N_BASE_URL is missing we use an obviously-broken host so fetch
// errors point at the real cause instead of silently hitting localhost:3000
// (which is what happens if the URL is just a relative path like "/find-people").
const MISSING_BASE = 'https://n8n-base-url-missing.invalid/webhook';
const RAW_BASE = (import.meta.env.VITE_N8N_BASE_URL || '').replace(/\/+$/, '');
const BASE = RAW_BASE || MISSING_BASE;

if (!RAW_BASE) {
  // eslint-disable-next-line no-console
  console.error(
    '[n8n config] VITE_N8N_BASE_URL is not set in .env.\n' +
    '  → Set it to e.g. https://your-n8n.app.n8n.cloud/webhook\n' +
    '  → Then restart the dev server (Vite only reads .env at startup).\n' +
    '  All n8n requests will fail with an "n8n-base-url-missing.invalid" error until this is fixed.'
  );
}

export const N8N_ENDPOINTS = {
  organizations:               `${BASE}/organizations`,
  organizationFilters:         `${BASE}/organization-filters`,
  organizationsFile:           `${BASE}/organizations-file`,
  apolloAcceptedOrganizations: `${BASE}/apollo-accepted-organizations`,
  findPeople:                  `${BASE}/find-people`,
  savePeople:                  `${BASE}/save-people`,
  makeLeads:                   `${BASE}/make-leads`,
  sendLeadsMails:              `${BASE}/send-leads-mails`,
  emailApproval:               `${BASE}/email-approval`,
};

export const N8N_BASE_URL = BASE;
