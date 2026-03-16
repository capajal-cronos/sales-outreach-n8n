# API Server Setup Guide

This guide will help you set up the Organization API server to work with your n8n workflows.

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn

## Installation Steps

### 1. Install Dependencies

Navigate to the project directory and install the required packages:

```bash
cd n8n-workflow-manager
npm install
```

This will install:
- `express` - Web server framework
- `cors` - Enable cross-origin requests
- `concurrently` - Run multiple commands simultaneously

### 2. Start the Application

You have two options:

#### Option A: Start Everything (Recommended)
Start both the frontend and API server together:

```bash
npm start
```

This will launch:
- **Frontend (Vite):** http://localhost:3000
- **API Server:** http://localhost:3001

#### Option B: Start Only the API Server
If you only need the API server:

```bash
npm run server
```

### 3. Verify the API is Running

Open your browser or use curl to check:

```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "message": "Organization API is running"
}
```


Expected response:
```json
{
  "success": true,
  "message": "Organization marked as processed",
  "id": 1
}
```

## Configuring n8n Workflows

### 1. Add HTTP Request Node for Error Handling

When your workflow encounters an error processing an organization:

1. Add an **HTTP Request** node
2. Set **Method:** POST
3. Set **URL:** `http://localhost:3001/api/organization/error`
4. Set **Body Content Type:** JSON
5. Add the following JSON body:

```json
{
  "name": "{{ $json.name }}",
  "domain": "{{ $json.domain }}",
  "industry": "{{ $json.industry }}",
  "employees": "{{ $json.employees }}",
  "location": "{{ $json.location }}",
  "revenue": "{{ $json.revenue }}",
  "description": "{{ $json.description }}",
  "error": "{{ $json.error_message }}"
}
```

### 2. Add HTTP Request Node for Success

When your workflow successfully processes an organization:

1. Add an **HTTP Request** node
2. Set **Method:** POST
3. Set **URL:** `http://localhost:3001/api/organization/success`
4. Set **Body Content Type:** JSON
5. Add the following JSON body:

```json
{
  "domain": "{{ $json.domain }}"
}
```

## Troubleshooting

### Port Already in Use

If port 3001 is already in use, you can change it:

1. Open `server.js`
2. Change the PORT variable:
```javascript
const PORT = process.env.PORT || 3002; // Change to any available port
```

3. Update your n8n workflow URLs accordingly

### CORS Issues

If you encounter CORS errors, the API is already configured with CORS enabled. Make sure:
- The API server is running
- You're using the correct URL (http://localhost:3001)
- Your n8n instance can reach localhost

### Database Not Initializing

The database (IndexedDB) is browser-based. Make sure:
- You've opened the frontend at least once (http://localhost:3000)
- The browser has IndexedDB enabled
- You're not in private/incognito mode (some browsers restrict IndexedDB)

### API Server Won't Start

Check for errors:
```bash
npm run server
```

Common issues:
- Missing dependencies: Run `npm install`
- Node version too old: Update to Node.js v16+
- Port conflict: Change the PORT in server.js

## Production Deployment

For production use:

1. **Set Environment Variables:**
```bash
export PORT=3001
```

2. **Use a Process Manager:**
```bash
npm install -g pm2
pm2 start server.js --name "org-api"
```

3. **Enable HTTPS:** Use a reverse proxy like nginx or use Express HTTPS

4. **Add Authentication:** Implement API keys or JWT tokens for security

## API Endpoints Reference

See [API_DOCUMENTATION.md](./API_DOCUMENTATION.md) for complete API reference.

## Support

For issues or questions:
1. Check the console logs for error messages
2. Verify the API is running with `/health` endpoint
3. Test with curl before integrating with n8n
4. Check that the database has been initialized (open frontend first)