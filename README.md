# Sales Outreach n8n Manager

A full-stack application for managing sales outreach workflows with n8n integration. Search for organizations, manage leads, and track processing status through a unified database system.

## Features

- 🔍 **Organization Search** - Search organizations by name, domain, or filters
- 📊 **Statistics Dashboard** - Track processed, unprocessed, and error states
- 🔄 **n8n Integration** - Webhook endpoints for workflow automation
- 💾 **Unified Database** - Single JSON-based database for all data
- 🌐 **API Server** - RESTful API for all operations
- 📱 **React Frontend** - Modern UI for managing organizations

## Tech Stack

- **Frontend:** React + Vite
- **Backend:** Node.js + Express
- **Database:** JSON file-based storage
- **Integration:** n8n webhooks

## Quick Start

### Prerequisites

- Node.js v16 or higher
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/capajal-cronos/sales-outreach-n8n.git
cd sales-outreach-n8n
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
VITE_N8N_WEBHOOK_URL=your_n8n_webhook_url
VITE_PIPEDRIVE_API_KEY=your_pipedrive_api_key
CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n
CLOUDFLARE_TUNNEL_URL=https://your-tunnel-url.com
PORT=3001
```

4. Set up Cloudflare Tunnel (one-time setup):
```bash
# Install cloudflared
brew install cloudflare/cloudflare/cloudflared  # macOS
# For other OS: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/

# Authenticate with Cloudflare
cloudflared tunnel login

# Create your tunnel
cloudflared tunnel create sales-outreach-n8n

# Create a DNS route (or use Cloudflare's free subdomain)
cloudflared tunnel route dns sales-outreach-n8n api.yourdomain.com
```

5. Start the application:
```bash
npm start
```

This will start:
- Frontend: http://localhost:3000
- API Server: http://localhost:3001
- Cloudflare Tunnel (permanent URL)

## API Endpoints

### Organization Management

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/organizations` | Get all organizations |
| GET | `/api/organizations/statistics` | Get statistics |
| POST | `/api/organizations` | Add organization |
| POST | `/api/organizations/import` | Import multiple organizations |
| DELETE | `/api/organizations/:id` | Delete organization |

### n8n Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/organization/error` | Mark organization as error |
| POST | `/api/organization/success` | Mark organization as processed |

### Health Check

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Check API server status |

## Usage

### Adding Organizations via UI

1. Open http://localhost:3000
2. Choose search mode (Manual, File Upload, or Filters)
3. Enter organization details
4. Click "Search Organizations"
5. Results are automatically saved to the database

### n8n Workflow Integration

Configure your n8n HTTP Request nodes to POST to:

**On Error:**
```
POST http://localhost:3001/api/organization/error
Body: {
  "name": "Company Name",
  "domain": "company.com",
  "error": "Error message"
}
```

**On Success:**
```
POST http://localhost:3001/api/organization/success
Body: {
  "domain": "company.com"
}
```

### Using with Cloudflare Tunnel

For external access (e.g., cloud-based n8n):

1. Complete the one-time Cloudflare Tunnel setup (see Quick Start)
2. Add your tunnel configuration to `.env`
3. Run `npm start`
4. Use your **permanent** tunnel URL in n8n webhooks - it never changes!

**Key Benefits:**
- ✅ URL stays the same forever (no need to update n8n after restarts)
- ✅ Free tier available
- ✅ Better performance with Cloudflare's global network
- ✅ Built-in DDoS protection

## Project Structure

```
n8n-workflow-manager/
├── src/
│   ├── api/
│   │   ├── organizationEndpoint.js  # API handlers
│   │   └── serverDatabase.js        # Database operations
│   ├── components/
│   │   ├── OrganizationSearch.jsx   # Main search component
│   │   └── ...                      # Other components
│   └── utils/
│       └── apiClient.js             # Frontend API client
├── data/
│   └── organizations.json           # Database file (auto-created)
├── server.js                        # Express API server
├── start-cloudflare.js              # Cloudflare Tunnel startup script
└── package.json
```

## Database Schema

Organizations are stored with the following fields:

```json
{
  "id": 1,
  "name": "Company Name",
  "domain": "company.com",
  "industry": "Technology",
  "employees": "50-100",
  "location": "Brussels, Belgium",
  "revenue": "$10M-$50M",
  "description": "Company description",
  "processed": "yes|error|",
  "error_message": "Error details if any",
  "created_at": "2024-01-01T00:00:00.000Z",
  "updated_at": "2024-01-01T00:00:00.000Z"
}
```

## Scripts

- `npm start` - Start frontend, API server, and Cloudflare Tunnel
- `npm run dev` - Start frontend only
- `npm run server` - Start API server only
- `npm run tunnel` - Start Cloudflare Tunnel only
- `npm run build` - Build for production

## Documentation

- [API Documentation](./API_DOCUMENTATION.md) - Complete API reference
- [Setup Guide](./SETUP_API.md) - Detailed setup instructions
- [Migration Guide](./MIGRATION_GUIDE.md) - Database migration info
- [Database Info](./DATABASE_INFO.md) - Architecture details

## Testing

Test the API with PowerShell:

```powershell
.\test-api.ps1
```

Or manually:

```powershell
# Health check
Invoke-RestMethod -Uri "http://localhost:3001/health" -Method Get

# Get all organizations
Invoke-RestMethod -Uri "http://localhost:3001/api/organizations" -Method Get

# Add organization
$body = @{ name = "Test Co"; domain = "test.com" } | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3001/api/organizations" -Method Post -Body $body -ContentType "application/json"
```

## Troubleshooting

### Frontend shows "Failed to fetch"
- Ensure API server is running on port 3001
- Check `src/utils/apiClient.js` has correct API URL

### Port already in use
- Change PORT in `.env` file
- Update `src/utils/apiClient.js` with new port

### Cloudflare Tunnel not starting
- Ensure cloudflared is installed: `cloudflared --version`
- Verify tunnel exists: `cloudflared tunnel list`
- Check tunnel name in `.env` matches created tunnel
- Re-authenticate if needed: `cloudflared tunnel login`

### Tunnel URL not accessible
- Verify DNS route is configured: `cloudflared tunnel route dns list`
- Check Cloudflare dashboard for tunnel status
- Ensure server is running on correct port (default: 3001)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a Pull Request

## License

MIT

## Support

For issues or questions, please open an issue on GitHub.

## Acknowledgments

- Built for n8n workflow automation
- Integrates with Pipedrive CRM
- Uses Apollo.io for organization data