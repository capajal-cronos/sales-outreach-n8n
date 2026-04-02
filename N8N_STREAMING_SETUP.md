# N8N Email Streaming Setup Guide

This guide explains how to modify your n8n workflow to stream emails to the frontend in real-time instead of sending them in a batch digest.

## Overview

The new streaming approach:
- ✅ Sends emails to frontend one by one as they're generated
- ✅ No waiting for all emails to be processed
- ✅ Real-time display in the UI
- ✅ Better user experience with live updates

## Changes Required in N8N Workflow

### 1. Replace the "Create digest" Node

**Old Node (to remove):**
- Node name: "Create digest"
- Type: Code
- Purpose: Aggregated all emails into one digest

**New Node (to add):**
- Node name: "Stream to Frontend"
- Type: Code
- Mode: Run once for each item
- Code: See `n8n-stream-email-code-node.js`

### 2. Update the Code Node

Replace the "Create digest" node with this code:

```javascript
// Send each email individually to the frontend via SSE
const email = $json;

// Send to backend API which will stream to frontend
const response = await fetch('http://localhost:3001/api/emails/stream-email', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
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

// Pass through the email data for further processing
return {
  json: email
};
```

### 3. Remove the "Send approval digest" Node

Since we're streaming emails individually, you no longer need:
- The "Send approval digest" node
- The "Approve batch?" node
- The "Split emails" node

### 4. Update Workflow Connections

**New Flow:**
```
Structure output → Stream to Frontend → Send emails → Update labels
```

**Old Flow (remove):**
```
Structure output → Create digest → Send approval digest → Approve batch? → Split emails → Send emails
```

### 5. Add Completion Signal (Optional)

After all emails are processed, you can send a completion signal:

Add a new Code node at the end:
```javascript
// Signal completion to frontend
await fetch('http://localhost:3001/api/emails/stream-complete', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    totalEmails: $input.all().length,
    timestamp: new Date().toISOString()
  })
});

return { json: { completed: true } };
```

## Backend Changes (Already Implemented)

The following endpoints have been added to `server.js`:

1. **SSE Endpoint**: `GET /api/emails/stream`
   - Establishes Server-Sent Events connection
   - Keeps connection alive for real-time updates

2. **Stream Email Endpoint**: `POST /api/emails/stream-email`
   - Receives individual emails from n8n
   - Broadcasts to all connected SSE clients

3. **Completion Endpoint**: `POST /api/emails/stream-complete`
   - Signals campaign completion
   - Closes SSE connections

## Frontend Changes (Already Implemented)

The `EmailCampaign.jsx` component now:
- Establishes SSE connection when campaign starts
- Displays emails in real-time as they arrive
- Shows live streaming indicator
- Displays email count and details
- Auto-scrolls to show new emails

## Testing the Setup

1. **Start the backend server:**
   ```bash
   npm run dev
   ```

2. **Open the frontend** and navigate to Email Campaign

3. **Trigger the campaign** - you should see:
   - "🔴 Live" indicator appears
   - Emails appear one by one as they're generated
   - Each email shows: recipient, subject, body, timestamp
   - Counter updates in real-time

4. **Check the browser console** for:
   - "Connected to email stream"
   - "Received email: {...}" for each email

## Troubleshooting

### Emails not appearing?

1. Check browser console for SSE connection errors
2. Verify backend server is running on port 3001
3. Check n8n workflow execution logs
4. Ensure the "Stream to Frontend" node is executing

### SSE connection drops?

- SSE connections can timeout after 30-60 seconds of inactivity
- The connection will auto-reconnect when a new campaign starts
- Check CORS settings if running on different domains

### N8N can't reach localhost?

If n8n is cloud-hosted, you'll need to:
1. Deploy your backend to a public URL
2. Update the fetch URL in the n8n code node
3. Update the SSE URL in `EmailCampaign.jsx`

## Production Considerations

For production deployment:

1. **Use environment variables** for API URLs
2. **Add authentication** to the streaming endpoints
3. **Implement rate limiting** on the stream endpoints
4. **Add error recovery** for failed SSE connections
5. **Consider WebSockets** for bidirectional communication
6. **Add email approval workflow** if needed

## Benefits of Streaming Approach

- ✅ **Immediate feedback**: See results as they happen
- ✅ **Better UX**: No waiting for batch completion
- ✅ **Scalability**: Process thousands of emails without timeout
- ✅ **Debugging**: Easier to spot issues in real-time
- ✅ **Flexibility**: Can add approval per email if needed

## Next Steps

1. Import the updated workflow to n8n
2. Test with a small batch of leads first
3. Monitor the streaming in the frontend
4. Add approval workflow if needed
5. Deploy to production

---

For questions or issues, check the console logs in both frontend and backend.