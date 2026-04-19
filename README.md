# LeadFlow Pro

React + Express app for managing sales outreach via n8n. Four-stage workflow:
**Find Organizations → Find People → Leads & Campaign → Monitor Responses**

## Setup

```bash
npm install
cp .env.example .env
```

Edit `.env`:
```env
VITE_N8N_WEBHOOK_URL=your_n8n_webhook_url
VITE_PIPEDRIVE_API_KEY=your_pipedrive_api_key
N8N_APPROVAL_WEBHOOK_URL=https://your-n8n.app.n8n.cloud/webhook/email-approval
CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n
CLOUDFLARE_TUNNEL_URL=https://your-tunnel-url.com
PORT=3001
```

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
