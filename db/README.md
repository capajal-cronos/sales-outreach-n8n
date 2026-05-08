# LeadFlow Postgres — local setup & inspection

Schema lives in [`init.sql`](./init.sql). Docker auto-runs it on first
volume creation. For non-Docker targets (Cloud SQL, etc.) run
`npm run db:migrate` to apply the same SQL.

## Setup & start

```powershell
# 1. Make sure Docker Desktop is running.

# 2. Boot the Postgres container. init.sql runs automatically the first time.
npm run db:up

# 3. In .env, flip:
#       DB_DRIVER=json    →    DB_DRIVER=postgres
#    (DATABASE_URL is already pre-filled with the local connection string.)

# 4. Start the app.
npm start
```

On boot the API logs `db driver: postgres`. The DB starts empty, so the
Apollo queue, email queue, and responses are reset compared to whatever
was in `data/*.json`.

## Useful npm scripts

| Command | What it does |
|---------|--------------|
| `npm run db:up` | Start the local Postgres container in the background. |
| `npm run db:down` | Stop the container (volume — and your data — survives). |
| `npm run db:reset` | Nuke the volume and recreate. **Destroys all rows.** |
| `npm run db:migrate` | Re-apply `init.sql` against `DATABASE_URL`. Idempotent. |

If you edit `init.sql` (add a column, add an index), restart by either
`db:reset` (loses data) or `db:migrate` (preserves data).

## Connection details

| Field | Value |
|-------|-------|
| Host | `127.0.0.1` |
| Port | `5432` |
| Database | `leadflow` |
| User | `leadflow` |
| Password | `leadflow_dev_password` |
| URL | `postgres://leadflow:leadflow_dev_password@127.0.0.1:5432/leadflow` |

The container is bound to `127.0.0.1` only — never reachable from outside
your machine.

## Seeing rows in the tables

### Option 1 — `psql` inside the container (no install needed)

```powershell
docker exec -it leadflow-postgres psql -U leadflow -d leadflow
```

Once inside:

```sql
\dt                                                  -- list all tables
\d email_queue                                       -- describe a table
SELECT * FROM email_queue;
SELECT * FROM apollo_pending;
SELECT * FROM responses ORDER BY received_at DESC LIMIT 20;
SELECT count(*) FROM sent_emails;
\q                                                   -- quit
```

### Option 2 — GUI client (recommended for browsing)

Use whichever Postgres client you prefer. Note: **Postgres.app is macOS-only.**
On Windows the closest equivalents are:

- **pgAdmin** — the official Postgres GUI. Already bundled if you ever ran
  the official Postgres installer; otherwise grab it from
  [pgadmin.org/download](https://www.pgadmin.org/download/). On Windows
  search the Start menu for "pgAdmin 4".
- **DBeaver Community** ([dbeaver.io](https://dbeaver.io/download/)) — free,
  cross-platform, more browsable than pgAdmin.
- **VS Code extension** — "PostgreSQL" by Chris Kolkman, or "SQLTools" with
  the Postgres driver.

In any of them, create a new Postgres connection with the credentials in
the table above. The four tables (`email_queue`, `apollo_pending`,
`sent_emails`, `responses`) appear under the `public` schema.

## Switching back to JSON storage

Set `DB_DRIVER=json` in `.env` and restart `npm start`. The container can
keep running — the app just stops talking to it. Data written while on
`json` lives in `data/*.json`; data written while on `postgres` lives in
the Postgres volume. They don't sync.

## Troubleshooting

| Symptom | Likely cause / fix |
|--------|--------------------|
| `DATABASE_URL is not set but DB_DRIVER=postgres` | Add `DATABASE_URL` to `.env` (the example value works for local Docker), or flip back to `DB_DRIVER=json`. |
| `connect ECONNREFUSED 127.0.0.1:5432` | Container not running — `npm run db:up`. Or Docker Desktop is closed. |
| `relation "email_queue" does not exist` | Volume exists but schema wasn't applied. Run `npm run db:migrate`. |
| `/health` returns 503 with `status: degraded` | API can't reach Postgres. Check the container is healthy with `docker ps`. |
| Need to wipe everything and start fresh | `npm run db:reset`. |
