# Setup Guide

Five steps. Should take ~15 minutes.

## 1. Prerequisites

Install these first:

| Tool | Version | Check |
|------|---------|-------|
| [Node.js](https://nodejs.org/) | 18 or higher | `node -v` |
| [n8n](https://n8n.io/) account | any | log in |
| [Pipedrive](https://www.pipedrive.com/) account | any | log in |

Optional (only if your n8n is cloud-hosted and the app runs on localhost):
- [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

## 2. Run the installer

From the project folder:

```bash
./setup.sh
```

It will:
1. Install dependencies (`npm install`)
2. Create `.env` from the template
3. Prompt for your **Pipedrive API token** and **n8n webhook base URL**
4. Create the required Pipedrive custom fields and lead labels in your account

### Where to get the values

- **Pipedrive API token** — Pipedrive → your avatar → *Personal preferences* → *API* → copy the token
- **n8n webhook base URL** — In n8n, open any webhook node and copy the URL **up to and including `/webhook`** (no trailing slash). Example: `https://acme.app.n8n.cloud/webhook`

## 3. Import the n8n workflows

The `n8n/` folder contains the workflow exports.

For each `.json` file:

1. In n8n: **Workflows → Import from File**
2. Pick the file
3. For every node marked "credential required", click it and bind it to
   a credential in your own n8n account:
   - **Pipedrive** node → your Pipedrive API credential
   - **HTTP Request** nodes hitting Apollo / OpenAI / SMTP → your own keys
4. **Activate** the workflow (top-right toggle)

See `n8n/README.md` for the full list of expected webhook paths and a
curl-based smoke test.

## 4. (Optional) Cloudflare Tunnel

Skip this if your n8n runs on the same machine as the app, or if you're
self-hosting both.

If n8n is cloud-hosted, it can't reach `http://localhost:3001`. Cloudflare
Tunnel gives your local API a permanent public URL, free. Full instructions
in [N8N.md](./N8N.md) section 3.

## 5. Start the app

```bash
npm start
```

Opens:
- Frontend: http://localhost:3000
- API: http://localhost:3001
- Tunnel (if configured)

Walk through the four-stage workflow in the UI:
**Find Organizations → Find People → Leads & Campaign → Monitor Responses**

## Troubleshooting

| Problem | Fix |
|---------|-----|
| "VITE_N8N_BASE_URL is not set" warning in browser console | Fill it in `.env`, then restart `npm start` |
| Pipedrive data doesn't load | Check `VITE_PIPEDRIVE_API_KEY` in `.env` |
| LinkedIn / headline columns empty | Re-run `npm run setup:pipedrive` — it auto-fills the field keys |
| n8n webhook returns 404 | Workflow not activated, or base URL has a typo |
| n8n can't reach localhost | Set up Cloudflare Tunnel (step 4) and put the tunnel URL in your n8n HTTP Request nodes |

## Re-running anything

All setup steps are idempotent:

- `./setup.sh` — safe to re-run; keeps existing `.env` values
- `npm run setup:pipedrive` — skips fields/labels that already exist
