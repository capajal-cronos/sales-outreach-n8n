# n8n Workflows

This folder holds the n8n workflow exports that power the app. The client
imports them into their own n8n instance, reconnects the credentials, and
activates them.

## What the app expects

Nine webhook paths — all under the same base URL (`N8N_BASE_URL` in
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

## What's in this folder

Eleven workflow exports — nine are triggered by the frontend via webhooks,
one runs on incoming email, and one is a sub-workflow called by another.

### Frontend-triggered (webhook)

| File | Webhook | Purpose |
|------|---------|---------|
| `frontend manual search.json` | `POST /organizations` | OrganizationSearch — manual domain/name lookup. Tries Apollo by domain first, falls back to name search; pushes results to the frontend and saves them to the local DB. |
| `add organizations filter.json` | `POST /organization-filters` | OrganizationSearch — filter-based Apollo search (industry, size, location). Returns a candidate list to the frontend for the user to approve. |
| `add organizations file.json` | `POST /organizations-file` | OrganizationSearch — bulk Excel upload. Loops the rows, checks Pipedrive for existing orgs, enriches via Apollo, creates the new ones, saves to the local DB. |
| `accepted-apollo-orgs.json` | `POST /apollo-accepted-organizations` | OrganizationSearch — once the user approves Apollo results, enriches each org, creates it in Pipedrive, and saves it locally. |
| `find people in pipedrive.json` | `POST /find-people` | PeopleFinder — finds persons attached to a given organization, enriches them with Apollo, and returns the merged list to the frontend. |
| `save people in pipedrive.json` | `POST /save-people` | PeopleFinder — saves the persons the user selected to Pipedrive (skipping ones without an email) and creates a draft lead for each. |
| `make leads from people.json` | `POST /make-leads` | PeopleFinder — converts saved persons into Pipedrive leads, deduplicating against leads that already exist. |
| `mailing system.json` | `POST /send-leads-mails` | LeadManagement — kicks off a campaign. Fetches the selected leads, resolves their persons + organizations, derives the next email stage, and hands off to the parallel mail generation sub-workflow. |
| `approved mails.json` | `POST /email-approval` | ResponseMonitor — receives the user's approve/decline decision, sends the email if approved, and updates the lead's Pipedrive stage label (`first_mail` → `last_mail`). |

### Other triggers

| File | Trigger | Purpose |
|------|---------|---------|
| `response monitor - imap.json` | IMAP `Email Trigger` | Watches the inbox. When a reply comes in (`In-Reply-To` header present), matches the sender to a Pipedrive lead, posts the reply to `/api/responses` for the UI, and flips the lead label to "answered". |
| `parallel mail generation.json` | `Execute Workflow` (sub-workflow) | Called by `mailing system`. Runs an OpenRouter LLM agent per lead to draft the email, then POSTs it to `/api/email-queue` for review in the frontend. |

## Export (developer side)

For each workflow in n8n:

1. Open the workflow
2. Top-right menu → **Download**
3. Save the `.json` into this folder

Recommended naming: `sales-outreach.json` (if single workflow), or
`organizations.json`, `people.json`, `campaign.json`, `approvals.json`
if split. When a workflow contains a non-trivial Code node, also commit
its body as a sibling `.js` file so it diffs cleanly.

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
4. **Publish** the workflow
5. Confirm each webhook URL — they should all share the same base
6. Put that base URL into `.env` as `N8N_BASE_URL`

## Sanity-check the webhooks

From the project root, after starting the app and n8n:

```bash
# Expects "N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook" in .env
source .env
curl -X POST "$N8N_BASE_URL/email-approval" \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"test","decision":"approve","email_data":{},"timestamp":"2025-01-01T00:00:00Z"}'
```

A 200 (even with a no-op body) means the base URL is wired up correctly.

---

# Wiring details

Two integration points between this app and n8n:
1. **Streaming** — n8n pushes generated emails to the backend as they're produced.
2. **Approval webhook** — frontend sends approve/decline decisions back to n8n.

If n8n runs in the cloud, it also needs a public URL to reach your localhost —
see [Exposing the local API to n8n](#exposing-the-local-api-to-n8n).

## 1. Email Streaming (n8n → backend)

**Workflow connection:**
```
Structure output → HTTP Request (Stream to Frontend) → Code (Pass Through) → Send emails
```

### HTTP Request node

| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `http://localhost:3001/api/email-queue` (or your Cloudflare tunnel URL) |
| Timeout | 10000 |

**JSON body:**
```json
{
  "lead_id": "={{ $json.lead_id }}",
  "email": "={{ $json.email }}",
  "first_name": "={{ $json.first_name }}",
  "last_name": "={{ $json.last_name }}",
  "email_stage": "={{ $json.email_stage }}",
  "subject": "={{ $json.subject }}",
  "body": "={{ $json.body }}",
  "timestamp": "={{ $now.toISO() }}"
}
```

### Code node — Pass Through

**Mode:** Run Once for Each Item

```javascript
const email = $('Structure output').item.json;
return { json: email };
```

### Backend endpoints used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/email-queue` | POST | Queue email for review |
| `/api/email-queue/pending` | GET | List pending emails |
| `/api/emails/decision` | POST | Approve/decline |

## 2. Approval Webhook (frontend → n8n)

### Webhook node

| Setting | Value |
|---------|-------|
| Method | POST |
| Path | `email-approval` |
| Full URL | `https://your-n8n.app.n8n.cloud/webhook/email-approval` |

Make sure `N8N_BASE_URL` in `.env` points at your n8n webhook base
(`https://your-n8n.app.n8n.cloud/webhook`). The approval endpoint is derived
from it as `${N8N_BASE_URL}/email-approval`.

### Payload

```json
{
  "lead_id": "12345",
  "decision": "approve",
  "email_data": {
    "email": "john@example.com",
    "first_name": "John",
    "email_stage": "first_mail",
    "subject": "...",
    "body": "..."
  },
  "timestamp": "2026-04-08T07:30:00.000Z"
}
```

### Workflow

```
Webhook → IF (decision === "approve") → Send Email → Update Pipedrive Label
                                     ↓ (else) Skip
```

**IF node:** `{{ $json.decision }}` equals `approve`

**Pipedrive label mapping** (replace IDs with the ones printed by
`npm run setup:pipedrive`):
```javascript
const stageToLabelMap = {
  'first_mail':  '12b547a0-2c1d-11f1-a6ca-e164cee6f75b',
  'second_mail': '2a51be70-2c1d-11f1-b1d2-75fba1151d1d',
  'third_mail':  '3a32fd90-2c1d-11f1-b1d2-75fba1151d1d',
  'last_mail':   '4262c900-2c1d-11f1-8c50-1fd51539be53'
};
```

### Test

```bash
curl -X POST https://your-n8n.app.n8n.cloud/webhook/email-approval \
  -H "Content-Type: application/json" \
  -d '{"lead_id":"12345","decision":"approve","email_data":{"email":"test@example.com","email_stage":"first_mail","subject":"...","body":"..."},"timestamp":"2026-04-08T08:30:00.000Z"}'
```

## Exposing the local API to n8n

The hard requirement is just: **n8n must be able to POST to the Express API.**
The right setup depends on where n8n runs.

### When you don't need a tunnel

| Setup | Use as the HTTP Request URL |
|-------|------------------------------|
| Self-hosted n8n on the same machine | `http://localhost:3001` |
| Self-hosted n8n on the same LAN | `http://<your-lan-ip>:3001` |
| App deployed to a cloud host (Railway, Render, Fly, VPS) | the app's own public URL |

### When you need a tunnel (cloud-hosted n8n + app on localhost)

n8n.cloud (or any cloud-hosted n8n) can't reach `http://localhost:3001`
directly. Pick one:

| Option | Trade-offs |
|--------|------------|
| **Cloudflare Tunnel** (project default — instructions below) | Free, permanent URL, integrated into `npm start`. Requires a domain whose nameservers point at Cloudflare. |
| **ngrok** | Zero setup, no domain needed. Free tier has ephemeral URLs and rate limits. |
| **Tailscale Funnel** | Free for personal use, no domain needed. Requires Tailscale on the dev machine. |
| **localtunnel / bore / pinggy** | Quick and free. URLs are ephemeral. |

If you go with one of the alternatives, replace the tunnel URL in your
n8n HTTP Request nodes (and skip the rest of this section). You can also
drop the tunnel from `npm start` by running `npm run dev` and
`npm run server` in separate terminals — `start-cloudflare.js` is the
only piece that needs `cloudflared` installed.

## Cloudflare Tunnel

Gives your local API a permanent public URL. Free.

### Install

```bash
# macOS
brew install cloudflare/cloudflare/cloudflared
# Windows
winget install --id Cloudflare.cloudflared
# Linux
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb
```

### Set up

Prerequisite: `api.yourdomain.com`'s root domain must already be on
Cloudflare (nameservers pointed at Cloudflare). `route dns` writes a
CNAME there and will fail otherwise.

```bash
cloudflared tunnel login
cloudflared tunnel create sales-outreach-n8n
cloudflared tunnel route dns sales-outreach-n8n api.yourdomain.com
```

The hostname → tunnel mapping comes from `route dns`. The tunnel →
`localhost:3001` mapping is done at runtime by `npm run tunnel`
(`start-cloudflare.js` invokes `cloudflared tunnel --url http://localhost:$PORT run $TUNNEL_NAME`),
so you do not need to write a `config.yml` or add a public hostname in
the Zero Trust dashboard.

### .env

```env
CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n
CLOUDFLARE_TUNNEL_URL=https://api.yourdomain.com
PORT=3001
```

Test: `curl https://api.yourdomain.com/health` → `{"status":"ok",...}`

Use the tunnel URL in the HTTP Request node above.

### Useful commands

```bash
cloudflared tunnel list
cloudflared tunnel info sales-outreach-n8n
cloudflared tunnel delete sales-outreach-n8n
```

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Emails not appearing in UI | Backend running on port 3001? HTTP Request node succeeding? |
| n8n can't reach localhost | Use Cloudflare Tunnel (section above) |
| Webhook not firing | Check `N8N_BASE_URL` in `.env`, verify webhook is active in n8n |
| Email not sending after approval | Check IF node condition and SMTP credentials |
| `tunnel credentials not found` | Re-run `cloudflared tunnel login` |
| Tunnel URL returns error | Check tunnel is **Healthy** in Cloudflare dashboard |
| Port 3001 busy | Change `PORT` in `.env` |
