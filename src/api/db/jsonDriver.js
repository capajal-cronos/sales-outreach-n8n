// JSON file driver. Default for local dev — no Postgres required.
//
// Storage layout:
//   data/email_queue.json     — pending/approved/declined/sent emails
//   data/apollo_pending.json  — apollo orgs awaiting review
//   data/sent_emails.json     — append-only archive of sent emails
//   data/responses.json       — incoming replies
//
// Single-process only. Cloud Run / multi-instance hosting requires the
// postgres driver instead.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '../../../data');
const EMAIL_QUEUE_FILE    = path.join(DATA_DIR, 'email_queue.json');
const APOLLO_PENDING_FILE = path.join(DATA_DIR, 'apollo_pending.json');
const SENT_EMAILS_FILE    = path.join(DATA_DIR, 'sent_emails.json');
const RESPONSES_FILE      = path.join(DATA_DIR, 'responses.json');

async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJsonArray(filePath) {
  try {
    await ensureDataDir();
    const raw = await fs.readFile(filePath, 'utf-8');
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [];
    } catch (parseError) {
      console.error(`JSON parse error in ${path.basename(filePath)}, resetting:`, parseError);
      await writeJsonArray(filePath, []);
      return [];
    }
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeJsonArray(filePath, data) {
  await ensureDataDir();
  const json = JSON.stringify(data, null, 2);
  // Windows-friendly: a direct write is more reliable than rename-style atomic
  // writes when other processes (VS Code, etc.) might hold the file open.
  try {
    await fs.writeFile(filePath, json, 'utf-8');
  } catch (error) {
    console.error(`Failed to write ${path.basename(filePath)}:`, error);
    await new Promise(r => setTimeout(r, 100));
    await fs.writeFile(filePath, json, 'utf-8');
  }
}

// Serialize all email-queue writes to prevent races between concurrent
// approve/decline/insert calls. Postgres has its own concurrency control.
let emailQueueLock = Promise.resolve();
function withEmailQueueLock(fn) {
  const result = emailQueueLock.then(fn);
  emailQueueLock = result.then(() => {}, () => {});
  return result;
}

export async function init() {
  await ensureDataDir();
}

// ─────────────────────────────────────────────────────────────────────────────
// apollo_pending
// ─────────────────────────────────────────────────────────────────────────────
export const apolloPending = {
  async storeMany(orgs) {
    const pending = await readJsonArray(APOLLO_PENDING_FILE);
    let stored = 0;
    for (const org of orgs) {
      if (pending.find(p => p.apollo_id === org.apollo_id)) continue;
      pending.push({
        apollo_id:    org.apollo_id,
        name:         org.name,
        website_url:  org.website_url || '',
        linkedin_url: org.linkedin_url || '',
        status:       'pending',
        created_at:   new Date().toISOString()
      });
      stored++;
    }
    await writeJsonArray(APOLLO_PENDING_FILE, pending);
    return stored;
  },

  async findPending() {
    const pending = await readJsonArray(APOLLO_PENDING_FILE);
    return pending.filter(o => o.status === 'pending');
  },

  async findByApolloIds(ids) {
    if (ids.length === 0) return [];
    const pending = await readJsonArray(APOLLO_PENDING_FILE);
    const set = new Set(ids);
    return pending.filter(o => set.has(o.apollo_id));
  },

  async deleteByApolloIds(ids) {
    if (ids.length === 0) return;
    const pending = await readJsonArray(APOLLO_PENDING_FILE);
    const set = new Set(ids);
    await writeJsonArray(APOLLO_PENDING_FILE, pending.filter(o => !set.has(o.apollo_id)));
  },

  async clear() {
    await writeJsonArray(APOLLO_PENDING_FILE, []);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// email_queue
// ─────────────────────────────────────────────────────────────────────────────
export const emailQueue = {
  async insert(email) {
    return withEmailQueueLock(async () => {
      const queue = await readJsonArray(EMAIL_QUEUE_FILE);
      queue.push(email);
      await writeJsonArray(EMAIL_QUEUE_FILE, queue);
      return email;
    });
  },

  async findPending() {
    const queue = await readJsonArray(EMAIL_QUEUE_FILE);
    return queue.filter(e => e.status === 'pending');
  },

  async findAll(status) {
    const queue = await readJsonArray(EMAIL_QUEUE_FILE);
    return status ? queue.filter(e => e.status === status) : queue;
  },

  async findLatestForLead(leadId) {
    const queue = await readJsonArray(EMAIL_QUEUE_FILE);
    const matches = queue
      .filter(e => e.lead_id === leadId)
      .sort((a, b) =>
        new Date(b.reviewed_at || b.created_at || 0) -
        new Date(a.reviewed_at || a.created_at || 0)
      );
    return matches[0] || null;
  },

  async deleteById(id) {
    return withEmailQueueLock(async () => {
      const queue = await readJsonArray(EMAIL_QUEUE_FILE);
      const filtered = queue.filter(e => e.id !== id);
      if (filtered.length === queue.length) {
        throw new Error('Email not found');
      }
      await writeJsonArray(EMAIL_QUEUE_FILE, filtered);
    });
  },

  async deleteByStatus(status) {
    return withEmailQueueLock(async () => {
      const queue = await readJsonArray(EMAIL_QUEUE_FILE);
      const filtered = queue.filter(e => e.status !== status);
      await writeJsonArray(EMAIL_QUEUE_FILE, filtered);
      return queue.length - filtered.length;
    });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// sent_emails
// ─────────────────────────────────────────────────────────────────────────────
export const sentEmails = {
  async insert(email) {
    const archive = await readJsonArray(SENT_EMAILS_FILE);
    archive.push({
      lead_id:     email.lead_id,
      email:       email.email || '',
      subject:     email.subject || '',
      body:        email.body || '',
      email_stage: email.email_stage || '',
      sent_at:     new Date().toISOString()
    });
    await writeJsonArray(SENT_EMAILS_FILE, archive);
  },

  async findLatestForLead(leadId) {
    const archive = await readJsonArray(SENT_EMAILS_FILE);
    const matches = archive
      .filter(e => e.lead_id === leadId)
      .sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));
    return matches[0] || null;
  },

  async findLatestForEmail(email) {
    if (!email) return null;
    const target = email.toLowerCase().trim();
    const archive = await readJsonArray(SENT_EMAILS_FILE);
    const matches = archive
      .filter(e => (e.email || '').toLowerCase().trim() === target)
      .sort((a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0));
    return matches[0] || null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// responses
// ─────────────────────────────────────────────────────────────────────────────
export const responses = {
  async insert(response) {
    const all = await readJsonArray(RESPONSES_FILE);
    all.unshift(response); // newest first
    await writeJsonArray(RESPONSES_FILE, all);
  },

  async findAll() {
    return readJsonArray(RESPONSES_FILE);
  }
};
