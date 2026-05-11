-- LeadFlow Pro — Postgres schema.
--
-- Run by Docker on first container creation (mounted into
-- /docker-entrypoint-initdb.d/) and by `npm run db:migrate` against any
-- target the DATABASE_URL points at. Idempotent: safe to re-run.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- email_queue
--   Drafts that n8n has generated and are awaiting human approve/decline.
--   Cleared on approve+archive or decline.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_queue (
    id          TEXT PRIMARY KEY,
    lead_id     TEXT        NOT NULL,
    email       TEXT        NOT NULL,
    first_name  TEXT        NOT NULL,
    email_stage TEXT        NOT NULL,
    subject     TEXT        NOT NULL,
    body        TEXT        NOT NULL,
    status      TEXT        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'approved', 'declined', 'sent')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_email_queue_status  ON email_queue (status);
CREATE INDEX IF NOT EXISTS idx_email_queue_lead_id ON email_queue (lead_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- apollo_pending
--   Apollo-discovered organisations awaiting human review.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS apollo_pending (
    apollo_id    TEXT PRIMARY KEY,
    name         TEXT        NOT NULL,
    website_url  TEXT        NOT NULL DEFAULT '',
    linkedin_url TEXT        NOT NULL DEFAULT '',
    status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'accepted', 'declined')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apollo_pending_status ON apollo_pending (status);

-- ─────────────────────────────────────────────────────────────────────────────
-- sent_emails
--   Append-only archive of approved emails. Used to recover the original
--   body when a reply arrives, since the live queue gets cleared on send.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sent_emails (
    id          BIGSERIAL PRIMARY KEY,
    lead_id     TEXT        NOT NULL,
    email       TEXT        NOT NULL DEFAULT '',
    subject     TEXT        NOT NULL DEFAULT '',
    body        TEXT        NOT NULL DEFAULT '',
    email_stage TEXT        NOT NULL DEFAULT '',
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sent_emails_lead_id_sent_at
    ON sent_emails (lead_id, sent_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- responses
--   Cleaned incoming replies (newest first by received_at).
--   Note: `from_address` and `email_date` are remapped to `from`/`date` in
--   the JS application layer to keep the API shape backward-compatible.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
    id           TEXT PRIMARY KEY,
    from_address TEXT        NOT NULL DEFAULT '',
    subject      TEXT        NOT NULL DEFAULT '',
    email_date   TIMESTAMPTZ,
    body         TEXT        NOT NULL DEFAULT '',
    snippet      TEXT        NOT NULL DEFAULT '',
    person_id    TEXT,
    person_name  TEXT        NOT NULL DEFAULT '',
    lead_id      TEXT,
    lead_title   TEXT        NOT NULL DEFAULT '',
    original     TEXT        NOT NULL DEFAULT '',
    received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_responses_received_at ON responses (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_lead_id     ON responses (lead_id);

-- Drop the legacy `stage` column on existing databases (idempotent).
ALTER TABLE responses DROP COLUMN IF EXISTS stage;

COMMIT;
