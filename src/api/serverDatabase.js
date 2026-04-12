import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file paths
const EMAIL_QUEUE_FILE = path.join(__dirname, '../../data/email_queue.json');
const APOLLO_PENDING_FILE = path.join(__dirname, '../../data/apollo_pending.json');

// Helper function to clean domain URLs
function cleanDomain(domain) {
  if (!domain) return '';
  
  let cleaned = domain.trim();
  
  // Remove protocol (http://, https://, etc.)
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/^www\./i, '');
  
  // Remove trailing slashes and paths
  cleaned = cleaned.split('/')[0];
  
  // Remove port numbers if any
  cleaned = cleaned.split(':')[0];
  
  return cleaned.toLowerCase();
}

// Ensure data directory exists
async function ensureDataDir() {
  const dataDir = path.dirname(EMAIL_QUEUE_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Read Apollo pending database
async function readApolloPending() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(APOLLO_PENDING_FILE, 'utf-8');
    
    // Trim any whitespace and validate JSON
    const trimmedData = data.trim();
    if (!trimmedData) {
      return [];
    }
    
    try {
      return JSON.parse(trimmedData);
    } catch (parseError) {
      console.error('JSON parse error in apollo_pending.json, resetting file:', parseError);
      // If JSON is corrupted, reset to empty array
      await writeApolloPending([]);
      return [];
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Write Apollo pending database with atomic write
async function writeApolloPending(data) {
  await ensureDataDir();
  const jsonString = JSON.stringify(data, null, 2);
  
  // On Windows, direct write is more reliable due to file locking issues
  // Atomic writes can fail when VS Code or other processes have the file open
  try {
    await fs.writeFile(APOLLO_PENDING_FILE, jsonString, 'utf-8');
  } catch (error) {
    console.error('Failed to write apollo_pending.json:', error);
    // Retry once after a short delay
    await new Promise(resolve => setTimeout(resolve, 100));
    await fs.writeFile(APOLLO_PENDING_FILE, jsonString, 'utf-8');
  }
}

// Store Apollo search results for review
export async function storeApolloResults(apolloOrgs) {
  const pending = await readApolloPending();
  let stored = 0;

  for (const org of apolloOrgs) {
    // Clean domain before processing
    const cleanedDomain = cleanDomain(org.website_url);

    // Check if already exists in pending by apollo_id
    const existsInPending = pending.find(p => p.apollo_id === org.apollo_id);

    if (!existsInPending) {
      pending.push({
        apollo_id: org.apollo_id,
        name: org.name,
        website_url: cleanedDomain || '',
        linkedin_url: org.linkedin_url || '',
        status: 'pending',
        created_at: new Date().toISOString()
      });
      stored++;
    }
  }

  await writeApolloPending(pending);
  return stored;
}

// Get pending Apollo organizations
export async function getPendingApolloOrganizations() {
  const pending = await readApolloPending();
  return pending.filter(org => org.status === 'pending');
}

// Process Apollo decisions (accept/decline)
export async function processApolloDecisions(decisions) {
  const pending = await readApolloPending();

  let accepted = 0;
  let declined = 0;
  const acceptedOrganizations = [];
  const processedIds = [];

  for (const decision of decisions) {
    const pendingOrg = pending.find(p => p.apollo_id === decision.apollo_id);

    if (!pendingOrg) continue;

    if (decision.action === 'accept') {
      acceptedOrganizations.push({
        name: pendingOrg.name,
        domain: pendingOrg.website_url,
        linkedin: pendingOrg.linkedin_url,
        apollo_id: pendingOrg.apollo_id
      });
      accepted++;
    } else if (decision.action === 'decline') {
      declined++;
    }

    processedIds.push(pendingOrg.apollo_id);
  }

  const updatedPending = pending.filter(org => !processedIds.includes(org.apollo_id));
  await writeApolloPending(updatedPending);

  return { accepted, declined, acceptedOrganizations };
}

// Clear all Apollo pending organizations
export async function clearApolloPending() {
  await writeApolloPending([]);
  return true;
}

// Initialize Apollo pending on startup
export async function initializeApolloPending() {
  try {
    await ensureDataDir();
    await writeApolloPending([]);
    console.log('✅ Apollo pending database initialized (cleared)');
  } catch (error) {
    console.error('Failed to initialize Apollo pending database:', error);
  }
}

// ============================================
// RESPONSES FUNCTIONS
// ============================================

const RESPONSES_FILE = path.join(__dirname, '../../data/responses.json');

async function readResponses() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(RESPONSES_FILE, 'utf-8');
    const trimmedData = data.trim();
    if (!trimmedData) return [];
    try {
      return JSON.parse(trimmedData);
    } catch (parseError) {
      console.error('JSON parse error in responses.json, resetting:', parseError);
      await fs.writeFile(RESPONSES_FILE, '[]', 'utf-8');
      return [];
    }
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeResponses(data) {
  await ensureDataDir();
  await fs.writeFile(RESPONSES_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

export async function addResponse(responseData) {
  const responses = await readResponses();

  // n8n IMAP node may send from as an object {address, name} or plain string
  const fromRaw = responseData.from || '';
  const from = typeof fromRaw === 'object'
    ? (fromRaw.text || fromRaw.address || JSON.stringify(fromRaw))
    : fromRaw;

  // Body: try every field name n8n might use
  const body = responseData.text
    || responseData.body
    || responseData.snippet
    || responseData.message
    || responseData.html
    || responseData.textBody
    || responseData.htmlBody
    || '';

  const newResponse = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
    from,
    subject: responseData.subject || '',
    date: responseData.date || new Date().toISOString(),
    body,
    snippet: responseData.snippet || body.slice(0, 200),
    person_id: responseData.person_id || null,
    person_name: responseData.person_name || '',
    lead_id: responseData.lead_id || null,
    lead_title: responseData.lead_title || '',
    original: responseData.original || '',
    received_at: new Date().toISOString()
  };
  responses.unshift(newResponse); // newest first
  await writeResponses(responses);
  return newResponse;
}

export async function getAllResponses() {
  return await readResponses();
}

// ============================================
// EMAIL QUEUE FUNCTIONS
// ============================================

// Serialize all write operations on the email queue to prevent race conditions
let emailQueueLock = Promise.resolve();

function withEmailQueueLock(fn) {
  const result = emailQueueLock.then(fn);
  // Keep the chain alive even if fn throws, so future callers aren't blocked
  emailQueueLock = result.then(() => {}, () => {});
  return result;
}

// Read email queue
async function readEmailQueue() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(EMAIL_QUEUE_FILE, 'utf-8');
    
    const trimmedData = data.trim();
    if (!trimmedData) {
      return [];
    }
    
    try {
      return JSON.parse(trimmedData);
    } catch (parseError) {
      console.error('JSON parse error in email_queue.json, resetting file:', parseError);
      await writeEmailQueue([]);
      return [];
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Write email queue
async function writeEmailQueue(data) {
  await ensureDataDir();
  await fs.writeFile(EMAIL_QUEUE_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Add email to queue
export async function addEmailToQueue(emailData) {
  return withEmailQueueLock(async () => {
    const queue = await readEmailQueue();

    const newEmail = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
      lead_id: emailData.lead_id,
      email: emailData.email,
      first_name: emailData.first_name,
      email_stage: emailData.email_stage,
      subject: emailData.subject,
      body: emailData.body,
      status: 'pending', // pending, approved, declined, sent
      created_at: new Date().toISOString(),
      reviewed_at: null
    };

    queue.push(newEmail);
    await writeEmailQueue(queue);

    return newEmail;
  });
}

// Get all pending emails
export async function getPendingEmails() {
  const queue = await readEmailQueue();
  return queue.filter(email => email.status === 'pending');
}

// Get all emails (with optional status filter)
export async function getAllEmails(status = null) {
  const queue = await readEmailQueue();
  if (status) {
    return queue.filter(email => email.status === status);
  }
  return queue;
}

// Delete email from queue
export async function deleteEmailFromQueue(emailId) {
  return withEmailQueueLock(async () => {
    const queue = await readEmailQueue();
    const filtered = queue.filter(email => email.id !== emailId);

    if (filtered.length === queue.length) {
      throw new Error('Email not found');
    }

    await writeEmailQueue(filtered);
    return true;
  });
}

// Clear all emails with specific status
export async function clearEmailsByStatus(status) {
  return withEmailQueueLock(async () => {
    const queue = await readEmailQueue();
    const filtered = queue.filter(email => email.status !== status);
    await writeEmailQueue(filtered);
    return queue.length - filtered.length; // Return count of deleted emails
  });
}
