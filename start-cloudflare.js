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
    console.log('🌐 Starting Cloudflare Tunnel...');
    console.log('');

    // Check if tunnel name is configured
    if (!TUNNEL_NAME) {
      console.error('❌ CLOUDFLARE_TUNNEL_NAME not found in .env file');
      console.log('Please add your tunnel name to .env:');
      console.log('CLOUDFLARE_TUNNEL_NAME=your-tunnel-name');
      console.log('');
      console.log('To create a tunnel, run:');
      console.log('  cloudflared tunnel create sales-outreach-n8n');
      process.exit(1);
    }

    // Start cloudflared tunnel
    tunnelProcess = spawn('cloudflared', [
      'tunnel',
      '--url',
      `http://localhost:${PORT}`,
      'run',
      TUNNEL_NAME
    ], {
      stdio: 'inherit'
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

    // Display tunnel information after a short delay
    setTimeout(() => {
      console.log('');
      console.log('✅ Cloudflare Tunnel established!');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      if (TUNNEL_URL) {
        console.log(`🌐 Public URL: ${TUNNEL_URL}`);
      } else {
        console.log('🌐 Public URL: Check Cloudflare dashboard for your tunnel URL');
        console.log('   Or add CLOUDFLARE_TUNNEL_URL to your .env file');
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('');
      console.log('✨ This URL is PERMANENT and will never change!');
      console.log('');
      console.log('Use this URL in your n8n workflows:');
      if (TUNNEL_URL) {
        console.log(`  POST ${TUNNEL_URL}/api/organization/error`);
        console.log(`  POST ${TUNNEL_URL}/api/organization/success`);
      } else {
        console.log('  POST https://your-tunnel-url.com/api/organization/error');
        console.log('  POST https://your-tunnel-url.com/api/organization/success');
      }
      console.log('');
      console.log('Press Ctrl+C to stop the tunnel');
      console.log('');
    }, 2000);

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping Cloudflare Tunnel...');
      if (tunnelProcess) {
        tunnelProcess.kill('SIGTERM');
      }
      setTimeout(() => {
        process.exit(0);
      }, 1000);
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