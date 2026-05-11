// Postgres driver. Used when DB_DRIVER=postgres.
//
// Key practices:
//   - One pg.Pool per process (NOT a Client per query); shared across handlers.
//   - All queries are parameterised — never string-concatenate user input.
//   - Multi-statement work (decisions batch) runs inside a transaction.
//   - Schema-level concerns live in db/init.sql; this file only does CRUD.
//   - Column names that overlap with SQL keywords (`from`) are remapped on
//     read/write so the JS app sees the same shape as the JSON driver does.

import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error(
    'DATABASE_URL is not set but DB_DRIVER=postgres. ' +
    'Either set DATABASE_URL in .env, switch DB_DRIVER to "json", or run docker compose up -d postgres.'
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000
});

// Surface idle-client errors instead of crashing the process silently.
pool.on('error', (error) => {
  console.error('[postgres] idle client error:', error);
});

// Exported so server.js can ping the DB in /health and close the pool on
// graceful shutdown.
export async function ping() {
  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
  } finally {
    client.release();
  }
}

export async function close() {
  await pool.end();
}

export async function init() {
  // Schema is owned by db/init.sql (run via Docker initdb on first volume
  // creation, or `npm run db:migrate` for non-Docker targets). We just verify
  // the connection here — failing here is a clearer error than failing on the
  // first real query.
  await ping();
}

function mapResponseRow(row) {
  // DB columns: from_address, email_date — JS shape uses from, date.
  return {
    id:          row.id,
    from:        row.from_address,
    subject:     row.subject,
    date:        row.email_date instanceof Date ? row.email_date.toISOString() : row.email_date,
    body:        row.body,
    snippet:     row.snippet,
    person_id:   row.person_id,
    person_name: row.person_name,
    lead_id:     row.lead_id,
    lead_title:  row.lead_title,
    original:    row.original,
    received_at: row.received_at instanceof Date ? row.received_at.toISOString() : row.received_at
  };
}

function mapEmailQueueRow(row) {
  return {
    id:           row.id,
    lead_id:      row.lead_id,
    email:        row.email,
    first_name:   row.first_name,
    email_stage:  row.email_stage,
    subject:      row.subject,
    body:         row.body,
    status:       row.status,
    created_at:   row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    reviewed_at:  row.reviewed_at instanceof Date ? row.reviewed_at.toISOString() : row.reviewed_at
  };
}

function mapSentEmailRow(row) {
  return {
    lead_id:     row.lead_id,
    email:       row.email,
    subject:     row.subject,
    body:        row.body,
    email_stage: row.email_stage,
    sent_at:     row.sent_at instanceof Date ? row.sent_at.toISOString() : row.sent_at
  };
}

function mapApolloPendingRow(row) {
  return {
    apollo_id:    row.apollo_id,
    name:         row.name,
    website_url:  row.website_url,
    linkedin_url: row.linkedin_url,
    status:       row.status,
    created_at:   row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// apollo_pending
// ─────────────────────────────────────────────────────────────────────────────
export const apolloPending = {
  async storeMany(orgs) {
    if (orgs.length === 0) return 0;
    // ON CONFLICT DO NOTHING gives us idempotent upserts without a separate
    // SELECT-then-INSERT race. Returns the rows we actually inserted.
    const values = orgs.map((_, i) => {
      const o = i * 4;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4})`;
    }).join(', ');
    const params = orgs.flatMap(o => [
      o.apollo_id,
      o.name,
      o.website_url || '',
      o.linkedin_url || ''
    ]);
    const result = await pool.query(
      `INSERT INTO apollo_pending (apollo_id, name, website_url, linkedin_url)
         VALUES ${values}
         ON CONFLICT (apollo_id) DO NOTHING
       RETURNING apollo_id`,
      params
    );
    return result.rowCount;
  },

  async findPending() {
    const result = await pool.query(
      `SELECT apollo_id, name, website_url, linkedin_url, status, created_at
         FROM apollo_pending
         WHERE status = 'pending'
         ORDER BY created_at ASC`
    );
    return result.rows.map(mapApolloPendingRow);
  },

  async findByApolloIds(ids) {
    if (ids.length === 0) return [];
    const result = await pool.query(
      `SELECT apollo_id, name, website_url, linkedin_url, status, created_at
         FROM apollo_pending
         WHERE apollo_id = ANY($1)`,
      [ids]
    );
    return result.rows.map(mapApolloPendingRow);
  },

  async deleteByApolloIds(ids) {
    if (ids.length === 0) return;
    await pool.query(
      `DELETE FROM apollo_pending WHERE apollo_id = ANY($1)`,
      [ids]
    );
  },

  async clear() {
    await pool.query(`DELETE FROM apollo_pending`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// email_queue
// ─────────────────────────────────────────────────────────────────────────────
export const emailQueue = {
  async insert(email) {
    const result = await pool.query(
      `INSERT INTO email_queue
         (id, lead_id, email, first_name, email_stage, subject, body, status, created_at, reviewed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        email.id,
        email.lead_id,
        email.email,
        email.first_name,
        email.email_stage,
        email.subject,
        email.body,
        email.status,
        email.created_at,
        email.reviewed_at
      ]
    );
    return mapEmailQueueRow(result.rows[0]);
  },

  async findPending() {
    const result = await pool.query(
      `SELECT * FROM email_queue WHERE status = 'pending' ORDER BY created_at ASC`
    );
    return result.rows.map(mapEmailQueueRow);
  },

  async findAll(status) {
    const result = status
      ? await pool.query(`SELECT * FROM email_queue WHERE status = $1 ORDER BY created_at ASC`, [status])
      : await pool.query(`SELECT * FROM email_queue ORDER BY created_at ASC`);
    return result.rows.map(mapEmailQueueRow);
  },

  async findLatestForLead(leadId) {
    const result = await pool.query(
      `SELECT * FROM email_queue
         WHERE lead_id = $1
         ORDER BY COALESCE(reviewed_at, created_at) DESC
         LIMIT 1`,
      [leadId]
    );
    return result.rows[0] ? mapEmailQueueRow(result.rows[0]) : null;
  },

  async deleteById(id) {
    const result = await pool.query(`DELETE FROM email_queue WHERE id = $1`, [id]);
    if (result.rowCount === 0) {
      throw new Error('Email not found');
    }
  },

  async deleteByStatus(status) {
    const result = await pool.query(`DELETE FROM email_queue WHERE status = $1`, [status]);
    return result.rowCount;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// sent_emails
// ─────────────────────────────────────────────────────────────────────────────
export const sentEmails = {
  async insert(email) {
    await pool.query(
      `INSERT INTO sent_emails (lead_id, email, subject, body, email_stage)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        email.lead_id,
        email.email || '',
        email.subject || '',
        email.body || '',
        email.email_stage || ''
      ]
    );
  },

  async findLatestForLead(leadId) {
    const result = await pool.query(
      `SELECT lead_id, email, subject, body, email_stage, sent_at
         FROM sent_emails
         WHERE lead_id = $1
         ORDER BY sent_at DESC
         LIMIT 1`,
      [leadId]
    );
    return result.rows[0] ? mapSentEmailRow(result.rows[0]) : null;
  },

  async findLatestForEmail(email) {
    if (!email) return null;
    const result = await pool.query(
      `SELECT lead_id, email, subject, body, email_stage, sent_at
         FROM sent_emails
         WHERE lower(email) = lower($1)
         ORDER BY sent_at DESC
         LIMIT 1`,
      [email.trim()]
    );
    return result.rows[0] ? mapSentEmailRow(result.rows[0]) : null;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// responses
// ─────────────────────────────────────────────────────────────────────────────
export const responses = {
  async insert(response) {
    await pool.query(
      `INSERT INTO responses
         (id, from_address, subject, email_date, body, snippet,
          person_id, person_name, lead_id, lead_title, original, received_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        response.id,
        response.from || '',
        response.subject || '',
        response.date || null,
        response.body || '',
        response.snippet || '',
        response.person_id || null,
        response.person_name || '',
        response.lead_id || null,
        response.lead_title || '',
        response.original || '',
        response.received_at
      ]
    );
  },

  async findAll() {
    const result = await pool.query(
      `SELECT * FROM responses ORDER BY received_at DESC`
    );
    return result.rows.map(mapResponseRow);
  }
};
