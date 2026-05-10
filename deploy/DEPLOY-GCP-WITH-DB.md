# Deploying LeadFlow Pro to Google Cloud Run + Cloud SQL Postgres

This is the runbook for the deploy branch. Every command is copy-pasteable;
fill in the placeholders at the top once and the rest works.

> **Storage choice:** Postgres (not Firestore). See
> [DATABASE.md](./DATABASE.md) for why.

---

## 0. Prerequisites

Before you start, make sure you have:

- [`gcloud` CLI](https://cloud.google.com/sdk/docs/install) installed and updated.
- Docker Desktop running (only needed if you want to test the image locally).
- A working local setup — Phase 2 done, `DB_DRIVER=postgres` flows end-to-end.
- Billing enabled on your Google Cloud account.

Authenticate once:

```bash
gcloud auth login
gcloud auth application-default login
```

---

## 1. Pick names + create the project

```bash
# Edit these once, paste the whole block.
export PROJECT_ID=leadflow-prod-$(date +%s)        # must be globally unique
export REGION=europe-west1
export SERVICE_NAME=leadflow
export REPO=leadflow
export DB_INSTANCE=leadflow-db
export DB_NAME=leadflow
export DB_USER=leadflow
export DB_PASSWORD=$(openssl rand -base64 24)      # save this somewhere safe

gcloud projects create "$PROJECT_ID" --name="LeadFlow Prod"
gcloud config set project "$PROJECT_ID"
```

Link a billing account (UI → *Billing* → link to project, or the
`gcloud beta billing` command if you know your billing account ID).

---

## 2. Enable APIs

```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com
```

---

## 3. Cloud SQL Postgres instance

Smallest tier. Public IP, but with no authorised networks — Cloud Run
reaches it via the Cloud SQL Auth Proxy unix socket, so the public IP
isn't actually exposed to the internet.

```bash
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 \
  --tier=db-f1-micro \
  --region="$REGION" \
  --storage-size=10GB \
  --storage-type=SSD \
  --backup \
  --backup-start-time=03:00

gcloud sql databases create "$DB_NAME" --instance="$DB_INSTANCE"
gcloud sql users create "$DB_USER" --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
```

Get the connection name (you'll need it later):

```bash
export INSTANCE_CONNECTION_NAME=$(gcloud sql instances describe "$DB_INSTANCE" \
  --format='value(connectionName)')
echo "$INSTANCE_CONNECTION_NAME"
# → leadflow-prod-...:europe-west1:leadflow-db
```

---

## 4. Apply the schema

Run `db/init.sql` against the new Cloud SQL instance from your laptop via
the Cloud SQL Auth Proxy.

```bash
# Download and run the proxy in a separate terminal:
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
./cloud-sql-proxy "$INSTANCE_CONNECTION_NAME"
# Now Postgres is reachable on 127.0.0.1:5432
```

In your project terminal:

```bash
DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}" \
  npm run db:migrate
```

You should see `Migration complete.` Stop the proxy (Ctrl+C in its
terminal) when done.

---

## 5. Artifact Registry repo

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="LeadFlow Pro container images"
```

---

## 6. Build & push the image

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="\
_REGION=$REGION,\
_REPO=$REPO,\
_N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook,\
_PIPEDRIVE_PERSON_LINKEDIN_KEY=$(grep ^VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY .env | cut -d= -f2),\
_PIPEDRIVE_PERSON_HEADLINE_KEY=$(grep ^VITE_PIPEDRIVE_PERSON_HEADLINE_KEY .env | cut -d= -f2),\
_PIPEDRIVE_ORG_APOLLO_ID_KEY=$(grep ^VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY .env | cut -d= -f2),\
_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY=$(grep ^VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY .env | cut -d= -f2)"
```

The `VITE_*` field-key values are pulled straight from your local `.env`.
Replace `_N8N_BASE_URL` with the n8n webhook URL you actually use in prod.

> Only `VITE_*` values get baked into the *frontend* bundle here. Server-
> side secrets (`PIPEDRIVE_API_KEY`, `DATABASE_URL`) are wired in at
> deploy time via Secret Manager — see step 8.

---

## 7. Service account for Cloud Run

```bash
gcloud iam service-accounts create leadflow-runtime \
  --display-name="LeadFlow Cloud Run runtime"

export SA_EMAIL="leadflow-runtime@${PROJECT_ID}.iam.gserviceaccount.com"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/cloudsql.client"

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 8. Secrets in Secret Manager

```bash
# Pipedrive API token (server-side only)
PIPEDRIVE_API_KEY=$(grep -E '^(VITE_)?PIPEDRIVE_API_KEY=' .env | head -1 | cut -d= -f2)
echo -n "$PIPEDRIVE_API_KEY" | gcloud secrets create pipedrive-api-key --data-file=-

# DATABASE_URL — Cloud SQL Auth Proxy unix-socket form
DATABASE_URL_PROD="postgres://${DB_USER}:${DB_PASSWORD}@/${DB_NAME}?host=/cloudsql/${INSTANCE_CONNECTION_NAME}"
echo -n "$DATABASE_URL_PROD" | gcloud secrets create database-url --data-file=-
```

The `host=/cloudsql/...` parameter tells `pg` to connect via a unix
socket — Cloud Run mounts one for every Cloud SQL instance you attach
with `--add-cloudsql-instances`.

---

## 9. Deploy to Cloud Run

```bash
gcloud run deploy "$SERVICE_NAME" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest" \
  --region="$REGION" \
  --platform=managed \
  --allow-unauthenticated \
  --service-account="$SA_EMAIL" \
  --add-cloudsql-instances="$INSTANCE_CONNECTION_NAME" \
  --memory=512Mi \
  --cpu=1 \
  --min-instances=0 \
  --max-instances=3 \
  --concurrency=80 \
  --timeout=60 \
  --set-env-vars="NODE_ENV=production,DB_DRIVER=postgres" \
  --update-secrets="DATABASE_URL=database-url:latest,PIPEDRIVE_API_KEY=pipedrive-api-key:latest"
```

Notes:

| Flag | Why |
|------|-----|
| `--allow-unauthenticated` | Public URL. n8n posts directly to `/api/*`. |
| `--min-instances=0` | Scale to zero. ~1–3s cold start; fine for an internal tool. |
| `--max-instances=3` | Budget ceiling. Handles bursts; prevents surprise bills. |
| `--add-cloudsql-instances` | Mounts `/cloudsql/<conn>` unix socket for `pg`. |
| `--update-secrets` | Pulls secrets at boot — they don't show up in `gcloud run services describe`. |

After it deploys, copy the URL it prints (`https://leadflow-xxx-ew.a.run.app`).

---

## 10. Update n8n

Every n8n HTTP Request node that posts to the app needs the new URL.
Affected nodes (currently pointing at Cloudflare Tunnel / localhost):

- `POST /api/email-queue`
- `POST /api/responses`
- `POST /api/workflow-errors`
- `POST /api/apollo/results`
- `POST /api/organization/success`
- `POST /api/organization/error`

Replace the host with `https://leadflow-xxx-ew.a.run.app` in each of
those nodes, save, re-activate the workflows.

You can stop the Cloudflare Tunnel — it's no longer needed for prod.
Local dev still uses it (n8n cloud → your laptop).

---

## 11. Verify

```bash
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" \
  --region="$REGION" --format='value(status.url)')

# Should return { status: "ok", driver: "postgres", ... }
curl "$SERVICE_URL/health"

# Open the UI
echo "$SERVICE_URL"
```

Then walk the four-stage workflow in the browser. If anything fails,
check `gcloud run services logs read "$SERVICE_NAME" --region="$REGION"`.

---

## Cost summary

| Component | Floor / mo |
|-----------|-----------|
| Cloud SQL `db-f1-micro` (24/7) | ~€8 |
| Cloud SQL storage (10 GB) | ~€1 |
| Cloud Run (scale to zero) | ~€0 idle, <€2 typical |
| Artifact Registry (1 image) | ~€0.10 |
| Cloud Build (build minutes) | free up to 120 min/day |
| **Total** | **~€10/mo** |

---

## Updating after this initial deploy

To roll out a new version of the app:

```bash
gcloud builds submit --config=cloudbuild.yaml \
  --substitutions="_REGION=$REGION,_REPO=$REPO,_N8N_BASE_URL=...,..."

gcloud run services update "$SERVICE_NAME" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest" \
  --region="$REGION"
```

If you change `db/init.sql`, re-apply via the Auth Proxy (step 4 again).

---

## Rollback

Cloud Run keeps revisions automatically:

```bash
gcloud run revisions list --service="$SERVICE_NAME" --region="$REGION"

# Send 100% of traffic to a previous revision
gcloud run services update-traffic "$SERVICE_NAME" \
  --region="$REGION" \
  --to-revisions=<REVISION_NAME>=100
```

---

## Future: making this multi-user with auth

Currently the deployed app is single-tenant — one Pipedrive account,
shared by every visitor of the URL. To turn it into a multi-user product
you'd need:

1. **Frontend auth:** add Firebase Auth (or Clerk, Auth0, etc.) and gate
   the app behind a sign-in screen.
2. **Per-user data scoping:** every Firestore-style insert in the four
   tables needs a `user_id` column / index. Update `db/init.sql`,
   `postgresDriver.js`, and every read/write call.
3. **n8n workflow plumbing:** the frontend has to send `user_id` when
   it triggers an n8n flow. n8n carries it through every Set/Function
   node and includes it in every callback. Otherwise callbacks have no
   idea whose queue to write to.
4. **Per-user Pipedrive credentials:** the most painful piece. Each
   user's Pipedrive token would have to be stored encrypted in your DB
   and threaded through n8n on every request — n8n's "stored
   credentials" UI doesn't help here because credentials are static.
5. **CORS:** if the auth provider needs callback URLs from the frontend
   origin, tighten `FRONTEND_ORIGIN` accordingly.

None of that is in scope for this single-operator deploy. Keep this
section as a reminder for when you grow.
