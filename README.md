# LeadFlow Pro

React + Express app for managing sales outreach via n8n. Four-stage workflow:
**Find Organizations → Find People → Leads & Campaign → Monitor Responses**

**New here? Start with [SETUP.md](./SETUP.md) — 5 steps, ~15 minutes.**

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env` (see `.env.example` for the full list — key values):
```env
VITE_N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook
VITE_PIPEDRIVE_API_KEY=your_pipedrive_api_key
CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n
CLOUDFLARE_TUNNEL_URL=https://your-tunnel-url.com
PORT=3001
```

### Pipedrive one-time setup

The n8n workflow expects specific custom fields on persons/organizations and a set
of lead labels. Run this once against the target Pipedrive account:

```bash
npm run setup:pipedrive
```

It creates (and skips if already present):
- **Person fields:** `linkedin_url`, `headline`, `seniority`, `address`
- **Organization fields:** `company_description`, `apollo_id`
- **Lead labels:** `first_mail`, `second_mail`, `third_mail`, `last_mail`, `answered`

On success it writes the generated field keys into `.env` automatically
(`VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY`, `VITE_PIPEDRIVE_PERSON_HEADLINE_KEY`,
`VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY`, `VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY`)
— existing values are replaced in place, other entries untouched. It also
prints a `stageToLabelMap` block ready to paste into the n8n "Update
Pipedrive Label" node (see [n8n/README.md](./n8n/README.md)).

If n8n runs in the cloud it needs a public URL to reach your localhost.
Cloudflare Tunnel is the project default (other options listed in
[n8n/README.md → Exposing the local API to n8n](./n8n/README.md#exposing-the-local-api-to-n8n)).

## Run

```bash
npm start
```

Starts:
- Frontend: http://localhost:3000
- API: http://localhost:3001
- Cloudflare Tunnel (permanent public URL)

## Scripts

| Command | Purpose |
|---------|---------|
| `npm start` | Frontend + API + Tunnel |
| `npm run dev` | Frontend only |
| `npm run server` | API only |
| `npm run tunnel` | Tunnel only |
| `npm run setup:pipedrive` | Create Pipedrive custom fields + lead labels |
| `npm run db:up` | Start the local Postgres container |
| `npm run db:down` | Stop the local Postgres container (data persists) |
| `npm run db:reset` | Nuke the Postgres volume and restart fresh |
| `npm run db:migrate` | Apply `db/init.sql` to the configured `DATABASE_URL` |
| `npm run build` | Production build |

## Storage

State lives in one of two backends, picked via `DB_DRIVER`:

- **`json` (default)** — the four `data/*.json` files. Single-process only,
  fine for local development.
- **`postgres`** — a real database via the `pg` library. Required for any
  multi-instance hosting (Cloud Run, etc.).

To run locally on Postgres:

```bash
docker compose up -d postgres            # boot the container
# .env:
#   DB_DRIVER=postgres
#   DATABASE_URL=postgres://leadflow:leadflow_dev_password@127.0.0.1:5432/leadflow
npm start
```

Schema lives in [`db/init.sql`](./db/init.sql). It runs automatically the
first time the Docker volume is created; for any other target run
`npm run db:migrate`.

## Project Structure

```
server.js              # Express API
start-cloudflare.js    # Cloudflare Tunnel launcher
scripts/
└── setupPipedrive.js  # One-time Pipedrive field/label provisioning
src/
├── main.jsx           # React entry point
├── App.jsx            # Root component, polling, cross-step state
├── api/
│   ├── serverDatabase.js       # JSON-on-disk stores + reply parsing
│   └── organizationEndpoint.js # Apollo review handlers
├── components/        # One component per workflow step (see below)
└── config/
    └── n8n.js         # Derives all 9 webhook URLs from VITE_N8N_BASE_URL
data/                  # JSON "databases", auto-created on startup
n8n/                   # Workflow exports + Code-node helpers (see n8n/README.md)
```

### What each file does

**Backend**

| File | Responsibility |
|------|----------------|
| `server.js` | Express app. Mounts every `/api/*` route, polls Pipedrive for enriched leads in `/api/leads`, forwards approve/decline decisions to n8n's `email-approval` webhook, and keeps an in-memory ring of workflow errors. |
| `start-cloudflare.js` | Spawns `cloudflared tunnel --url http://localhost:$PORT run $TUNNEL_NAME`, filters reconnect noise out of stderr, and shuts the child down on SIGINT/SIGTERM. |
| `scripts/setupPipedrive.js` | Idempotently creates the four person fields, two organization fields, and five lead labels the workflow depends on. Writes the generated field keys back into `.env` and prints the `stageToLabelMap` for the n8n approval workflow. |
| `src/api/serverDatabase.js` | Data-access layer for the four JSON stores in `data/` (email queue, Apollo pending, sent-mail archive, responses). Also owns the multi-language reply-parsing logic that strips Outlook/Gmail quoted threads and signatures from incoming replies before storage. |
| `src/api/organizationEndpoint.js` | Request handlers for `/api/apollo/*` — validates the Apollo payload shapes n8n can send, then delegates to `serverDatabase.js`. |

**Frontend**

| File | Responsibility |
|------|----------------|
| `src/App.jsx` | Holds workflow state, mirrors it to `localStorage`, polls `/api/email-queue/pending`, `/api/responses`, and `/api/workflow-errors`, and unblocks per-lead "campaign pending" state when an error arrives or grace timeout expires. |
| `src/config/n8n.js` | Reads `VITE_N8N_BASE_URL` and exposes the nine endpoint URLs as `N8N_ENDPOINTS`. Falls back to a deliberately-broken host so missing config produces an obvious error instead of silently hitting localhost. |
| `src/components/WorkflowProgress.jsx` | Sidebar with the four-step progress nav and per-step counts. |
| `src/components/OrganizationSearch.jsx` | Step 1. Three search modes (manual domain/name, filter-based, Excel upload), Apollo review queue, accept/decline → `/apollo-accepted-organizations`. |
| `src/components/PeopleFinder.jsx` | Step 2. Lists Pipedrive persons + organizations with module-level caches that survive tab switches; calls `/find-people`, `/save-people`, `/make-leads`. |
| `src/components/LeadManagement.jsx` | Step 3. Daily-cap and cooldown controls, prompt template, dispatches `/send-leads-mails`. |
| `src/components/ResponseMonitor.jsx` | Step 4. Displays replies from `/api/responses`, fixes Windows-1252 mojibake, persists read/archived/status state in localStorage. |

**Data files** (auto-created in `data/`)

| File | Owner | Contents |
|------|-------|----------|
| `email_queue.json` | `serverDatabase.js` | Drafts queued by n8n, awaiting approval. Cleared on approve/decline. |
| `apollo_pending.json` | `serverDatabase.js` | Apollo orgs awaiting accept/decline. Wiped on server start. |
| `sent_emails.json` | `serverDatabase.js` | Persistent archive of approved emails — used to recover the original body when a reply arrives. |
| `responses.json` | `serverDatabase.js` | Cleaned incoming replies (newest first). |

## Key API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/api/leads` | Pipedrive leads (enriched with person email + label) |
| POST | `/api/apollo/results` | n8n posts Apollo search results |
| GET | `/api/apollo/pending` | List Apollo orgs awaiting review |
| POST | `/api/apollo/decisions` | Accept/decline Apollo orgs |
| POST | `/api/organization/success` | n8n marks org added to Pipedrive |
| POST | `/api/organization/error` | n8n reports org failure |
| POST | `/api/email-queue` | n8n queues a generated email for review |
| GET | `/api/email-queue/pending` | Pending emails for the UI |
| POST | `/api/emails/decision` | Approve/decline email (forwards to n8n `email-approval`) |
| POST | `/api/responses` | n8n posts a detected reply |
| GET | `/api/responses` | Replies for the UI |
| POST | `/api/workflow-errors` | n8n reports a workflow failure |
| GET | `/api/workflow-errors` | Errors for the UI banner |

## n8n Integration

n8n workflow exports, webhook contracts, streaming/approval wiring,
Cloudflare Tunnel setup, and troubleshooting all live in
[n8n/README.md](./n8n/README.md).
