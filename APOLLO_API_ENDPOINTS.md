# Apollo Organization Search API Endpoints

## Overview
These endpoints handle Apollo.io organization search results, allowing you to store, review, and accept/decline organizations.

---

## 1. Store Apollo Search Results
**Endpoint:** `POST /api/apollo/results`  
**URL:** `https://cronossalesoutreach.dpdns.org/api/apollo/results`

### Purpose
Receive and store organizations found by Apollo search for review.

### Request Body
Send an array of organizations (or single organization):
```json
[
  {
    "apollo_id": "54a122f669702d8aa1602e03",
    "name": "Company Name",
    "website_url": "https://example.com",
    "linkedin_url": "https://linkedin.com/company/example"
  }
]
```

### Response
```json
{
  "success": true,
  "message": "Stored 1 Apollo organizations for review",
  "count": 1
}
```

### n8n Configuration
In your n8n HTTP Request node, send:
```json
{
  "apollo_id": "{{ $json.organizations.id }}",
  "name": "{{ $json.organizations.name }}",
  "website_url": "{{ $json.organizations.website_url }}",
  "linkedin_url": "{{ $json.organizations.linkedin_url }}"
}
```

---

## 2. Get Pending Organizations
**Endpoint:** `GET /api/apollo/pending`  
**URL:** `https://cronossalesoutreach.dpdns.org/api/apollo/pending`

### Purpose
Retrieve all organizations awaiting review.

### Response
```json
{
  "success": true,
  "data": [
    {
      "apollo_id": "54a122f669702d8aa1602e03",
      "name": "Company Name",
      "website_url": "https://example.com",
      "linkedin_url": "https://linkedin.com/company/example",
      "status": "pending",
      "created_at": "2026-03-20T09:06:56.884Z"
    }
  ],
  "count": 1
}
```

---

## 3. Accept/Decline Organizations
**Endpoint:** `POST /api/apollo/decisions`  
**URL:** `https://cronossalesoutreach.dpdns.org/api/apollo/decisions`

### Purpose
Process user decisions on Apollo results (accept or decline).

### Request Body
```json
{
  "decisions": [
    { "apollo_id": "54a122f669702d8aa1602e03", "action": "accept" },
    { "apollo_id": "673090f1cfd91b000117d200", "action": "decline" }
  ]
}
```

### Response
```json
{
  "success": true,
  "message": "Processed 1 accepted and 1 declined organizations",
  "accepted": [
    {
      "id": 1,
      "name": "Company Name",
      "domain": "https://example.com",
      "linkedin": "https://linkedin.com/company/example",
      "apollo_id": "54a122f669702d8aa1602e03"
    }
  ],
  "acceptedCount": 1,
  "declinedCount": 1
}
```

---

## 4. Clear Pending Queue
**Endpoint:** `DELETE /api/apollo/pending`  
**URL:** `https://cronossalesoutreach.dpdns.org/api/apollo/pending`

### Purpose
Clear all pending Apollo organizations (reset the queue).

### Response
```json
{
  "success": true,
  "message": "Apollo pending queue cleared"
}
```

### Usage
```bash
curl -X DELETE https://cronossalesoutreach.dpdns.org/api/apollo/pending
```

---

## Workflow

1. **n8n sends Apollo results** → `POST /api/apollo/results`
2. **Organizations stored** in pending queue
3. **User reviews** in UI (automatically loads from `GET /api/apollo/pending`)
4. **User accepts/declines** → `POST /api/apollo/decisions`
5. **Accepted organizations** added to main database
6. **Optional: Clear queue** → `DELETE /api/apollo/pending`

---

## Files
- **Pending Queue:** `data/apollo_pending.json`
- **Main Database:** `data/organizations.json`