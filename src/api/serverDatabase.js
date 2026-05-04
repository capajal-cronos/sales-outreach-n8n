import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database file paths
const EMAIL_QUEUE_FILE = path.join(__dirname, '../../data/email_queue.json');
const APOLLO_PENDING_FILE = path.join(__dirname, '../../data/apollo_pending.json');
const SENT_EMAILS_FILE = path.join(__dirname, '../../data/sent_emails.json');

// Strip quoted thread from a reply body. Handles Outlook (multi-language
// "From:/Van:/Von:/De:" headers, "_____" separators), Gmail ("On <date> wrote:"
// in EN/NL/DE/FR), classic "-----Original Message-----", and `> ` quote lines.
// Returns { reply, quoted }.
function splitReplyAndQuote(text) {
  if (typeof text !== 'string' || !text) return { reply: '', quoted: '' };
  const normalized = text.replace(/\r\n/g, '\n');

  const markers = [
    /\s_{5,}\s*/,
    /(?:^|\n|\s)(?:From|Van|De|Von|Da):\s+\S[\s\S]{1,400}?(?:Sent|Verzonden|Envoyé|Gesendet|Inviato):/i,
    /-{3,}\s*Original Message\s*-{3,}/i,
    /\bOn\s[\s\S]{1,300}?\bwrote:\s*$/im,
    /\bOp\s[\s\S]{1,300}?\bschreef\s+\S[\s\S]{0,200}?:\s*$/im,
    /\bLe\s[\s\S]{1,300}?\ba\s+écrit\s*:\s*$/im,
    /\bAm\s[\s\S]{1,300}?\bschrieb\s+\S[\s\S]{0,200}?:\s*$/im,
    /\n>\s/,
  ];

  let cutAt = -1;
  for (const re of markers) {
    const m = normalized.match(re);
    if (m && typeof m.index === 'number' && (cutAt === -1 || m.index < cutAt)) {
      cutAt = m.index;
    }
  }

  if (cutAt === -1) return { reply: normalized.trim(), quoted: '' };
  return {
    reply: normalized.slice(0, cutAt).trim(),
    quoted: normalized.slice(cutAt).trim(),
  };
}

// Strip the Outlook header block ("Van: ... Onderwerp: <subject>") and
// Microsoft's "You don't often get email from..." disclaimer, leaving only
// the body of the original email.
function extractOriginalFromQuoted(quoted) {
  if (!quoted) return '';
  let out = quoted.replace(/^_+\s*/, '');
  const headerRe = /^(?:From|Van|De|Von|Da):[\s\S]*?(?:Subject|Onderwerp|Objet|Betreff|Oggetto):[^\n]*\n?/i;
  out = out.replace(headerRe, '');
  out = out.replace(
    /\[(?:You\s+don['’]t\s+often\s+get\s+email|U\s+ontvang(?:t)?\s+niet\s+vaak\s+e-mail|Vous\s+ne\s+recevez\s+pas\s+souvent)[^[\]]*\]/gi,
    ''
  );
  return out.trim();
}

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
  const rawBody = responseData.text
    || responseData.body
    || responseData.snippet
    || responseData.message
    || responseData.html
    || responseData.textBody
    || responseData.htmlBody
    || '';

  // Split the reply from the quoted thread. Works for Outlook (Dutch/EN/DE/FR
  // headers + underline separators), Gmail's "On <date> wrote:" forms, classic
  // "-----Original Message-----", and `> `-quoted plain text.
  const { reply, quoted } = splitReplyAndQuote(rawBody);

  // Recover the original email. Priority:
  // 1. What n8n explicitly sent (Gmail path already does this).
  // 2. The body of the email we sent for this lead (looked up in the queue).
  // 3. Whatever survives after stripping the Outlook header from the quoted block.
  let original = (responseData.original || '').trim();
  if (!original && responseData.lead_id) {
    original = (await findSentBodyForLead(responseData.lead_id)) || '';
  }
  if (!original) {
    original = extractOriginalFromQuoted(quoted);
  }

  const cleanReply = reply || rawBody;

  const newResponse = {
    id: Date.now().toString() + Math.random().toString(36).substring(2, 11),
    from,
    subject: responseData.subject || '',
    date: responseData.date || new Date().toISOString(),
    body: cleanReply,
    snippet: cleanReply.slice(0, 200),
    person_id: responseData.person_id || null,
    person_name: responseData.person_name || '',
    lead_id: responseData.lead_id || null,
    lead_title: responseData.lead_title || '',
    stage: responseData.stage || '',
    original,
    received_at: new Date().toISOString()
  };
  responses.unshift(newResponse); // newest first
  await writeResponses(responses);
  return newResponse;
}

// Append an approved email to the persistent sent archive so the original
// is recoverable when a reply comes in (the live queue gets cleared on send).
export async function archiveSentEmail(email) {
  if (!email || !email.lead_id) return;
  try {
    await ensureDataDir();
    let archive = [];
    try {
      const data = await fs.readFile(SENT_EMAILS_FILE, 'utf-8');
      archive = JSON.parse(data.trim() || '[]');
      if (!Array.isArray(archive)) archive = [];
    } catch (err) {
      if (err.code !== 'ENOENT') console.error('sent_emails.json parse error, resetting:', err);
    }
    archive.push({
      lead_id: email.lead_id,
      email: email.email || '',
      subject: email.subject || '',
      body: email.body || '',
      email_stage: email.email_stage || '',
      sent_at: new Date().toISOString()
    });
    await fs.writeFile(SENT_EMAILS_FILE, JSON.stringify(archive, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to archive sent email:', err);
  }
}

// Look up the body of the most recently sent email for a lead. Reads the
// persistent archive first, falls back to the live queue for in-flight emails.
async function findSentBodyForLead(leadId) {
  if (!leadId) return '';
  try {
    let archive = [];
    try {
      const data = await fs.readFile(SENT_EMAILS_FILE, 'utf-8');
      archive = JSON.parse(data.trim() || '[]');
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const archiveMatch = (archive || [])
      .filter(e => e.lead_id === leadId)
      .sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0))[0];
    if (archiveMatch && archiveMatch.body) return archiveMatch.body.trim();

    const queue = await readEmailQueue();
    const queueMatch = queue
      .filter(e => e.lead_id === leadId)
      .sort((a, b) => new Date(b.reviewed_at || b.created_at || 0) - new Date(a.reviewed_at || a.created_at || 0))[0];
    return (queueMatch?.body || '').trim();
  } catch {
    return '';
  }
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
