# Organization API Documentation

This API allows n8n workflows to interact with the organization database.

## Base URL
```
http://localhost:3001
```

## Endpoints

### 1. Health Check
Check if the API server is running.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "ok",
  "message": "Organization API is running"
}
```

---

### 2. Add Organization with Error Status
Use this endpoint when n8n workflow fails to process an organization.

**Endpoint:** `POST /api/organization/error`

**Request Body:**
```json
{
  "name": "Acme Corporation",
  "domain": "acme.com",
  "industry": "Technology",
  "employees": "500-1000",
  "location": "San Francisco, CA",
  "revenue": "$50M-$100M",
  "description": "Leading tech company",
  "error": "Failed to find contact information"
}
```

**Required Fields:**
- Either `name` or `domain` (at least one is required)

**Optional Fields:**
- `industry`
- `employees`
- `location`
- `revenue`
- `description`
- `error` (error message describing what went wrong)

**Response (Success - New Organization):**
```json
{
  "success": true,
  "message": "Organization added with error status",
  "id": 123
}
```

**Response (Success - Existing Organization Updated):**
```json
{
  "success": true,
  "message": "Organization updated with error status",
  "id": 123
}
```

**Response (Error):**
```json
{
  "success": false,
  "error": "Either name or domain is required"
}
```

---

### 3. Mark Organization as Successfully Processed
Use this endpoint when n8n workflow successfully processes an organization.

**Endpoint:** `POST /api/organization/success`

**Request Body:**
```json
{
  "domain": "acme.com"
}
```

OR

```json
{
  "id": 123
}
```

**Required Fields:**
- Either `domain` or `id` (at least one is required)

**Response (Success):**
```json
{
  "success": true,
  "message": "Organization marked as processed",
  "id": 123
}
```

**Response (Error - Not Found):**
```json
{
  "success": false,
  "error": "Organization not found"
}
```

---

## Usage in n8n

### Example: HTTP Request Node for Error Handling

1. Add an **HTTP Request** node after a failed operation
2. Configure:
   - **Method:** POST
   - **URL:** `http://localhost:3001/api/organization/error`
   - **Body Content Type:** JSON
   - **Body:**
   ```json
   {
     "name": "{{ $json.organization_name }}",
     "domain": "{{ $json.organization_domain }}",
     "industry": "{{ $json.industry }}",
     "employees": "{{ $json.employees }}",
     "location": "{{ $json.location }}",
     "error": "{{ $json.error_message }}"
   }
   ```

### Example: HTTP Request Node for Success

1. Add an **HTTP Request** node after successful processing
2. Configure:
   - **Method:** POST
   - **URL:** `http://localhost:3001/api/organization/success`
   - **Body Content Type:** JSON
   - **Body:**
   ```json
   {
     "domain": "{{ $json.organization_domain }}"
   }
   ```

---

## Running the API Server

### Install Dependencies
```bash
npm install
```

### Start Both Frontend and API Server
```bash
npm start
```

This will start:
- Frontend (Vite): http://localhost:3000
- API Server: http://localhost:3001

### Start Only API Server
```bash
npm run server
```

---

## Database Schema

Organizations are stored in IndexedDB with the following fields:

- `id` - Auto-incremented primary key
- `name` - Organization name
- `domain` - Organization domain
- `industry` - Industry type
- `employees` - Employee count range
- `location` - Geographic location
- `revenue` - Revenue range
- `description` - Organization description
- `processed` - Status: `''` (unprocessed), `'yes'` (processed), `'error'` (failed)
- `error_message` - Error description (when processed = 'error')
- `created_at` - Creation timestamp
- `updated_at` - Last update timestamp

---

## Error Handling

All endpoints return appropriate HTTP status codes:

- `200` - Success (update)
- `201` - Success (created)
- `400` - Bad Request (missing required fields)
- `404` - Not Found (organization doesn't exist)
- `500` - Internal Server Error

Error responses include a descriptive message:
```json
{
  "success": false,
  "error": "Descriptive error message"
}