# n8n Workflow Setup for Organizations File Upload

## Workflow Overview
This workflow receives a CSV/TXT/XLSX file with organization data and enriches it using Apollo.io's bulk_enrich API.

## Webhook Configuration
- **URL**: `https://aigeneers.app.n8n.cloud/webhook/organizations-file`
- **Method**: POST
- **Content-Type**: application/json

## Workflow Nodes

### 1. Webhook Node
- **Type**: Webhook
- **Path**: `/webhook/organizations-file`
- **Method**: POST
- **Response Mode**: Wait for response

### 2. Code Node - Parse File Content
Copy the code from `n8n-file-parser-code-node.js` into this node.

**What it does:**
- Parses CSV/TXT file content (splits by newlines and commas)
- Extracts name and domain columns
- Validates that domain exists (mandatory field)
- Prepares data for Apollo.io bulk_enrich API
- Returns array of domains and organizations

**Output:**
```json
{
  "domains": ["icapps.com", "besix.com", "bleckmann.com"],
  "organizations": [
    {"name": "icapps", "domain": "icapps.com"},
    {"name": "besix", "domain": "besix.com"},
    {"name": "bleckmann", "domain": "bleckmann.com"}
  ],
  "totalCount": 3,
  "fileName": "companies.csv"
}
```

### 3. HTTP Request Node - Apollo.io Bulk Enrich
- **Method**: POST
- **URL**: `https://api.apollo.io/api/v1/organizations/bulk_enrich`
- **Authentication**: Header Auth
  - **Header Name**: `X-Api-Key`
  - **Header Value**: `{{$env.APOLLO_API_KEY}}` (or your Apollo API key)
- **Body Content Type**: JSON
- **Body**:
```json
{
  "domains": {{ $json.domains }}
}
```

**Apollo.io Response Format:**
The API will return enriched organization data including:
- Company name
- Domain
- Industry
- Employee count
- Location
- Revenue
- Description
- LinkedIn URL
- etc.

### 4. Code Node - Format Response (Optional)
Transform Apollo.io response to match your frontend expectations:

```javascript
// Get the enriched organizations from Apollo.io
const apolloOrgs = $input.item.json.organizations || [];

// Format for frontend
const formattedOrgs = apolloOrgs.map(org => ({
  name: org.name || '',
  domain: org.website_url || org.primary_domain || '',
  industry: org.industry || '',
  employees: org.estimated_num_employees?.toString() || '',
  location: org.city && org.state ? `${org.city}, ${org.state}, ${org.country}` : org.country || '',
  revenue: org.annual_revenue ? `$${org.annual_revenue}` : '',
  description: org.short_description || '',
  linkedin: org.linkedin_url || '',
  processed: 'yes',
  error_message: ''
}));

return {
  json: {
    success: true,
    organizations: formattedOrgs,
    total: formattedOrgs.length
  }
};
```

### 5. Respond to Webhook Node
- **Type**: Respond to Webhook
- **Response Body**: `{{ $json }}`
- **Status Code**: 200

## Error Handling

Add an **Error Trigger** node to catch any errors:

```javascript
// Error Handler Code Node
return {
  json: {
    success: false,
    error: $json.error?.message || 'Unknown error occurred',
    organizations: []
  }
};
```

## Testing

1. Upload a CSV file with this format:
```csv
name,domain
icapps,icapps.com
besix,besix.com
bleckmann,bleckmann.com
```

2. The workflow should:
   - Parse the CSV
   - Send domains to Apollo.io
   - Return enriched organization data
   - Frontend saves to database

## Notes

- **Domain is mandatory**: Organizations without a domain will be skipped
- **Name is optional**: If not provided, Apollo.io will fill it from their database
- **XLSX files**: For Excel files, add a "Spreadsheet File" node before the Code node to convert base64 to JSON
- **Rate limits**: Apollo.io has rate limits - consider adding a delay or batch processing for large files
- **API Key**: Store your Apollo.io API key in n8n environment variables for security

## Apollo.io API Documentation
- Bulk Enrich: https://apolloio.github.io/apollo-api-docs/?shell#bulk-enrich-organizations
- API Key: Get from https://app.apollo.io/#/settings/integrations/api