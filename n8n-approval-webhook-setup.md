# N8N Email Approval Webhook Setup

This guide explains how to set up the approval/decline workflow in n8n to receive decisions from the frontend.

## Overview

When a user approves or declines an email in the frontend:
1. Frontend sends decision to backend (`POST /api/emails/decision`)
2. Backend forwards decision to n8n webhook
3. N8n receives the decision and processes accordingly (send email or skip)

## N8N Webhook Configuration

### Step 1: Create Webhook Node

**Node Name**: Email Approval Webhook
**Node Type**: Webhook
**HTTP Method**: POST
**Path**: `email-approval` (or your preferred path)

**Full Webhook URL**: 
```
https://aigeneers.app.n8n.cloud/webhook/email-approval
```

### Step 2: Add to .env File

Add this to your `.env` file:
```env
N8N_APPROVAL_WEBHOOK_URL=https://aigeneers.app.n8n.cloud/webhook/email-approval
```

## Webhook Payload Structure

The webhook receives this JSON payload:

```json
{
  "lead_id": "12345",
  "decision": "approve",  // or "decline"
  "email_data": {
    "id": 1,
    "lead_id": "12345",
    "email": "john@example.com",
    "first_name": "John",
    "email_stage": "first_mail",
    "subject": "Introduction to our services",
    "body": "Hi John,\n\nI noticed...",
    "status": "pending",
    "created_at": "2026-04-08T07:00:00.000Z"
  },
  "timestamp": "2026-04-08T07:30:00.000Z"
}
```

## N8N Workflow Logic

### Option 1: Simple Approval Flow

```
Webhook (Email Approval)
    ↓
IF Node (Check Decision)
    ↓ (if approved)
Send Email Node
    ↓
Update Pipedrive Label
    ↓ (if declined)
Log/Skip
```

### Option 2: Queue-Based Flow

```
Webhook (Email Approval)
    ↓
Code Node (Process Decision)
    ↓
IF Node (Check Decision)
    ↓ (if approved)
Send Email Node
    ↓
Update Pipedrive Label
    ↓
HTTP Request (Notify Backend)
```

## Code Node Example (Process Decision)

```javascript
// Extract decision data
const decision = $json.decision;
const emailData = $json.email_data;
const leadId = $json.lead_id;

// Log the decision
console.log(`Decision for lead ${leadId}: ${decision}`);

// Pass through the data
return {
  json: {
    ...emailData,
    decision: decision,
    approved: decision === 'approve',
    timestamp: $json.timestamp
  }
};
```

## IF Node Configuration (Check Decision)

**Condition**: 
- Field: `{{ $json.decision }}`
- Operation: `equals`
- Value: `approve`

**Outputs**:
- True → Send Email
- False → Skip/Log

## Send Email Node Configuration

Use the email data from the webhook:

```
To: {{ $json.email }}
Subject: {{ $json.subject }}
Body: {{ $json.body }}
```

## Update Pipedrive Label Node

After sending, update the lead label:

```javascript
// Determine next label based on current stage
const stageToLabelMap = {
  'first_mail': '12b547a0-2c1d-11f1-a6ca-e164cee6f75b',
  'second_mail': '2a51be70-2c1d-11f1-b1d2-75fba1151d1d',
  'third_mail': '3a32fd90-2c1d-11f1-b1d2-75fba1151d1d',
  'last_mail': '4262c900-2c1d-11f1-8c50-1fd51539be53'
};

const currentStage = $json.email_stage;
const labelId = stageToLabelMap[currentStage];

return {
  json: {
    lead_id: $json.lead_id,
    label_id: labelId
  }
};
```

## Complete Workflow Example

```
┌─────────────────────────────────────────────────────────┐
│ Main Email Generation Workflow                          │
├─────────────────────────────────────────────────────────┤
│ Webhook Trigger                                         │
│   ↓                                                     │
│ Get Leads from Pipedrive                                │
│   ↓                                                     │
│ Filter Leads                                            │
│   ↓                                                     │
│ Check Mail Stage                                        │
│   ↓                                                     │
│ Get Person & Organization Data                          │
│   ↓                                                     │
│ AI Generate Email                                       │
│   ↓                                                     │
│ Structure Output                                        │
│   ↓                                                     │
│ HTTP Request (Stream to Frontend) ← Shows in UI         │
│   ↓                                                     │
│ Code (Pass Through)                                     │
│   ↓                                                     │
│ WAIT HERE (Email added to queue in backend)             │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ Approval Webhook Workflow (Separate)                    │
├─────────────────────────────────────────────────────────┤
│ Webhook (Email Approval) ← Receives decision            │
│   ↓                                                     │
│ IF (Check if Approved)                                  │
│   ↓ (Yes)                    ↓ (No)                    │
│ Send Email                   Log Declined               │
│   ↓                                                     │
│ Update Pipedrive Label                                  │
│   ↓                                                     │
│ HTTP Request (Notify Backend - Optional)                │
└─────────────────────────────────────────────────────────┘
```

## Testing the Webhook

### 1. Test with cURL:

```bash
curl -X POST https://aigeneers.app.n8n.cloud/webhook/email-approval \
  -H "Content-Type: application/json" \
  -d '{
  "lead_id": "12345",
  "decision": "approve",
  "email_data": {
    "lead_id": "12345",
    "email": "john.doe@example.com",
    "email_stage": "first_mail",
    "subject": "...",
    "body": "..."
  },
  "timestamp": "2026-04-08T08:30:00.000Z"
}'
```

### 2. Test from Frontend:

1. Start the campaign
2. Wait for emails to appear in the UI
3. Click "Approve" or "Decline"
4. Check n8n execution logs

## Troubleshooting

### Webhook not receiving data?

1. Check the webhook URL in `.env` file
2. Verify n8n webhook is active
3. Check n8n execution logs
4. Test webhook with cURL

### Emails not sending after approval?

1. Check IF node condition
2. Verify email data is passed correctly
3. Check SMTP credentials in Send Email node
4. Review n8n execution logs

### Backend not forwarding to n8n?

1. Check `N8N_APPROVAL_WEBHOOK_URL` in `.env`
2. Verify backend server is running
3. Check backend console logs
4. Test the `/api/emails/decision` endpoint

## Production Considerations

1. **Add authentication** to the webhook
2. **Implement retry logic** for failed webhook calls
3. **Add timeout handling** for slow responses
4. **Log all decisions** for audit trail
5. **Add rate limiting** to prevent abuse
6. **Monitor webhook health** with alerts

## Next Steps

1. Create the webhook node in n8n
2. Update `.env` with webhook URL
3. Test with a single email
4. Monitor the execution logs
5. Deploy to production

---

For questions or issues, check the n8n execution logs and backend console.