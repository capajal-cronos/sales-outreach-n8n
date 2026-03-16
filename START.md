# Quick Start Guide

## Running the Application

Due to PowerShell execution policy restrictions, use one of these methods:

### Method 1: Using CMD (Recommended)
Open Command Prompt (cmd.exe) and run:
```cmd
cd n8n-workflow-manager
npm run dev
```

### Method 2: Using PowerShell with Bypass
Open PowerShell as Administrator and run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
cd n8n-workflow-manager
npm run dev
```

### Method 3: Direct Node Command
```cmd
cd n8n-workflow-manager
node node_modules/vite/bin/vite.js
```

### Method 4: Using VS Code Terminal
1. Open VS Code
2. Open Terminal (Ctrl + `)
3. Select "Command Prompt" or "Git Bash" from the dropdown
4. Run: `npm run dev`

## First Time Setup

If you haven't installed dependencies yet:
```cmd
cd n8n-workflow-manager
npm install
npm run dev
```

## Accessing the Application

Once running, open your browser to:
- **Local:** http://localhost:3000
- **Network:** Check terminal output for network URL

## Troubleshooting

### Port Already in Use
If port 3000 is busy, the app will automatically try the next available port.

### Dependencies Not Found
```cmd
npm install
```

### Build Errors
```cmd
npm cache clean --force
rm -rf node_modules
npm install
```

## Next Steps

1. ✅ Start the development server
2. 🌐 Open http://localhost:3000 in your browser
3. 🏢 Begin with "Find Organizations" step
4. 📖 Follow the workflow through all 5 stages
5. 🔗 Configure n8n webhooks when ready (see README.md)

Enjoy your n8n workflow manager! 🚀