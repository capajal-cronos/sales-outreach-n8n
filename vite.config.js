import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiPort = env.PORT || '3001'
  // Generated once per `vite` invocation. App.jsx uses it to wipe stale
  // localStorage caches on dev-server restart. Done here (not via shell env
  // prefix) so the dev script is cross-platform.
  const devSessionId = String(Date.now())
  return {
    plugins: [react()],
    define: {
      'import.meta.env.VITE_DEV_SESSION_ID': JSON.stringify(devSessionId)
    },
    server: {
      port: 3000,
      strictPort: true,
      open: true,
      // Forward /api/* and /health to the Express server during dev so the
      // browser only ever sees one origin (matches the production setup).
      proxy: {
        '/api': `http://localhost:${apiPort}`,
        '/health': `http://localhost:${apiPort}`
      }
    }
  }
})
