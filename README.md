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
`VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY`) — existing values are replaced in place,
other entries untouched. It also prints a `stageToLabelMap` block ready to
paste into the n8n "Update Pipedrive Label" node (see [N8N.md](./N8N.md)).

Cloudflare Tunnel is required if n8n runs in the cloud — see [N8N.md](./N8N.md).

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
| `npm run build` | Production build |

## Project Structure

```
src/
├── api/              # Express handlers + JSON storage
├── components/       # React components (one per workflow step)
└── main.jsx
server.js             # API server
start-cloudflare.js   # Tunnel launcher
data/                 # JSON databases (auto-created)
```

## n8n Integration

See [N8N.md](./N8N.md) for streaming, approval webhook, and Cloudflare Tunnel setup.

## Key API Endpoints

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/health` | Health check |
| GET | `/api/organizations` | List organizations |
| POST | `/api/organization/success` | n8n marks processed |
| POST | `/api/organization/error` | n8n reports error |
| POST | `/api/emails/stream-email` | n8n streams generated email |
| GET | `/api/email-queue/pending` | Pending emails for review |
| POST | `/api/emails/decision` | Approve/decline email |
| GET | `/api/responses` | Incoming replies |
