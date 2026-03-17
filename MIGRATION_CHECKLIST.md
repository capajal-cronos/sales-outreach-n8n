# Migration Checklist: ngrok → Cloudflare Tunnel

This checklist will guide you through completing the migration from ngrok to Cloudflare Tunnel.

## ✅ Completed (Automated)

The following changes have been automatically applied:

- [x] Created `start-cloudflare.js` - New tunnel startup script
- [x] Updated `package.json` - Removed ngrok dependency, updated scripts
- [x] Updated `.env.example` - Replaced ngrok config with Cloudflare config
- [x] Updated `README.md` - Replaced all ngrok references with Cloudflare Tunnel
- [x] Updated `START.md` - Added comprehensive Cloudflare setup instructions
- [x] Created `CLOUDFLARE_SETUP.md` - Detailed setup and troubleshooting guide
- [x] Updated `.gitignore` - Added Cloudflare credentials to ignore list

## 📋 Manual Steps Required

Complete these steps to finish the migration:

### 1. Clean Up Old Files

```bash
# Remove the old ngrok startup script
rm start-ngrok.js

# Remove ngrok from node_modules (optional, will happen on next npm install)
npm uninstall ngrok
```

### 2. Install Cloudflare Tunnel CLI

**macOS:**
```bash
brew install cloudflare/cloudflare/cloudflared
cloudflared --version
```

**Windows:**
```bash
winget install --id Cloudflare.cloudflared
cloudflared --version
```

**Linux:**
See [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for distribution-specific instructions.

### 3. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This will open your browser. Select your Cloudflare account and authorize.

### 4. Create Your Tunnel

```bash
cloudflared tunnel create sales-outreach-n8n
```

**Important:** Save the tunnel ID shown in the output!

### 5. Configure DNS Route

**Option A - Use your own domain:**
```bash
cloudflared tunnel route dns sales-outreach-n8n api.yourdomain.com
```

**Option B - Use Cloudflare dashboard:**
1. Go to https://one.dash.cloudflare.com/
2. Navigate to **Access** → **Tunnels**
3. Find `sales-outreach-n8n` and click **Configure**
4. Add a public hostname with service `http://localhost:3001`

### 6. Update Your .env File

```bash
# Copy the example if you haven't already
cp .env.example .env

# Edit .env and update:
# CLOUDFLARE_TUNNEL_NAME=sales-outreach-n8n
# CLOUDFLARE_TUNNEL_URL=https://api.yourdomain.com (or your assigned URL)
```

### 7. Test the Setup

```bash
# Start the application
npm start
```

You should see:
```
✅ Cloudflare Tunnel established!
🌐 Public URL: https://api.yourdomain.com
✨ This URL is PERMANENT and will never change!
```

### 8. Verify Tunnel is Working

Open a new terminal and test:

```bash
# Test health endpoint
curl https://api.yourdomain.com/health

# Expected response:
# {"status":"ok","message":"Organization API is running"}
```

### 9. Update n8n Webhooks

Update your n8n HTTP Request nodes with the new **permanent** URLs:

**Error Endpoint:**
```
POST https://api.yourdomain.com/api/organization/error
```

**Success Endpoint:**
```
POST https://api.yourdomain.com/api/organization/success
```

**Important:** You only need to do this ONCE! The URL will never change.

### 10. Test n8n Integration

1. Trigger your n8n workflow
2. Verify the webhook calls reach your API
3. Check the organization database for updates

### 11. Clean Up (Optional)

If everything works, you can remove ngrok-related environment variables from your actual `.env` file:

```bash
# Remove this line if it exists:
# NGROK_AUTHTOKEN=...
```

## 🎉 Migration Complete!

Once all steps are done, you'll have:

✅ A permanent URL that never changes  
✅ No need to update n8n after restarts  
✅ Better performance via Cloudflare's network  
✅ Built-in security and DDoS protection  
✅ Free tier for unlimited usage  

## 📚 Additional Resources

- [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) - Detailed setup guide
- [START.md](./START.md) - Quick start instructions
- [README.md](./README.md) - Full project documentation

## 🆘 Troubleshooting

If you encounter issues:

1. **Tunnel won't start:** Check [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) troubleshooting section
2. **URL not accessible:** Verify DNS propagation with `nslookup api.yourdomain.com`
3. **n8n can't reach API:** Check Cloudflare dashboard for tunnel status
4. **Port conflicts:** Change `PORT` in `.env` file

## 📝 Notes

- Your tunnel credentials are stored in `~/.cloudflared/` (keep this secure!)
- The tunnel will auto-reconnect if your internet drops
- You can manage tunnels via Cloudflare dashboard or CLI
- The free tier has no bandwidth limits

## ✅ Verification Checklist

Before considering the migration complete, verify:

- [ ] `start-ngrok.js` has been deleted
- [ ] `cloudflared` is installed and working
- [ ] Tunnel is created and authenticated
- [ ] DNS route is configured
- [ ] `.env` file has correct tunnel configuration
- [ ] `npm start` successfully starts the tunnel
- [ ] Public URL is accessible from external network
- [ ] Health endpoint responds correctly
- [ ] n8n webhooks are updated with new URL
- [ ] n8n workflow successfully calls the API
- [ ] Organization data is being updated correctly

---

**Need Help?** Refer to [CLOUDFLARE_SETUP.md](./CLOUDFLARE_SETUP.md) for detailed instructions and troubleshooting.