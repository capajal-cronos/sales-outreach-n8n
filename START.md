# Quick Start Guide

## First Time Setup

### 1. Install Dependencies
```bash
cd sales-outreach-n8n
npm install
```

### 2. Set Up Cloudflare Tunnel (One-Time)

**Install cloudflared:**
```bash
# macOS
brew install cloudflare/cloudflare/cloudflared

# Windows
winget install --id Cloudflare.cloudflared

# Linux
# See: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
```

**Authenticate with Cloudflare:**
```bash
cloudflared tunnel login
```
This will open your browser to authenticate with your Cloudflare account.

**Create your tunnel:**
```bash
cloudflared tunnel create sales-outreach-n8n
```
Save the tunnel ID shown - you'll need it for configuration.

**Create a public hostname:**

Option A - Use your own domain:
```bash
cloudflared tunnel route dns sales-outreach-n8n api.yourdomain.com
```

Option B - Use Cloudflare's free subdomain:
```bash
# The tunnel will automatically get a *.trycloudflare.com URL
# Check your Cloudflare dashboard for the URL
```

**Configure environment:**
```bash
cp .env.example .env
```

Edit `.env` and update:
```env
CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n
CLOUDFLARE_TUNNEL_URL=https://api.yourdomain.com  # or your *.trycloudflare.com URL
```

### 3. Start the Application

```bash
npm start
```

This will start:
- ✅ Frontend: http://localhost:3000
- ✅ API Server: http://localhost:3001
- ✅ Cloudflare Tunnel: Your permanent public URL

## Running the Application (After Setup)

Due to PowerShell execution policy restrictions, use one of these methods:

### Method 1: Using CMD (Recommended)
```cmd
cd sales-outreach-n8n
npm start
```

### Method 2: Using PowerShell with Bypass
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
cd sales-outreach-n8n
npm start
```

### Method 3: Using VS Code Terminal
1. Open VS Code
2. Open Terminal (Ctrl + `)
3. Select "Command Prompt" or "Git Bash" from the dropdown
4. Run: `npm start`

### Method 4: Run Components Separately
```bash
# Terminal 1 - Frontend
npm run dev

# Terminal 2 - API Server
npm run server

# Terminal 3 - Cloudflare Tunnel
npm run tunnel
```

## Accessing the Application

Once running, you can access:
- **Local Frontend:** http://localhost:3000
- **Local API:** http://localhost:3001
- **Public API (for n8n):** Your Cloudflare Tunnel URL (shown in terminal)

## Troubleshooting

### Port Already in Use
If port 3000 or 3001 is busy:
1. Change `PORT=3001` in `.env` to another port
2. Restart the application

### Dependencies Not Found
```bash
npm install
```

### Cloudflare Tunnel Not Starting
```bash
# Check if cloudflared is installed
cloudflared --version

# List your tunnels
cloudflared tunnel list

# If tunnel doesn't exist, create it
cloudflared tunnel create sales-outreach-n8n

# Re-authenticate if needed
cloudflared tunnel login
```

### Tunnel URL Not Accessible
1. Check tunnel status in Cloudflare dashboard
2. Verify DNS route: `cloudflared tunnel route dns list`
3. Ensure API server is running on the correct port
4. Check firewall settings

### Build Errors
```bash
npm cache clean --force
rm -rf node_modules
npm install
```

## Next Steps

1. ✅ Complete Cloudflare Tunnel setup (one-time)
2. ✅ Start the application with `npm start`
3. 🌐 Open http://localhost:3000 in your browser
4. 🏢 Begin with "Find Organizations" step
5. 📖 Follow the workflow through all 5 stages
6. 🔗 Configure n8n webhooks with your **permanent** tunnel URL

## Important Notes

### Your Permanent Tunnel URL
- Once configured, your Cloudflare Tunnel URL **never changes**
- Use this URL in your n8n webhooks - no need to update after restarts
- Example endpoints for n8n:
  - `POST https://your-tunnel-url.com/api/organization/error`
  - `POST https://your-tunnel-url.com/api/organization/success`

### Benefits Over ngrok
- ✅ URL stays the same forever
- ✅ No need to update n8n after every restart
- ✅ Free tier available
- ✅ Better performance
- ✅ Built-in security features

Enjoy your n8n workflow manager! 🚀