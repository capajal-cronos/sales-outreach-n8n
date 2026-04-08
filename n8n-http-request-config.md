# N8N HTTP Request Node Configuration

## Node 1: HTTP Request - Stream to Frontend

**Node Type**: HTTP Request
**Position**: After "Structure output" node

### Configuration:

**Authentication**: None

**Request Method**: POST

**URL**: `http://localhost:3001/api/emails/stream-email`

**Send Body**: Yes (JSON)

**Specify Body**: Using JSON

**JSON Body**:
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

**Options**:
- Ignore SSL Issues: No
- Timeout: 10000

### Headers:
- **Name**: Content-Type
- **Value**: application/json

---

## Node 2: Code - Pass Through Email Data

**Node Type**: Code
**Position**: After "HTTP Request - Stream to Frontend" node
**Mode**: Run Once for Each Item

### Code:
```javascript
// Get the original email data from the previous "Structure output" node
const email = $('Structure output').item.json;

// Pass it through for the next node (Send emails)
return { json: email };
```

---

## Workflow Connection:

```
Structure output → HTTP Request (Stream to Frontend) → Code (Pass Through) → Send emails → Update labels
```

This approach:
- ✅ Uses native n8n HTTP Request node (no fetch errors)
- ✅ Sends email data to backend for streaming
- ✅ Passes original email data to next node
- ✅ Cleaner separation of concerns