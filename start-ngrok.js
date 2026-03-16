import ngrok from 'ngrok';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN;
const PORT = process.env.PORT || 3001;

async function startNgrok() {
  try {
    if (!NGROK_AUTHTOKEN) {
      console.error('❌ NGROK_AUTHTOKEN not found in .env file');
      console.log('Please add your ngrok authtoken to .env:');
      console.log('NGROK_AUTHTOKEN=your_token_here');
      process.exit(1);
    }

    console.log('🚇 Starting ngrok tunnel...');
    
    const url = await ngrok.connect({
      addr: PORT,
      authtoken: NGROK_AUTHTOKEN,
    });

    console.log('');
    console.log('✅ Ngrok tunnel established!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 Public URL: ${url}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('');
    console.log('Use this URL in your n8n workflows:');
    console.log(`  POST ${url}/api/organization/error`);
    console.log(`  POST ${url}/api/organization/success`);
    console.log('');
    console.log('Press Ctrl+C to stop ngrok');
    console.log('');

    // Keep the process running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Stopping ngrok...');
      await ngrok.disconnect();
      await ngrok.kill();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start ngrok:', error.message);
    process.exit(1);
  }
}

startNgrok();