import { spawn } from 'child_process';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const TUNNEL_NAME = process.env.CLOUDFLARE_TUNNEL_NAME || 'sales-outreach-n8n';
const TUNNEL_URL = process.env.CLOUDFLARE_TUNNEL_URL;
const PORT = process.env.PORT || 3001;

let tunnelProcess = null;

async function startCloudflare() {
  try {
    if (!TUNNEL_NAME) {
      console.error('CLOUDFLARE_TUNNEL_NAME missing in .env');
      process.exit(1);
    }

    tunnelProcess = spawn('cloudflared', [
      'tunnel',
      '--loglevel', 'warn',
      '--url',
      `http://localhost:${PORT}`,
      'run',
      TUNNEL_NAME
    ], {
      stdio: ['ignore', 'ignore', 'pipe']
    });

    tunnelProcess.stderr.on('data', chunk => {
      const text = chunk.toString();
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        if (/\b(WRN|ERR|FTL)\b/.test(line)) process.stderr.write(line + '\n');
      }
    });

    tunnelProcess.on('error', (error) => {
      if (error.code === 'ENOENT') {
        console.error('❌ cloudflared not found!');
        console.log('');
        console.log('Please install cloudflared:');
        console.log('  macOS: brew install cloudflare/cloudflare/cloudflared');
        console.log('  Windows: winget install --id Cloudflare.cloudflared');
        console.log('  Linux: See https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/install-and-setup/installation/');
        console.log('');
        console.log('Then authenticate:');
        console.log('  cloudflared tunnel login');
        console.log('');
        console.log('And create your tunnel:');
        console.log(`  cloudflared tunnel create ${TUNNEL_NAME}`);
        process.exit(1);
      } else {
        console.error('❌ Failed to start Cloudflare Tunnel:', error.message);
        process.exit(1);
      }
    });

    tunnelProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`❌ Cloudflare Tunnel exited with code ${code}`);
        process.exit(code);
      }
    });

    setTimeout(() => {
      console.log(`Tunnel ready: ${TUNNEL_URL || '(set CLOUDFLARE_TUNNEL_URL in .env)'}`);
    }, 2000);

    let stopping = false;
    process.on('SIGINT', () => {
      if (stopping) return;
      stopping = true;
      if (tunnelProcess) tunnelProcess.kill('SIGTERM');
      setTimeout(() => process.exit(0), 1000);
    });

    process.on('SIGTERM', () => {
      if (tunnelProcess) {
        tunnelProcess.kill('SIGTERM');
      }
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start Cloudflare Tunnel:', error.message);
    process.exit(1);
  }
}

startCloudflare();