# Migration Guide: Single Database System

## What Changed?

The application now uses **one unified database** instead of two separate databases.

### Before (Two Databases)
- ❌ Browser IndexedDB - Used by frontend
- ❌ Server JSON file - Used by API/n8n
- ❌ Data not synchronized
- ❌ Confusing architecture

### After (One Database)
- ✅ Server JSON file (`data/organizations.json`) - Used by everything
- ✅ Frontend makes API calls to server
- ✅ All data in one place
- ✅ Simple and consistent

## Important Changes

### 1. API Server Must Be Running
**The frontend now requires the API server to be running!**

Before: Frontend worked standalone (using IndexedDB)  
After: Frontend needs API server on port 3001

### 2. Start Command
Always use:
```bash
npm start
```

This starts both:
- Frontend (port 3000)
- API Server (port 3001)

### 3. Data Location
All organization data is now stored in:
```
data/organizations.json
```

## Migration Steps

### Step 1: Export Old Data (If You Have Any)
If you had data in the browser's IndexedDB:

1. Open the old version in browser
2. Press F12 → Console
3. Run:
```javascript
const { getAllOrganizations } = await import('./src/utils/database.js');
const orgs = await getAllOrganizations();
console.log(JSON.stringify(orgs, null, 2));
```
4. Copy the output and save it

### Step 2: Update Code
Already done! The code now uses `src/utils/apiClient.js` instead of `src/utils/database.js`

### Step 3: Import Old Data (If Needed)
If you saved data from Step 1:

1. Start the servers: `npm start`
2. Use the import endpoint:
```powershell
$orgs = Get-Content old-data.json | ConvertFrom-Json
$body = @{ organizations = $orgs } | ConvertTo-Json -Depth 10
Invoke-RestMethod -Uri "http://localhost:3001/api/organizations/import" -Method Post -Body $body -ContentType "application/json"
```

### Step 4: Clear Browser Data (Optional)
The old IndexedDB data is no longer used. To clean it up:

1. Open browser DevTools (F12)
2. Application → IndexedDB
3. Right-click "OrganizationsDB" → Delete database

## New API Endpoints

The frontend now uses these endpoints:

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/organizations` | Get all organizations |
| GET | `/api/organizations/statistics` | Get statistics |
| POST | `/api/organizations` | Add organization |
| POST | `/api/organizations/import` | Import multiple |
| DELETE | `/api/organizations/:id` | Delete organization |

## For n8n Users

**No changes needed!** Your n8n workflows continue to work:
- `POST /api/organization/error` - Still works
- `POST /api/organization/success` - Still works

Now the data posted by n8n will be visible in the UI immediately!

## Troubleshooting

### Frontend Shows "Failed to fetch"
**Problem:** API server is not running

**Solution:**
```bash
npm start
```

Make sure you see both servers starting:
```
[0] VITE v5.4.21  ready in 283 ms
[0] ➜  Local:   http://localhost:3000/
[1] 🚀 Organization API server running on http://localhost:3001
```

### "Connection refused" Error
**Problem:** Port 3001 is blocked or in use

**Solution:**
1. Check if another process is using port 3001
2. Change the port in `server.js` if needed
3. Update `src/utils/apiClient.js` with the new port

### Data Not Showing in UI
**Problem:** API server not running or wrong URL

**Solution:**
1. Verify API is running: `http://localhost:3001/health`
2. Check browser console for errors
3. Verify `src/utils/apiClient.js` has correct URL

### Old Data Still in Browser
**Problem:** Browser cached old IndexedDB data

**Solution:**
1. Clear browser cache
2. Delete IndexedDB (F12 → Application → IndexedDB)
3. Refresh the page

## Benefits of Single Database

✅ **Consistency:** All data in one place  
✅ **Real-time sync:** UI shows n8n updates immediately  
✅ **Simpler:** No confusion about which database has what  
✅ **Persistent:** Data survives browser restarts  
✅ **Shareable:** Multiple users see the same data  
✅ **Backup-friendly:** Just backup `data/organizations.json`  

## File Changes Summary

### New Files
- `src/utils/apiClient.js` - API client for frontend
- `src/api/serverDatabase.js` - Server-side database
- `src/api/organizationEndpoint.js` - API handlers
- `server.js` - Express API server

### Modified Files
- `src/components/OrganizationSearch.jsx` - Now uses apiClient
- `package.json` - Added express, cors dependencies

### Deprecated Files
- `src/utils/database.js` - No longer used (kept for reference)

## Rollback (If Needed)

If you need to go back to the old system:

1. Change import in `OrganizationSearch.jsx`:
```javascript
// Change from:
import { ... } from '../utils/apiClient';
// Back to:
import { ... } from '../utils/database';
```

2. Run frontend only:
```bash
npm run dev
```

Note: You'll lose the n8n integration if you rollback.