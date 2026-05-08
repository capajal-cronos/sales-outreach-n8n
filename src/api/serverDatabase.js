// Application-layer data access. Owns parsing/cleanup logic that's storage-
// agnostic (reply parsing, mojibake fixes, domain cleaning); delegates raw
// CRUD to the driver in src/api/db/.
//
// The public exports here are unchanged from the pre-driver version, so
// server.js and organizationEndpoint.js need no edits to switch backends.

import * as db from './db/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Reply / quoted-thread parsing
// ─────────────────────────────────────────────────────────────────────────────

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

function cleanDomain(domain) {
  if (!domain) return '';
  let cleaned = domain.trim()
    .replace(/^https?:\/\//i, '')
    .replace(/^www\./i, '')
    .split('/')[0]
    .split(':')[0];
  return cleaned.toLowerCase();
}

// ─────────────────────────────────────────────────────────────────────────────
// Apollo pending
// ─────────────────────────────────────────────────────────────────────────────

export async function storeApolloResults(apolloOrgs) {
  const cleaned = apolloOrgs.map(org => ({
    apollo_id:    org.apollo_id,
    name:         org.name,
    website_url:  cleanDomain(org.website_url) || '',
    linkedin_url: org.linkedin_url || ''
  }));
  return db.apolloPending.storeMany(cleaned);
}

export async function getPendingApolloOrganizations() {
  return db.apolloPending.findPending();
}

export async function processApolloDecisions(decisions) {
  const apolloIds = decisions.map(d => d.apollo_id);
  const matchedOrgs = await db.apolloPending.findByApolloIds(apolloIds);
  const orgsById = new Map(matchedOrgs.map(o => [o.apollo_id, o]));

  let accepted = 0;
  let declined = 0;
  const acceptedOrganizations = [];
  const processedIds = [];

  for (const decision of decisions) {
    const org = orgsById.get(decision.apollo_id);
    if (!org) continue;

    if (decision.action === 'accept') {
      acceptedOrganizations.push({
        name:      org.name,
        domain:    org.website_url,
        linkedin:  org.linkedin_url,
        apollo_id: org.apollo_id
      });
      accepted++;
    } else if (decision.action === 'decline') {
      declined++;
    }

    processedIds.push(org.apollo_id);
  }

  await db.apolloPending.deleteByApolloIds(processedIds);
  return { accepted, declined, acceptedOrganizations };
}

export async function clearApolloPending() {
  await db.apolloPending.clear();
  return true;
}

// Server-startup hook. Verifies storage is reachable, and wipes the pending
// table only when the JSON driver is active — that preserves legacy local
// behaviour ("fresh slate every npm start") without clobbering shared state
// every time a Cloud Run instance cold-starts.
export async function initializeApolloPending() {
  try {
    await db.init();
    if (db.DB_DRIVER === 'json') {
      await db.apolloPending.clear();
    }
  } catch (error) {
    console.error('Failed to initialize Apollo pending database:', error);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Email queue
// ─────────────────────────────────────────────────────────────────────────────

export async function addEmailToQueue(emailData) {
  const newEmail = {
    id:           Date.now().toString() + Math.random().toString(36).substring(2, 11),
    lead_id:      emailData.lead_id,
    email:        emailData.email,
    first_name:   emailData.first_name,
    email_stage:  emailData.email_stage,
    subject:      emailData.subject,
    body:         emailData.body,
    status:       'pending',
    created_at:   new Date().toISOString(),
    reviewed_at:  null
  };
  return db.emailQueue.insert(newEmail);
}

export async function getPendingEmails() {
  return db.emailQueue.findPending();
}

export async function getAllEmails(status = null) {
  return db.emailQueue.findAll(status || undefined);
}

export async function deleteEmailFromQueue(emailId) {
  await db.emailQueue.deleteById(emailId);
  return true;
}

export async function clearEmailsByStatus(status) {
  return db.emailQueue.deleteByStatus(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sent-mail archive
// ─────────────────────────────────────────────────────────────────────────────

// Append an approved email to the persistent sent archive so the original
// is recoverable when a reply comes in (the live queue gets cleared on send).
export async function archiveSentEmail(email) {
  if (!email || !email.lead_id) return;
  try {
    await db.sentEmails.insert(email);
  } catch (error) {
    console.error('Failed to archive sent email:', error);
  }
}

// Look up the body of the most recently sent email for a lead. Reads the
// persistent archive first, falls back to the live queue for in-flight emails.
async function findSentBodyForLead(leadId) {
  if (!leadId) return '';
  try {
    const archived = await db.sentEmails.findLatestForLead(leadId);
    if (archived?.body) return archived.body.trim();
    const queued = await db.emailQueue.findLatestForLead(leadId);
    return (queued?.body || '').trim();
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────────────────────────────────────

export async function addResponse(responseData) {
  // n8n IMAP node may send `from` as an object {address, name} or plain string.
  const fromRaw = responseData.from || '';
  const from = typeof fromRaw === 'object'
    ? (fromRaw.text || fromRaw.address || JSON.stringify(fromRaw))
    : fromRaw;

  // Body: try every field name n8n might use.
  const rawBody = responseData.text
    || responseData.body
    || responseData.snippet
    || responseData.message
    || responseData.html
    || responseData.textBody
    || responseData.htmlBody
    || '';

  // Split the reply from the quoted thread.
  const { reply, quoted } = splitReplyAndQuote(rawBody);

  // Recover the original email. Priority:
  // 1. What n8n explicitly sent.
  // 2. The body of the email we sent for this lead (looked up in the archive).
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
    id:          Date.now().toString() + Math.random().toString(36).substring(2, 11),
    from,
    subject:     responseData.subject || '',
    date:        responseData.date || new Date().toISOString(),
    body:        cleanReply,
    snippet:     cleanReply.slice(0, 200),
    person_id:   responseData.person_id || null,
    person_name: responseData.person_name || '',
    lead_id:     responseData.lead_id || null,
    lead_title:  responseData.lead_title || '',
    stage:       responseData.stage || '',
    original,
    received_at: new Date().toISOString()
  };

  await db.responses.insert(newResponse);
  return newResponse;
}

export async function getAllResponses() {
  return db.responses.findAll();
}
