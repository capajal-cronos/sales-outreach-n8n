# Cloudflare Tunnel Setup Guide

This guide will help you set up Cloudflare Tunnel to expose your local API server with a **permanent URL** that never changes.

## Why Cloudflare Tunnel?

✅ **Permanent URL** - Your tunnel URL stays the same forever, even after restarts  
✅ **Free Tier** - No cost for basic usage  
✅ **Better Performance** - Cloudflare's global CDN network  
✅ **Built-in Security** - DDoS protection and access controls  
✅ **No Port Forwarding** - Works behind firewalls and NAT  

## Prerequisites

- A Cloudflare account (free tier works)
- Access to a domain managed by Cloudflare (optional - you can use Cloudflare's free subdomain)
- Terminal/Command line access

## Step-by-Step Setup

### 1. Install cloudflared CLI

**macOS:**
```bash
brew install cloudflare/cloudflare/cloudflared
```

**Windows:**
```bash
winget install --id Cloudflare.cloudflared
```

**Linux:**
```bash
# Debian/Ubuntu
wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared-linux-amd64.deb

# Other distributions
# See: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/
```

**Verify installation:**
```bash
cloudflared --version
```

### 2. Authenticate with Cloudflare

Run the login command:
```bash
cloudflared tunnel login
```

This will:
1. Open your browser
2. Ask you to select your Cloudflare account
3. Save authentication credentials to `~/.cloudflared/`

### 3. Create Your Tunnel

Create a named tunnel:
```bash
cloudflared tunnel create sales-outreach-n8n
```

**Important:** Save the tunnel ID shown in the output. It looks like:
```
Created tunnel sales-outreach-n8n with id xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

The tunnel credentials are saved to:
- macOS/Linux: `~/.cloudflared/xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json`
- Windows: `%USERPROFILE%\.cloudflared\xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx.json`

### 4. Create a Public Hostname

You have two options:

#### Option A: Use Your Own Domain (Recommended)

If you have a domain managed by Cloudflare:

```bash
cloudflared tunnel route dns sales-outreach-n8n api.yourdomain.com
```

This creates a DNS record pointing `api.yourdomain.com` to your tunnel.

#### Option B: Use Cloudflare's Free Subdomain

Cloudflare provides free `*.trycloudflare.com` subdomains:

1. Go to [Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Access** → **Tunnels**
3. Find your tunnel `sales-outreach-n8n`
4. Click **Configure**
5. Go to **Public Hostname** tab
6. Add a public hostname:
   - **Subdomain:** `sales-outreach-n8n` (or your choice)
   - **Domain:** Select your domain or use the provided subdomain
   - **Service:** `http://localhost:3001`

Your URL will be something like: `https://sales-outreach-n8n.yourdomain.com`

### 5. Configure Your Application

Copy the environment template:
```bash
cp .env.example .env
```

Edit `.env` and update these values:
```env
# Your tunnel name (must match the name you created)
CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n

# Your permanent public URL
CLOUDFLARE_TUNNEL_URL=https://api.yourdomain.com

# Server port (default is fine)
PORT=3001
```

### 6. Test Your Setup

Start the application:
```bash
npm start
```

You should see:
```
✅ Cloudflare Tunnel established!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 Public URL: https://api.yourdomain.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ This URL is PERMANENT and will never change!
```

Test the tunnel:
```bash
# Test health endpoint
curl https://api.yourdomain.com/health

# Should return: {"status":"ok","message":"Organization API is running"}
```

## Using with n8n

Configure your n8n HTTP Request nodes to use your permanent tunnel URL:

**Error Endpoint:**
```
POST https://api.yourdomain.com/api/organization/error
Content-Type: application/json

Body:
{
  "name": "Company Name",
  "domain": "company.com",
  "error": "Error message"
}
```

**Success Endpoint:**
```
POST https://api.yourdomain.com/api/organization/success
Content-Type: application/json

Body:
{
  "domain": "company.com"
}
```

## Managing Your Tunnel

### List All Tunnels
```bash
cloudflared tunnel list
```

### View Tunnel Info
```bash
cloudflared tunnel info sales-outreach-n8n
```

### Delete a Tunnel
```bash
# First, delete DNS routes
cloudflared tunnel route dns delete sales-outreach-n8n

# Then delete the tunnel
cloudflared tunnel delete sales-outreach-n8n
```

### View Tunnel Logs
The tunnel logs are shown in the terminal when you run `npm start`. For more detailed logs:
```bash
cloudflared tunnel run sales-outreach-n8n --loglevel debug
```

## Troubleshooting

### Tunnel Not Starting

**Error: "tunnel credentials not found"**
```bash
# Re-authenticate
cloudflared tunnel login

# Verify tunnel exists
cloudflared tunnel list
```

**Error: "cloudflared: command not found"**
```bash
# Reinstall cloudflared (see Step 1)
# Verify installation
cloudflared --version
```

### URL Not Accessible

**Check DNS propagation:**
```bash
# Check if DNS record exists
nslookup api.yourdomain.com

# Or use dig
dig api.yourdomain.com
```

**Verify tunnel is running:**
1. Check Cloudflare dashboard: https://one.dash.cloudflare.com/
2. Navigate to **Access** → **Tunnels**
3. Your tunnel should show as "Healthy"

**Check local server:**
```bash
# Ensure API server is running
curl http://localhost:3001/health
```

### Port Conflicts

If port 3001 is already in use:
1. Change `PORT=3001` in `.env` to another port (e.g., `PORT=3002`)
2. Restart the application

### Firewall Issues

Cloudflare Tunnel works through outbound connections, so it should work behind most firewalls. If you have issues:

1. Ensure outbound HTTPS (port 443) is allowed
2. Check if your firewall blocks cloudflared
3. Try running with elevated permissions (not recommended for production)

## Advanced Configuration

### Custom Configuration File

For advanced setups, you can create a `config.yml`:

```yaml
tunnel: sales-outreach-n8n
credentials-file: /path/to/credentials.json

ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3001
  - service: http_status:404
```

Run with config:
```bash
cloudflared tunnel --config config.yml run
```

### Multiple Services

You can route multiple services through one tunnel:

```yaml
ingress:
  - hostname: api.yourdomain.com
    service: http://localhost:3001
  - hostname: app.yourdomain.com
    service: http://localhost:3000
  - service: http_status:404
```

## Security Best Practices

1. **Access Control:** Use Cloudflare Access to add authentication
2. **Rate Limiting:** Configure rate limits in Cloudflare dashboard
3. **IP Restrictions:** Whitelist n8n IP addresses if possible
4. **HTTPS Only:** Tunnel automatically uses HTTPS
5. **Credentials:** Keep `~/.cloudflared/` directory secure

## Cost

Cloudflare Tunnel is **free** for:
- Up to 50 users
- Unlimited bandwidth
- Basic DDoS protection

Paid plans offer:
- More users
- Advanced security features
- Priority support

## Support

- **Cloudflare Docs:** https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/
- **Community Forum:** https://community.cloudflare.com/
- **Status Page:** https://www.cloudflarestatus.com/

## Summary

After completing this setup:

✅ You have a permanent URL that never changes  
✅ No need to update n8n webhooks after restarts  
✅ Better performance and security  
✅ Free tier covers most use cases  

Your tunnel will automatically start when you run `npm start` and will reconnect automatically if your internet connection drops.