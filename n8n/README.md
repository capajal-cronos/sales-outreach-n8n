# n8n Workflows

This folder holds the n8n workflow exports that power the app. The client
imports them into their own n8n instance, reconnects the credentials, and
activates them.

## What the app expects

Nine webhook paths — all under the same base URL (`VITE_N8N_BASE_URL` in
`.env`, e.g. `https://your-n8n.app.n8n.cloud/webhook`):

| Path | Triggered by |
|------|--------------|
| `/organizations` | OrganizationSearch — manual domain/name search |
| `/organization-filters` | OrganizationSearch — filter-based search |
| `/organizations-file` | OrganizationSearch — Excel upload |
| `/apollo-accepted-organizations` | OrganizationSearch — approve Apollo results |
| `/find-people` | PeopleFinder — search persons in an org |
| `/save-people` | PeopleFinder — save persons to Pipedrive |
| `/make-leads` | PeopleFinder — convert persons to leads |
| `/send-leads-mails` | LeadManagement — send campaign |
| `/email-approval` | ResponseMonitor — approve/decline a drafted email |

All nine can live in one big workflow or be split across several — n8n doesn't
care as long as the webhook paths match.

## Export (developer side)

For each workflow in n8n:

1. Open the workflow
2. Top-right menu → **Download**
3. Save the `.json` into this folder

Recommended naming: `sales-outreach.json` (if single workflow), or
`organizations.json`, `people.json`, `campaign.json`, `approvals.json`
if split.

**Strip credentials before committing.** When you export, n8n omits secret
values but keeps credential *references* (IDs/names). That's fine — the
client will re-bind them to their own credentials on import. If you see any
real API keys or tokens in the JSON, delete them before committing.

## Import (client side)

In n8n:

1. Workflows → **Import from File**
2. Select the `.json` from this folder
3. For each node that shows a red "credential required" warning, click it
   and pick (or create) the matching credential in their own account:
   - Pipedrive API
   - Apollo API (or HTTP Request with their Apollo token)
   - SMTP / Gmail / whatever sender they use
   - OpenAI / Anthropic (if the email-generation node uses one)
4. **Activate** the workflow
5. Confirm each webhook URL — they should all share the same base
6. Put that base URL into `.env` as `VITE_N8N_BASE_URL`

## Sanity-check the webhooks

From the project root, after starting the app and n8n:

```bash
# Expects "VITE_N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook" in .env
source .env
curl -X POST "$VITE_N8N_BASE_URL/email-approval" \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"test","decision":"approve","email_data":{},"timestamp":"2025-01-01T00:00:00Z"}'
```

A 200 (even with a no-op body) means the base URL is wired up correctly.
