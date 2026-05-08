// Apply db/init.sql to whatever DATABASE_URL points at.
//
// Idempotent: every statement in init.sql uses `IF NOT EXISTS`, so this is
// safe to re-run. Use this for:
//   - The first run against a fresh Cloud SQL / managed Postgres instance.
//   - Re-applying schema after editing init.sql (locally or in deploy).
//
// Usage:
//   npm run db:migrate
//   DATABASE_URL=postgres://... node scripts/dbMigrate.js

import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Client } = pg;
const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = resolve(__dirname, '../db/init.sql');

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('ERROR: DATABASE_URL is not set.');
    console.error('  Set it in .env or pass inline: DATABASE_URL=postgres://... npm run db:migrate');
    process.exit(1);
  }

  const sql = readFileSync(SQL_PATH, 'utf8');
  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log(`Applying ${SQL_PATH} to ${redact(databaseUrl)}...`);
    await client.query(sql);
    console.log('Migration complete.');
  } catch (error) {
    console.error('Migration failed:', error.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

function redact(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '<unparseable DATABASE_URL>';
  }
}

main();
