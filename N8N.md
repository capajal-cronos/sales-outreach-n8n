# N8N Integration

Two wiring points between this app and n8n:
1. **Streaming** — n8n pushes generated emails to the backend as they're produced.
2. **Approval webhook** — frontend sends approve/decline decisions back to n8n.

If n8n runs in the cloud, it also needs a public URL to reach your localhost — covered at the bottom.

---

## 1. Email Streaming (n8n → backend)

**Workflow connection:**
```
Structure output → HTTP Request (Stream to Frontend) → Code (Pass Through) → Send emails
```

### HTTP Request node

| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `http://localhost:3001/api/emails/stream-email` (or your Cloudflare tunnel URL) |
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

### Backend endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/emails/stream-email` | POST | Queue email for review |
| `/api/email-queue/pending` | GET | List pending emails |
| `/api/emails/decision` | POST | Approve/decline |

---

## 2. Approval Webhook (frontend → n8n)

### Webhook node

| Setting | Value |
|---------|-------|
| Method | POST |
| Path | `email-approval` |
| Full URL | `https://your-n8n.app.n8n.cloud/webhook/email-approval` |

Make sure `VITE_N8N_BASE_URL` in `.env` points at your n8n webhook base
(`https://your-n8n.app.n8n.cloud/webhook`). The approval endpoint is derived
from it as `${VITE_N8N_BASE_URL}/email-approval`.

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

**Pipedrive label mapping:**
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

---

## 3. Cloudflare Tunnel (only if n8n is cloud-hosted)

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

```bash
cloudflared tunnel login
cloudflared tunnel create sales-outreach-n8n
cloudflared tunnel route dns sales-outreach-n8n api.yourdomain.com
```

Or use the [Zero Trust dashboard](https://one.dash.cloudflare.com/) → **Access → Tunnels → Configure → Public Hostname**, point the service to `http://localhost:3001`.

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

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Emails not appearing in UI | Backend running on port 3001? HTTP Request node succeeding? |
| n8n can't reach localhost | Use Cloudflare Tunnel (section 3) |
| Webhook not firing | Check `VITE_N8N_BASE_URL` in `.env`, verify webhook is active in n8n |
| Email not sending after approval | Check IF node condition and SMTP credentials |
| `tunnel credentials not found` | Re-run `cloudflared tunnel login` |
| Tunnel URL returns error | Check tunnel is **Healthy** in Cloudflare dashboard |
| Port 3001 busy | Change `PORT` in `.env` |
