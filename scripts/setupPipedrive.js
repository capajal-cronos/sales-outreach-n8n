// One-time setup for a new Pipedrive account.
// Creates the custom fields and lead labels the n8n workflow depends on.
// Safe to re-run — existing items (matched by name) are skipped.
//
// Usage:
//   npm run setup:pipedrive                 # reads VITE_PIPEDRIVE_API_KEY from .env
//   node scripts/setupPipedrive.js <token>  # or pass the API token as an arg

import 'dotenv/config';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const API_BASE = 'https://api.pipedrive.com/v1';
const ENV_PATH = resolve(process.cwd(), '.env');
const API_TOKEN = process.argv[2] || process.env.VITE_PIPEDRIVE_API_KEY;

if (!API_TOKEN) {
  console.error('ERROR: Pipedrive API token not found.');
  console.error('  Set VITE_PIPEDRIVE_API_KEY in .env, or pass it as the first CLI arg.');
  process.exit(1);
}

const PERSON_FIELDS = [
  { name: 'linkedin_url',       field_type: 'varchar' },
  { name: 'headline',           field_type: 'varchar' },
  { name: 'seniority',          field_type: 'varchar' },
  { name: 'address',            field_type: 'varchar' },
];

const ORGANIZATION_FIELDS = [
  { name: 'company_description', field_type: 'text'    },
  { name: 'apollo_id',           field_type: 'varchar' },
];

// Pipedrive lead labels require a color from this fixed palette:
// green, red, yellow, blue, purple, gray
const LEAD_LABELS = [
  { name: 'first_mail',  color: 'gray' },
  { name: 'second_mail', color: 'gray' },
  { name: 'third_mail',  color: 'gray' },
  { name: 'last_mail',   color: 'gray' },
  { name: 'answered',    color: 'green'  },
];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function api(path, options = {}) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${API_BASE}${path}${separator}api_token=${API_TOKEN}`;

  // Retry on 429 with exponential backoff. Pipedrive's burst limit is low
  // (10/s per token), so a cold setup can trip it if unlucky.
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });

    if (res.status === 429 && attempt < MAX_ATTEMPTS) {
      const retryAfterHeader = Number(res.headers.get('retry-after'));
      const backoffMs = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
        ? retryAfterHeader * 1000
        : 500 * 2 ** (attempt - 1);
      console.log(`  [429] ${path} — waiting ${backoffMs}ms before retry ${attempt + 1}/${MAX_ATTEMPTS}`);
      await sleep(backoffMs);
      continue;
    }

    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.success === false) {
      const msg = body.error || body.message || `HTTP ${res.status}`;
      throw new Error(`${options.method || 'GET'} ${path} → ${msg}`);
    }
    return body;
  }

  throw new Error(`${options.method || 'GET'} ${path} → exhausted retries on 429`);
}

async function ensureCustomField(endpoint, field, existingList) {
  const match = existingList.find(
    f => (f.name || '').toLowerCase() === field.name.toLowerCase()
  );
  if (match) {
    console.log(`  [skip] ${field.name.padEnd(22)} already exists  key=${match.key}`);
    return { name: field.name, key: match.key, created: false };
  }
  const created = await api(`/${endpoint}`, {
    method: 'POST',
    body: JSON.stringify(field),
  });
  console.log(`  [new]  ${field.name.padEnd(22)} created          key=${created.data.key}`);
  return { name: field.name, key: created.data.key, created: true };
}

async function ensureLeadLabel(label, existingList) {
  const match = existingList.find(
    l => (l.name || '').toLowerCase() === label.name.toLowerCase()
  );
  if (match) {
    console.log(`  [skip] ${label.name.padEnd(22)} already exists  id=${match.id}`);
    return { name: label.name, id: match.id, created: false };
  }
  const created = await api('/leadLabels', {
    method: 'POST',
    body: JSON.stringify(label),
  });
  console.log(`  [new]  ${label.name.padEnd(22)} created          id=${created.data.id}`);
  return { name: label.name, id: created.data.id, created: true };
}

function printHeader(title) {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

// Upsert a set of KEY=VALUE pairs into .env without clobbering other entries.
// Existing lines (matching `^KEY=`) are replaced in place; missing ones are appended.
function upsertEnv(entries) {
  const current = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf8') : '';
  let output = current;
  if (output.length > 0 && !output.endsWith('\n')) output += '\n';

  const updated = [];
  const appended = [];
  for (const [key, value] of Object.entries(entries)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    if (pattern.test(output)) {
      output = output.replace(pattern, line);
      updated.push(key);
    } else {
      output += `${line}\n`;
      appended.push(key);
    }
  }

  writeFileSync(ENV_PATH, output);
  return { updated, appended };
}

async function main() {
  console.log('Pipedrive setup for sales-outreach-n8n');
  console.log('=======================================');

  // Fetch each list once up front to avoid Pipedrive rate limits.
  const [personFieldsList, organizationFieldsList, leadLabelsList] = await Promise.all([
    api('/personFields').then(r => r.data || []),
    api('/organizationFields').then(r => r.data || []),
    api('/leadLabels').then(r => r.data || []),
  ]);

  printHeader('Person custom fields');
  const personResults = [];
  for (const field of PERSON_FIELDS) {
    personResults.push(await ensureCustomField('personFields', field, personFieldsList));
  }

  printHeader('Organization custom fields');
  const orgResults = [];
  for (const field of ORGANIZATION_FIELDS) {
    orgResults.push(await ensureCustomField('organizationFields', field, organizationFieldsList));
  }

  printHeader('Lead labels');
  const labelResults = [];
  for (const label of LEAD_LABELS) {
    labelResults.push(await ensureLeadLabel(label, leadLabelsList));
  }

  printHeader('Mapping (paste into n8n)');

  console.log('\nPerson field keys:');
  for (const f of personResults) console.log(`  ${f.name.padEnd(22)} ${f.key}`);

  console.log('\nOrganization field keys:');
  for (const f of orgResults) console.log(`  ${f.name.padEnd(22)} ${f.key}`);

  const mailLabels = labelResults.filter(l => l.name !== 'answered');
  const answered = labelResults.find(l => l.name === 'answered');

  console.log('\nstageToLabelMap for the n8n "Update Pipedrive Label" node:');
  console.log('const stageToLabelMap = {');
  for (const l of mailLabels) console.log(`  '${l.name}':  '${l.id}',`);
  console.log('};');
  console.log(`\nAnswered label id: ${answered?.id}`);

  const byName = list => Object.fromEntries(list.map(r => [r.name, r.key]));
  const personKeys = byName(personResults);
  const orgKeys = byName(orgResults);

  const envEntries = {
    VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY:           personKeys.linkedin_url        || '',
    VITE_PIPEDRIVE_PERSON_HEADLINE_KEY:           personKeys.headline            || '',
    VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY:             orgKeys.apollo_id              || '',
    VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY:   orgKeys.company_description    || '',
  };
  const { updated, appended } = upsertEnv(envEntries);
  printHeader('.env updated');
  for (const k of updated)  console.log(`  [updated]  ${k}`);
  for (const k of appended) console.log(`  [appended] ${k}`);

  const created = [...personResults, ...orgResults, ...labelResults].filter(r => r.created).length;
  const skipped = [...personResults, ...orgResults, ...labelResults].length - created;
  console.log(`\nDone. ${created} created, ${skipped} already existed. Frontend keys written to .env.`);
}

main().catch(err => {
  console.error(`\nSetup failed: ${err.message}`);
  process.exit(1);
});
