# N8N JSON Examples - Complete Guide

## Example 1: Sending Email Data from N8N to Backend (Streaming)

### N8N HTTP Request Node Configuration

**URL**: `http://localhost:3001/api/emails/stream-email`
**Method**: POST
**Body Type**: JSON

**JSON Body in N8N**:
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

**What N8N Actually Sends** (example):
```json
{
  "lead_id": "12345",
  "email": "john.doe@example.com",
  "first_name": "John",
  "last_name": "Doe",
  "email_stage": "first_mail",
  "subject": "Introduction to our AI solutions",
  "body": "Hi John,\n\nI noticed your company is working on...",
  "timestamp": "2026-04-08T08:30:00.000Z"
}
```

---

## Example 2: Sending Approval Decision from Backend to N8N

### Backend to N8N Webhook

**URL**: `https://aigeneers.app.n8n.cloud/webhook/email-approval`
**Method**: POST
**Headers**: `Content-Type: application/json`

**JSON Payload**:
```json
{
  "lead_id": "12345",
  "decision": "approve",
  "email_data": {
    "id": 1,
    "lead_id": "12345",
    "email": "john.doe@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "email_stage": "first_mail",
    "subject": "Introduction to our AI solutions",
    "body": "Hi John,\n\nI noticed your company is working on...",
    "status": "pending",
    "created_at": "2026-04-08T08:00:00.000Z"
  },
  "timestamp": "2026-04-08T08:30:00.000Z"
}
```

---

## Example 3: Testing with cURL

### Test Streaming Endpoint (N8N → Backend)

```bash
curl -X POST http://localhost:3001/api/emails/stream-email \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "12345",
    "email": "john.doe@example.com",
    "first_name": "John",
    "last_name": "Doe",
    "email_stage": "first_mail",
    "subject": "Introduction to our AI solutions",
    "body": "Hi John,\n\nI noticed your company is working on innovative AI projects. I would love to discuss how our solutions could help accelerate your development.\n\nBest regards",
    "timestamp": "2026-04-08T08:30:00.000Z"
  }'
```

### Test Approval Endpoint (Backend → N8N)

```bash
curl -X POST https://aigeneers.app.n8n.cloud/webhook/email-approval \
  -H "Content-Type: application/json" \
  -d '{
    "lead_id": "12345",
    "decision": "approve",
    "email_data": {
      "lead_id": "12345",
      "email": "john.doe@example.com",
      "first_name": "John",
      "email_stage": "first_mail",
      "subject": "Introduction to our AI solutions",
      "body": "Hi John,\n\nI noticed your company is working on..."
    },
    "timestamp": "2026-04-08T08:30:00.000Z"
  }'
```

---

## Example 4: N8N Webhook Response Handling

### In N8N Code Node (After Webhook)

```javascript
// Extract the approval decision
const decision = $json.decision;
const emailData = $json.email_data;
const emailStage = emailData.email_stage;

console.log(`Decision: ${decision} for lead ${emailData.lead_id} at stage ${emailStage}`);

// Determine next label based on current stage
const stageToLabelMap = {
  'first_mail': '12b547a0-2c1d-11f1-a6ca-e164cee6f75b',
  'second_mail': '2a51be70-2c1d-11f1-b1d2-75fba1151d1d',
  'third_mail': '3a32fd90-2c1d-11f1-b1d2-75fba1151d1d',
  'last_mail': '4262c900-2c1d-11f1-8c50-1fd51539be53'
};

return {
  json: {
    ...emailData,
    decision: decision,
    approved: decision === 'approve',
    next_label_id: stageToLabelMap[emailStage]
  }
};
```

---

## Example 5: Complete Flow with Real Data

### Step 1: N8N Generates Email
```json
{
  "lead_id": "67890",
  "email": "sarah.smith@techcorp.com",
  "first_name": "Sarah",
  "last_name": "Smith",
  "email_stage": "second_mail",
  "subject": "Following up on our conversation",
  "body": "Hi Sarah,\n\nI wanted to follow up on my previous email about our AI solutions.\n\nHave you had a chance to review the information I sent?\n\nBest regards"
}
```

### Step 2: N8N Sends to Backend (HTTP Request)
```
POST http://localhost:3001/api/emails/stream-email
Content-Type: application/json

{
  "lead_id": "67890",
  "email": "sarah.smith@techcorp.com",
  "first_name": "Sarah",
  "last_name": "Smith",
  "email_stage": "second_mail",
  "subject": "Following up on our conversation",
  "body": "Hi Sarah,\n\nI wanted to follow up...",
  "timestamp": "2026-04-08T09:00:00.000Z"
}
```

### Step 3: Backend Streams to Frontend (SSE)
```
data: {"type":"email","data":{"lead_id":"67890","email":"sarah.smith@techcorp.com","first_name":"Sarah","last_name":"Smith","email_stage":"second_mail","subject":"Following up on our conversation","body":"Hi Sarah,\n\nI wanted to follow up...","timestamp":"2026-04-08T09:00:00.000Z"}}
```

### Step 4: User Approves in Frontend
```
POST http://localhost:3001/api/emails/decision
Content-Type: application/json

{
  "lead_id": "67890",
  "decision": "approve",
  "email_data": {
    "lead_id": "67890",
    "email": "sarah.smith@techcorp.com",
    "first_name": "Sarah",
    "email_stage": "second_mail",
    "subject": "Following up on our conversation",
    "body": "Hi Sarah,\n\nI wanted to follow up..."
  }
}
```

### Step 5: Backend Forwards to N8N Webhook
```
POST https://aigeneers.app.n8n.cloud/webhook/email-approval
Content-Type: application/json

{
  "lead_id": "67890",
  "decision": "approve",
  "email_data": {
    "lead_id": "67890",
    "email": "sarah.smith@techcorp.com",
    "first_name": "Sarah",
    "email_stage": "second_mail",
    "subject": "Following up on our conversation",
    "body": "Hi Sarah,\n\nI wanted to follow up..."
  },
  "timestamp": "2026-04-08T09:05:00.000Z"
}
```

### Step 6: N8N Sends Email
```
To: sarah.smith@techcorp.com
Subject: Following up on our conversation
Body: Hi Sarah,

I wanted to follow up on my previous email about our AI solutions.

Have you had a chance to review the information I sent?

Best regards
```

### Step 7: N8N Updates Pipedrive Label
```
Lead ID: 67890
New Label: 2a51be70-2c1d-11f1-b1d2-75fba1151d1d (second_mail)
```

---

## Example 6: Error Handling

### If Backend Can't Reach N8N
```json
{
  "success": false,
  "error": "Failed to send decision to n8n: 500"
}
```

### If N8N Webhook Returns Error
```json
{
  "success": true,
  "message": "Email approved successfully",
  "lead_id": "12345",
  "decision": "approve",
  "note": "N8N webhook call failed but decision was recorded"
}
```

---

## Example 7: Postman Collection

### Request 1: Stream Email to Frontend
```
POST http://localhost:3001/api/emails/stream-email
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "lead_id": "test123",
  "email": "test@example.com",
  "first_name": "Test",
  "last_name": "User",
  "email_stage": "first_mail",
  "subject": "Test Email",
  "body": "This is a test email",
  "timestamp": "2026-04-08T10:00:00.000Z"
}
```

### Request 2: Send Approval Decision
```
POST http://localhost:3001/api/emails/decision
Headers:
  Content-Type: application/json
Body (raw JSON):
{
  "lead_id": "test123",
  "decision": "approve",
  "email_data": {
    "lead_id": "test123",
    "email": "test@example.com",
    "first_name": "Test",
    "email_stage": "first_mail",
    "subject": "Test Email",
    "body": "This is a test email"
  }
}
```

---

## Key Points

1. **N8N expressions** use `={{ $json.field_name }}` syntax
2. **email_stage** is crucial for determining next label
3. **timestamp** should be ISO 8601 format
4. **decision** must be either "approve" or "decline"
5. **lead_id** is used to track the email through the system

## Testing Checklist

- [ ] Test N8N → Backend streaming
- [ ] Verify email appears in frontend
- [ ] Test approve button
- [ ] Test decline button
- [ ] Verify N8N webhook receives decision
- [ ] Check email is sent (if approved)
- [ ] Verify Pipedrive label is updated
- [ ] Test error handling
