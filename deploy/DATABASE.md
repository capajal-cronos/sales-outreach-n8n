# Moving from JSON files to a real database

This is a migration plan for replacing the four `data/*.json` files
with a real database. It's a prerequisite for Cloud Run / App Engine /
any multi-instance deployment — see
[DEPLOY-GCP-WITH-DB.md](./DEPLOY-GCP-WITH-DB.md) for the deploy that
unlocks once this is done.

## Why bother

The current setup works on one machine, with one Node process, and
nowhere else. Concrete failure modes:

| Limit                       | What breaks                                                     |
|-----------------------------|-----------------------------------------------------------------|
| Single process              | Two `node server.js` instances corrupt the queue (lock is in JS memory, not the file). |
| Local filesystem only       | Cloud Run, App Engine, and any container with ephemeral disk lose `data/` on restart. |
| Read-only deploys           | Most modern hosting rejects writes to the deploy directory.    |
| No queries                  | "Show me last week's responses" rewrites the entire file in memory. |
| No transactions             | Approve-then-archive in `/api/emails/decision` can leave the queue half-updated on crash. |
| Backups are "copy a file"   | No point-in-time recovery, no consistency guarantees.          |
| No schema                   | Field renames in `serverDatabase.js` silently break old rows.  |

For a one-operator internal tool today, none of these have bitten yet.
For anything cloud-deployed or shared, all of them do.

## What needs to move

`src/api/serverDatabase.js` is the only place the JSON files are
touched. It owns four collections:

| File                       | Records                                          | Volume       |
|----------------------------|--------------------------------------------------|--------------|
| `email_queue.json`         | Pending email drafts awaiting approval           | <100 at once |
| `apollo_pending.json`      | Apollo orgs awaiting accept/decline review       | <500 at once |
| `sent_emails.json`         | Approved emails, archived for reply matching     | grows forever|
| `responses.json`           | Cleaned incoming replies                         | grows forever|

The two "grows forever" collections are why this matters more over time
even on a single machine — eventually `responses.json` is megabytes and
gets rewritten on every reply.

## Picking a database

Three reasonable options. Pick one and don't overthink it.

### Option A — SQLite (simplest jump)

- Single `data/leadflow.db` file. Drop-in replacement for the JSON
  files at the storage layer.
- Real concurrency, real transactions, real queries — none of which
  the JSON files give you.
- Still single-machine. **Doesn't unlock Cloud Run** — same persistent-disk
  requirement as the JSON files.
- Use case: stay on a Compute Engine VM but get safer storage and
  proper queries.
- Library: `better-sqlite3` (synchronous, simple, fast).

### Option B — Firestore (recommended for Cloud Run)

- GCP-native document DB. Each of the four files becomes a collection.
- Generous free tier: 50K reads, 20K writes, 1 GiB stored per day.
  This app's volume fits comfortably.
- No connector, no connection pool, no migrations. Service account
  auth handled by Cloud Run automatically.
- Use case: deploy to Cloud Run, scale to zero, pay nothing on idle.
- Library: `@google-cloud/firestore`.

### Option C — Cloud SQL Postgres (most flexible long-term)

- Full SQL database. Best fit if you eventually want analytics,
  joins, reporting, or admin tools that expect SQL.
- Requires migrations, connection pooling, and the Cloud SQL Auth
  Proxy or a connector.
- Costs ~€8/mo for the smallest instance (`db-f1-micro`) — no free
  tier.
- Library: `pg` (raw) or Drizzle / Prisma (typed).

**My pick:** Firestore for Cloud Run, Postgres if relational queries
are likely within the next 12 months, SQLite if you're staying on the
VM and just want to stop fighting JSON.

> **Decision recorded (2026-05-08):** Postgres was chosen over Firestore.
> The driver layer is in place at `src/api/db/{index,jsonDriver,postgresDriver}.js`,
> the schema lives in [`../db/init.sql`](../db/init.sql), and local dev
> runs Postgres in Docker via `docker compose up -d postgres`. Cloud
> deploy uses Cloud SQL Postgres — see
> [DEPLOY-GCP-WITH-DB.md](./DEPLOY-GCP-WITH-DB.md). The JSON driver still
> works locally as a fallback (`DB_DRIVER=json`).

## Migration steps

The plan is the same regardless of which DB you pick. The only
difference is the implementation of the repository layer.

### 1. Define a repository interface

Replace the loose collection of exported functions in `serverDatabase.js`
with four narrow repositories. Keep the public surface the same — every
call site in `server.js` should be untouched.

```js
// src/api/repositories.js
export const emailQueue = {
  add(email)       { /* ... */ },
  getPending()     { /* ... */ },
  getAll(status)   { /* ... */ },
  delete(id)       { /* ... */ },
  clearByStatus(s) { /* ... */ },
};

export const apolloPending = {
  store(orgs)      { /* ... */ },
  getPending()     { /* ... */ },
  processDecisions(decisions) { /* ... */ },
  clear()          { /* ... */ },
};

export const sentEmails = {
  archive(email)        { /* ... */ },
  findLatestForLead(id) { /* ... */ },
};

export const responses = {
  add(payload) { /* ... */ },
  getAll()     { /* ... */ },
};
```

### 2. Pick a backend at startup, not per-call

```js
// src/api/db.js
const driver = process.env.DB_DRIVER || 'json'; // 'json' | 'sqlite' | 'firestore' | 'postgres'

export const db = await import(`./drivers/${driver}.js`);
```

Local dev keeps `DB_DRIVER=json` (or `sqlite`); production sets
`DB_DRIVER=firestore`. The repository module just delegates.

### 3. Define schemas

For SQLite / Postgres, write a single migration:

```sql
CREATE TABLE email_queue (
  id            TEXT PRIMARY KEY,
  lead_id       TEXT NOT NULL,
  email         TEXT NOT NULL,
  first_name    TEXT NOT NULL,
  email_stage   TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);

CREATE INDEX email_queue_status_idx ON email_queue(status);

CREATE TABLE apollo_pending (
  apollo_id     TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  website_url   TEXT,
  linkedin_url  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE sent_emails (
  id            BIGSERIAL PRIMARY KEY,
  lead_id       TEXT NOT NULL,
  email         TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  email_stage   TEXT NOT NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX sent_emails_lead_id_idx ON sent_emails(lead_id, sent_at DESC);

CREATE TABLE responses (
  id            TEXT PRIMARY KEY,
  from_address  TEXT,
  subject       TEXT,
  date          TIMESTAMPTZ,
  body          TEXT,
  snippet       TEXT,
  person_id     TEXT,
  person_name   TEXT,
  lead_id       TEXT,
  lead_title    TEXT,
  stage         TEXT,
  original      TEXT,
  received_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX responses_received_idx ON responses(received_at DESC);
```

For Firestore, no schema is needed — just decide on collection names
matching the four tables above and store the same fields as documents.

### 4. Write the new driver

The existing `serverDatabase.js` already has all the field-shaping
logic (reply parsing, mojibake fixes, `findSentBodyForLead`). Keep
that logic; only the read/write primitives change.

Sketch for Firestore:

```js
import { Firestore } from '@google-cloud/firestore';
const fs = new Firestore();

export const emailQueue = {
  async add(email) {
    const doc = { ...email, created_at: new Date(), status: 'pending' };
    const ref = fs.collection('email_queue').doc(doc.id);
    await ref.set(doc);
    return doc;
  },
  async getPending() {
    const snap = await fs.collection('email_queue')
      .where('status', '==', 'pending').get();
    return snap.docs.map(d => d.data());
  },
  // ...
};
```

### 5. Backfill from existing JSON

One-time script. Run it locally before flipping `DB_DRIVER`:

```js
// scripts/migrate-to-db.js
import { readFile } from 'node:fs/promises';
import { emailQueue, apolloPending, sentEmails, responses } from '../src/api/repositories.js';

const queue = JSON.parse(await readFile('data/email_queue.json', 'utf8'));
for (const e of queue) await emailQueue.add(e);

// ...same for apollo_pending, sent_emails, responses
```

Verify counts in both stores match before switching.

### 6. Flip the driver, archive `data/`

```env
DB_DRIVER=firestore   # or sqlite, or postgres
```

Then either:
- Delete `data/` from production deploys (the migration script wrote it elsewhere), or
- Snapshot it into `data/.archived-2026-05-05/` for safety, then delete on next deploy.

Don't keep both running — split-brain across two stores is worse than
either alone.

## What this doesn't fix

The DB swap solves storage. It does not solve any of these:

- `VITE_PIPEDRIVE_API_KEY` still bakes into the public JS bundle.
- Browser still calls Pipedrive and n8n directly.
- `App.jsx` still hardcodes `http://localhost:3001`.

See [../ARCHITECTURE.md](../ARCHITECTURE.md) for the full list. Those
are separate refactors; do them when you have time, not as part of
this migration.

## Rollback

If something goes wrong post-flip:

1. Set `DB_DRIVER=json` back in env, redeploy.
2. The `data/` JSON files still exist (you didn't delete them yet).
3. Any data written *after* the flip is in the new DB only — manually
   merge if needed.

This is why step 6 says "archive, don't delete" until the new setup
has soaked for at least a week.
