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

GCP services are off per-project until you explicitly enable them.

| API | Why this app needs it |
|-----|----------------------|
| `run.googleapis.com` | Cloud Run — serves the Node/Express container |
| `cloudbuild.googleapis.com` | Cloud Build — packages the repo into a Docker image |
| `artifactregistry.googleapis.com` | Stores the built images Cloud Run pulls from |
| `sqladmin.googleapis.com` | Cloud SQL — managed Postgres for the four app tables |
| `secretmanager.googleapis.com` | Secret Manager — holds DB password + Pipedrive token |

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

This is the production database. Cloud Run instances are stateless and
ephemeral, so the email queue, sent-mail archive, Apollo pending, and
responses can't live on disk in the container — they go here instead.

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

The instance is empty. `db/init.sql` defines the four tables the app
expects (`email_queue`, `apollo_pending`, `sent_emails`, `responses`).
To run that SQL from your laptop against a Cloud SQL instance, use the
**Cloud SQL Auth Proxy** — a Google-provided binary that forwards a
local TCP port to your DB over an authenticated tunnel. That way `psql`
(and the migrate script) connect to `127.0.0.1:5432` without exposing
the DB to the public internet.

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

A private Docker registry inside GCP. Cloud Build pushes the built
image here in step 6, and Cloud Run pulls from here when serving
traffic. You need one repository per project.

```bash
gcloud artifacts repositories create "$REPO" \
  --repository-format=docker \
  --location="$REGION" \
  --description="LeadFlow Pro container images"
```

---

## 6. Build & push the image

**Cloud Build** is GCP's hosted CI. It uploads the repo as a tarball,
runs `docker build` against `Dockerfile` (which executes `npm ci &&
npm run build` to produce the static frontend in `dist/`), tags the
output image, and pushes both tags (`:_SHA` and `:latest`) to
Artifact Registry. Takes 3–6 minutes. You could do this with plain
`docker build && docker push` on your laptop, but Cloud Build is
faster and free within the daily quota.

GCP projects created after April 2024 use the Compute Engine default
service account for Cloud Build, and it isn't auto-granted the storage,
logging, Artifact Registry, and Cloud Build roles. Run this once per
project before the first build:

```bash
P=$(gcloud config get-value project)
N=$(gcloud projects describe "$P" --format='value(projectNumber)')
SA="${N}-compute@developer.gserviceaccount.com"

for R in storage.admin logging.logWriter artifactregistry.writer cloudbuild.builds.builder; do
  gcloud projects add-iam-policy-binding "$P" \
    --member="serviceAccount:$SA" \
    --role="roles/$R" \
    --condition=None \
    --quiet >/dev/null
  echo "Granted roles/$R"
done
```

Then submit the build:

```bash
gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="\
_REGION=$REGION,\
_REPO=$REPO,\
_SHA=$(git rev-parse --short HEAD),\
_PIPEDRIVE_PERSON_LINKEDIN_KEY=$(grep ^VITE_PIPEDRIVE_PERSON_LINKEDIN_KEY .env | cut -d= -f2),\
_PIPEDRIVE_PERSON_HEADLINE_KEY=$(grep ^VITE_PIPEDRIVE_PERSON_HEADLINE_KEY .env | cut -d= -f2),\
_PIPEDRIVE_ORG_APOLLO_ID_KEY=$(grep ^VITE_PIPEDRIVE_ORG_APOLLO_ID_KEY .env | cut -d= -f2),\
_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY=$(grep ^VITE_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY .env | cut -d= -f2)"
```

The `VITE_PIPEDRIVE_*` field-key values are pulled straight from your local
`.env`. The n8n URL is NOT a build arg — it's a runtime env var on Cloud
Run (see step 9), so changing n8n environments doesn't require a rebuild.

> Only `VITE_*` values get baked into the *frontend* bundle here. Server-
> side config (`PIPEDRIVE_API_KEY`, `DATABASE_URL`, `N8N_BASE_URL`) are
> wired in at deploy time — see steps 8 and 9.

---

## 7. Service account for Cloud Run

Cloud Run needs an identity to act as when calling other GCP services
(Cloud SQL, Secret Manager). A **service account** is that identity —
like a user but for code. We create a dedicated one (`leadflow-runtime`)
scoped to exactly what this app needs:

- `roles/cloudsql.client` — lets it open a connection through the
  Cloud SQL Auth Proxy socket
- `roles/secretmanager.secretAccessor` — lets it read the DB password
  and Pipedrive token at boot

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

Sensitive values (DB password, Pipedrive token) don't belong in plain
Cloud Run env vars — those are readable by anyone with
`Cloud Run Viewer`. **Secret Manager** keeps values behind their own
ACL (`Secret Manager Secret Accessor` role, granted in step 7),
supports versioning so you can rotate without redeploys, and is
referenced from Cloud Run by name + version instead of value.

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

**Cloud Run** is GCP's serverless container runtime. You hand it an
image and a few knobs (memory, CPU, concurrency, scaling); it gives
you back a public HTTPS URL and runs containers on demand. With
`min-instances=0` it scales to zero between requests — you pay
nothing while idle, ~1-2s cold-start when traffic arrives. This is
what replaces `npm run server` in production.

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
  --set-env-vars="NODE_ENV=production,DB_DRIVER=postgres,N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook" \
  --update-secrets="DATABASE_URL=database-url:latest,PIPEDRIVE_API_KEY=pipedrive-api-key:latest"
```

Notes — what each flag does and why:

| Flag | Why |
|------|-----|
| `--allow-unauthenticated` | Makes the URL publicly reachable so n8n can POST to `/api/*` without an auth token. Auth (when added later) belongs at the app layer. |
| `--service-account` | Identity Cloud Run uses to call other GCP APIs. Without this it uses the broad default compute account. |
| `--add-cloudsql-instances` | Tells Cloud Run to mount the `/cloudsql/<conn>` unix socket inside the container. The `pg` library connects through it via the `host=/cloudsql/...` parameter in the DATABASE_URL. No public IP needed. |
| `--memory=512Mi` / `--cpu=1` | Minimum useful slice for a Node app. Increasing memory linearly increases per-second cost while a request is being served. |
| `--concurrency=80` | How many parallel requests one container instance can handle. Node is single-threaded but async — 80 is the Cloud Run default and fits this app's I/O-bound profile. |
| `--timeout=60` | Max seconds a single request can take before Cloud Run kills it. The longest API call (Pipedrive enrich) is ~5s, so 60s is generous. |
| `--min-instances=0` | Scale to zero. ~1–3s cold start; fine for an internal tool. |
| `--max-instances=3` | Budget ceiling. Handles bursts; prevents surprise bills. |
| `--set-env-vars` | Plain runtime env vars. `NODE_ENV=production` makes Express serve `dist/` and use prod CORS. `DB_DRIVER=postgres` routes the app to the postgres driver instead of `data/*.json`. |
| `--update-secrets` | Pulls secrets at boot as env vars. Values aren't visible in `gcloud run services describe`, unlike `--set-env-vars`. |

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

Full redeploy flow after pushing a code change to GitHub. From Cloud Shell:

```bash
# 1. Pull the latest code
cd ~/leadflow && git pull

# 2. (Only if db/init.sql changed) Apply the migration. Idempotent.
[ -x ./cloud-sql-proxy ] || curl -o cloud-sql-proxy \
  https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.linux.amd64 \
  && chmod +x cloud-sql-proxy
./cloud-sql-proxy "$INSTANCE_CONNECTION_NAME" --port=5432 &
sleep 3
DATABASE_URL="postgres://${DB_USER}:${DB_PASSWORD}@127.0.0.1:5432/${DB_NAME}" npm run db:migrate
kill %1

# 3. Rebuild and push the image
bash deploy/build.sh

# 4. Roll the new image onto Cloud Run
gcloud run services update "$SERVICE_NAME" \
  --image="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest" \
  --region="$REGION"
```

---

## Resetting the DB password

If you lose the `leadflow` user password (or just want to rotate it):

```bash
# Generate a new password via gcloud
NEW_PASSWORD=$(openssl rand -base64 24)
gcloud sql users set-password leadflow \
  --instance="$INSTANCE_NAME" \
  --password="$NEW_PASSWORD"

# Update the database-url secret so Cloud Run keeps working
echo -n "postgres://leadflow:${NEW_PASSWORD}@/leadflow?host=/cloudsql/${INSTANCE_CONNECTION_NAME}" \
  | gcloud secrets versions add database-url --data-file=-

# Trigger a fresh Cloud Run revision so it picks up the new secret version
gcloud run services update "$SERVICE_NAME" --region="$REGION" \
  --update-labels="rotated=$(date +%s)"
```

The `:latest` reference in the deployed service (step 8) means new
secret versions are picked up automatically on each new revision —
no manual rewiring needed.

---

## Pushing changes from Cloud Shell

When you need to commit and push directly from Cloud Shell (e.g. after
running `npm install` to sync the lockfile inside the Cloud Build flow):

```bash
# Identity (one-time, persists across Cloud Shell sessions)
git config --global user.email "you@example.com"
git config --global user.name "Your GitHub Username"

# GitHub authentication — gh CLI is preinstalled in Cloud Shell.
# Pick: GitHub.com → HTTPS → Yes (auth git too) → Login with a web browser.
gh auth login
```

After that `git push` from Cloud Shell works without prompting for credentials.

---

## Troubleshooting

| Error / symptom | Cause | Fix |
|-----------------|-------|-----|
| `npm error code EUSAGE … npm ci can only install packages when your package.json and package-lock.json are in sync` during Cloud Build | Lockfile drift | `npm install` to regenerate, then commit + push `package-lock.json`, then re-run `gcloud builds submit` |
| `does not have storage.objects.get access` during `gcloud builds submit` | Compute SA missing Cloud Build IAM (post-April-2024 GCP projects) | Run `bash deploy/grant-cloudbuild-iam.sh` once per project |
| `invalid image name "…/app:": could not parse reference` | `${SHORT_SHA}` is empty for manual `gcloud builds submit` | Pass `_SHA=$(git rev-parse --short HEAD)` in `--substitutions` (the `cloudbuild.yaml` defaults `_SHA` to `manual` if omitted) |
| Cloud Run revision creation fails with `Image 'mirror.gcr.io/…' not found` | Wrong image URL pasted | Use the full Artifact Registry URL: `${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/app:latest` |
| `Failed to approve email: N8N_BASE_URL is not configured on the server` | Missing runtime env var on Cloud Run | Add `N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook` to `--set-env-vars` or via the UI |
| `Failed to approve email: VITE_N8N_BASE_URL is not configured on the server` | Old image running before the n8n proxy refactor | Rebuild and redeploy with the latest commit |
| Cloud Shell `git pull` aborts on local changes | Edits made in Cloud Shell that aren't committed | `git checkout <file>` to discard, or `git stash` to save; then `git pull` |
| `Author identity unknown` on `git commit` in Cloud Shell | git config not set | See "Pushing changes from Cloud Shell" above |
| `Username for github.com:` prompt | GitHub no longer accepts passwords | Run `gh auth login` |

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
