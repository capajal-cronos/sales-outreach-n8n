# Database Architecture

This application uses **two separate databases** for different purposes:

## 1. Browser Database (IndexedDB)
**Location:** Browser's IndexedDB  
**Used by:** Frontend React application  
**File:** `src/utils/database.js`

### Purpose
- Stores organizations searched/imported through the UI
- Allows users to view and manage organizations in the browser
- Persists data locally in the user's browser

### Features
- Automatic initialization when app loads
- Real-time updates in the UI
- Browser-based storage (no server required)

## 2. Server Database (JSON File)
**Location:** `data/organizations.json`  
**Used by:** Node.js API server (port 3001)  
**File:** `src/api/serverDatabase.js`

### Purpose
- Stores organizations posted by n8n workflows
- Tracks processing status and errors
- Provides persistent storage on the server

### Features
- File-based JSON storage
- Automatic directory creation
- Shared across all users/sessions
- Survives server restarts

## Why Two Databases?

### Browser Database (IndexedDB)
- ✅ Works in the browser without a server
- ✅ Fast local access
- ✅ No network requests needed
- ❌ Cannot be accessed by Node.js
- ❌ Data is per-browser/per-user

### Server Database (JSON File)
- ✅ Accessible by Node.js server
- ✅ Shared across all users
- ✅ Can be accessed by n8n workflows
- ✅ Persists on the server
- ❌ Requires server to be running

## Data Flow

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Port 3000)                  │
│                                                          │
│  User searches organizations → IndexedDB (Browser)      │
│  User views organizations ← IndexedDB (Browser)         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│                  API Server (Port 3001)                  │
│                                                          │
│  n8n POST /api/organization/error → JSON File           │
│  n8n POST /api/organization/success → JSON File         │
└─────────────────────────────────────────────────────────┘
```

## Synchronization

**Important:** The two databases are **NOT automatically synchronized**.

- Organizations added through the UI go to IndexedDB
- Organizations posted by n8n go to the JSON file
- They operate independently

### Future Enhancement
If you need synchronization, you could:
1. Add an API endpoint to sync from JSON file to IndexedDB
2. Make the frontend read from the API server instead of IndexedDB
3. Use a proper database (SQLite, PostgreSQL, etc.) for both

## File Locations

```
n8n-workflow-manager/
├── src/
│   ├── utils/
│   │   └── database.js          # Browser IndexedDB (Frontend)
│   └── api/
│       └── serverDatabase.js    # Server JSON file (Backend)
└── data/
    └── organizations.json       # Server database file (auto-created)
```

## Viewing Data

### Browser Database (IndexedDB)
1. Open the app in browser (http://localhost:3000)
2. Press F12 → Application tab → IndexedDB → OrganizationsDB
3. Or use browser console:
   ```javascript
   const { getAllOrganizations } = await import('./src/utils/database.js');
   console.table(await getAllOrganizations());
   ```

### Server Database (JSON File)
1. Open `data/organizations.json` in a text editor
2. Or use curl:
   ```bash
   # View the file directly
   cat data/organizations.json
   
   # Or add a GET endpoint to the API (future enhancement)
   ```

## Backup

### Browser Database
- Export: Use browser's IndexedDB export tools
- Or implement an export button in the UI

### Server Database
- Simply copy `data/organizations.json`
- Recommended: Add to your backup routine

## Migration

If you want to move data between databases:

### From Browser to Server
1. Export from browser (implement export feature)
2. POST each organization to `/api/organization/error` or `/api/organization/success`

### From Server to Browser
1. Read `data/organizations.json`
2. Import into browser using the UI's import feature

## Production Considerations

For production use, consider:
1. **Replace JSON file with a real database** (SQLite, PostgreSQL, MongoDB)
2. **Add authentication** to the API endpoints
3. **Implement proper error handling** and logging
4. **Add data validation** and sanitization
5. **Set up regular backups** of the JSON file
6. **Consider unifying** the two databases into one system