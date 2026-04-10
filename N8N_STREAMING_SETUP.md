# N8N Email Streaming Setup Guide

Explains how to wire your n8n workflow to stream emails to the frontend in real-time.

## Overview

- Sends emails to frontend one by one as they're generated
- No waiting for all emails to be processed
- Real-time display in the UI

## Recommended Approach: HTTP Request Node

Use the native n8n **HTTP Request** node instead of a Code node with `fetch()` — avoids fetch errors in n8n cloud.

### Workflow Connection

```
Structure output → HTTP Request (Stream to Frontend) → Code (Pass Through) → Send emails → Update labels
```

### Node 1: HTTP Request — Stream to Frontend

| Setting | Value |
|---------|-------|
| Method | POST |
| URL | `http://localhost:3001/api/emails/stream-email` |
| Body | JSON (see below) |
| Timeout | 10000 |
| Position | After "Structure output" node |

**JSON Body:**
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

### Node 2: Code — Pass Through

**Mode:** Run Once for Each Item

```javascript
// Pass the original email data to the next node (Send emails)
const email = $('Structure output').item.json;
return { json: email };
```

---

## Alternative: Code Node with fetch()

If you prefer a single Code node instead:

```javascript
const email = $json;

const response = await fetch('http://localhost:3001/api/emails/stream-email', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    lead_id: email.lead_id,
    email: email.email,
    first_name: email.first_name,
    email_stage: email.email_stage,
    subject: email.subject,
    body: email.body,
    timestamp: new Date().toISOString()
  })
});

if (!response.ok) {
  throw new Error(`Failed to stream email: ${response.status}`);
}

return { json: email };
```

---

## Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/emails/stream-email` | POST | Receives individual emails from n8n, queues them for review |
| `/api/email-queue/pending` | GET | Returns emails pending approval |
| `/api/emails/decision` | POST | Approve or decline a queued email |

## Troubleshooting

**Emails not appearing in the UI?**
1. Check that the backend server is running on port 3001
2. Check n8n workflow execution logs
3. Verify the HTTP Request node is not failing silently

**N8N can't reach localhost?**

If n8n is cloud-hosted, you need a public URL for your backend. Use Cloudflare Tunnel — see [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md).
Then update the URL in the HTTP Request node to your tunnel URL.
