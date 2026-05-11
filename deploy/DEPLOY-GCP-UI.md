# Deploying LeadFlow Pro via the Google Cloud Console (UI + Cloud Shell)

Same end result as [DEPLOY-GCP-WITH-DB.md](./DEPLOY-GCP-WITH-DB.md) but
mostly clicked through in the browser. A handful of steps still need a
terminal — that's what Cloud Shell is for. No local install required.

> Cloud Shell = the `>_` icon in the top-right of console.cloud.google.com.
> It opens a Linux terminal in the browser, pre-authenticated as your
> Google account, with `gcloud`, `git`, and `node` already installed.

Keep this file open in another tab as you go, plus the Console.

---

## Names you'll use throughout

Decide them once:

| Variable | Example | Notes |
|----------|---------|-------|
| Project ID | `leadflow-prod-2026` | Globally unique. Lowercase, dashes only. |
| Region | `europe-west1` | Same region for everything. |
| Cloud SQL instance | `leadflow-db` | |
| Database name | `leadflow` | |
| Database user | `leadflow` | |
| Database password | (generated) | Save this somewhere — you'll need it. |
| Artifact Registry repo | `leadflow` | |
| Cloud Run service | `leadflow` | |
| Service account | `leadflow-runtime` | |

---

## 1. Create the project

**UI:** top bar → project dropdown → **New project**.

| Field | Value |
|-------|-------|
| Project name | `LeadFlow Prod` |
| Project ID | `leadflow-prod-2026` (or pick your own — must be globally unique) |
| Organization / Location | leave default unless you have a Workspace org |

Click **Create**. Wait ~10 seconds. Switch to the new project via the
top-bar dropdown.

**Billing:** if it's not already linked, top-left menu → **Billing** →
**Link a billing account**.

---

## 2. Enable APIs

UI → top-left menu → **APIs & Services** → **Library**. Search and
**Enable** these one by one (each takes ~10 seconds):

- Cloud Run Admin API
- Cloud Build API
- Artifact Registry API
- Cloud SQL Admin API
- Secret Manager API

Quicker alternative: open **Cloud Shell** (`>_` icon top right) and paste:

```bash
gcloud services enable \
  run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  sqladmin.googleapis.com secretmanager.googleapis.com
```

---

## 3. Cloud SQL Postgres instance

UI → menu → **SQL** → **Create instance** → choose **PostgreSQL**.

| Field | Value |
|-------|-------|
| Choose a Cloud SQL edition | **Enterprise** (cheapest baseline) |
| Preset | **Sandbox** (lowest cost) |
| Instance ID | `leadflow-db` |
| Password | click *Generate* — copy the value to a password manager |
| Database version | **PostgreSQL 16** |
| Region | `europe-west1` |
| Zonal availability | **Single zone** (saves money) |
| Machine configuration → Machine type | **Shared core** → **1 vCPU, 0.614 GB** (`db-f1-micro`) |
| Storage type | **SSD** |
| Storage capacity | **10 GB** |
| Storage auto-increase | leave **enabled** |
| Connections → Public IP | **Enabled**, *Authorized networks*: leave empty |
| Connections → Private IP | leave **disabled** |
| Backups | leave defaults (daily backup on) |

Click **Create instance**. This takes ~5 minutes — wait for the green
check.

When it's done, on the instance overview page note the **Connection
name** (looks like `leadflow-prod-2026:europe-west1:leadflow-db`).
You'll paste it twice later.

### Create the application database

Same instance page → left tab **Databases** → **Create database**.

| Field | Value |
|-------|-------|
| Database name | `leadflow` |
| Character set | `UTF8` |
| Collation | `en_US.UTF8` (default) |

### Create the application user

Left tab **Users** → **Add user account**.

| Field | Value |
|-------|-------|
| User type | **Built-in** (default) |
| User name | `leadflow` |
| Password | generate a new strong one — copy it; this is your `DB_PASSWORD` |

The default `postgres` admin user stays untouched.

---

## 4. Apply the schema (Cloud Shell)

Open **Cloud Shell** (`>_` icon, top right). It opens a terminal at the
bottom of your browser.

```bash
# Clone your repo into Cloud Shell
git clone <your-repo-url> leadflow
cd leadflow
git checkout deploy
npm ci

# Connection details — paste your values
INSTANCE_CONNECTION_NAME='leadflow-prod-2026:europe-west1:leadflow-db'
DB_PASSWORD='<the leadflow user password from step 3>'

# Start the Cloud SQL Auth Proxy in the background
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.13.0/cloud-sql-proxy.linux.amd64
chmod +x cloud-sql-proxy
./cloud-sql-proxy "$INSTANCE_CONNECTION_NAME" --port=5432 &

sleep 3

# Apply the schema
DATABASE_URL="postgres://leadflow:${DB_PASSWORD}@127.0.0.1:5432/leadflow" \
  npm run db:migrate
```

You should see `Migration complete.` Once it's printed, kill the proxy:

```bash
kill %1
```

To verify the tables landed, in the UI: **SQL** → `leadflow-db` → left
tab **Cloud SQL Studio**, log in as `leadflow` / your password / database
`leadflow`. Run:

```sql
\dt
```

Should list four tables.

---

## 5. Artifact Registry repo

UI → menu → **Artifact Registry** → **Repositories** → **Create
repository**.

| Field | Value |
|-------|-------|
| Name | `leadflow` |
| Format | **Docker** |
| Mode | **Standard** |
| Region | `europe-west1` |
| Encryption | Google-managed key (default) |

**Create**.

---

## 6. Build & push the image (Cloud Shell)

Still in your Cloud Shell session in the cloned repo.

### 6a. Grant Cloud Build the IAM roles it needs (once per project)

GCP projects created after April 2024 use the Compute Engine default
service account for Cloud Build, and it isn't auto-granted the storage,
logging, Artifact Registry, and Cloud Build roles. Paste this block in
Cloud Shell to grant all four at once:

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

You'll see `Granted roles/...` four times. Skip this section if you've
already run it for this project.

### 6b. Submit the build

```bash
PROJECT_ID=$(gcloud config get-value project)

# Public-bundle build args — Pipedrive custom-field identifiers, not
# secrets. Paste your four VITE_PIPEDRIVE_* values from your laptop's
# .env. The n8n URL is NOT here — it's a runtime env var on Cloud Run
# (step 9), because the server proxies /api/n8n/* to the real host.
PIPEDRIVE_PERSON_LINKEDIN_KEY='4ba0d4...'
PIPEDRIVE_PERSON_HEADLINE_KEY='722b3a...'
PIPEDRIVE_ORG_APOLLO_ID_KEY='85eec8...'
PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY='1c1e4a...'

SHA=$(git rev-parse --short HEAD)

gcloud builds submit \
  --config=cloudbuild.yaml \
  --substitutions="\
_REGION=europe-west1,\
_REPO=leadflow,\
_SHA=${SHA},\
_PIPEDRIVE_PERSON_LINKEDIN_KEY=${PIPEDRIVE_PERSON_LINKEDIN_KEY},\
_PIPEDRIVE_PERSON_HEADLINE_KEY=${PIPEDRIVE_PERSON_HEADLINE_KEY},\
_PIPEDRIVE_ORG_APOLLO_ID_KEY=${PIPEDRIVE_ORG_APOLLO_ID_KEY},\
_PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY=${PIPEDRIVE_ORG_COMPANY_DESCRIPTION_KEY}"
```

Watch the build run; it ends with `SUCCESS` and prints two image tags.

Verify in UI: **Artifact Registry** → `leadflow` → you should see one
image with two tags (`latest` and a short SHA).

---

## 7. Service account for Cloud Run

UI → menu → **IAM & Admin** → **Service Accounts** → **Create service
account**.

| Field | Value |
|-------|-------|
| Service account ID | `leadflow-runtime` |
| Display name | `LeadFlow Cloud Run runtime` |
| Description | (optional) |

Click **Create and continue**.

**Grant roles:**

- `Cloud SQL Client` (lets it talk to the DB through the auth proxy)
- `Secret Manager Secret Accessor` (lets it read DATABASE_URL + Pipedrive token at boot)

Click **Continue** → **Done**.

(You can skip the optional "Grant users access" step.)

---

## 8. Secrets in Secret Manager

UI → menu → **Security** → **Secret Manager** → **Create secret**.

### Secret 1 — `pipedrive-api-key`

| Field | Value |
|-------|-------|
| Name | `pipedrive-api-key` |
| Secret value | paste your Pipedrive token (the long hex string from `.env`) |
| Replication | **Automatic** |

**Create secret**. Then on the secret's detail page → **Permissions**
tab → **Grant access** → add `leadflow-runtime@<project>.iam.gserviceaccount.com`
with role *Secret Manager Secret Accessor*. (You can also skip this if
you already granted the role at the project level in step 7 — that
already covers all secrets.)

### Secret 2 — `database-url`

Same flow.

| Field | Value |
|-------|-------|
| Name | `database-url` |
| Secret value | `postgres://leadflow:<DB_PASSWORD>@/leadflow?host=/cloudsql/<INSTANCE_CONNECTION_NAME>` |

Replace `<DB_PASSWORD>` with the leadflow user password from step 3,
and `<INSTANCE_CONNECTION_NAME>` with the value you noted at the end
of step 3 (e.g. `leadflow-prod-2026:europe-west1:leadflow-db`).

> The `host=/cloudsql/...` parameter looks weird. It tells the `pg`
> library to connect via a unix socket — Cloud Run mounts one for every
> Cloud SQL instance you attach with `--add-cloudsql-instances`. No
> network credentials, no public IP usage.

---

## 9. Deploy to Cloud Run

UI → menu → **Cloud Run** → **Deploy container** → **Service**.

### Container

| Field | Value |
|-------|-------|
| Container image URL | click **Select** → Artifact Registry → `leadflow/app:latest` |
| Service name | `leadflow` |
| Region | `europe-west1` |
| Authentication | **Allow unauthenticated invocations** |
| CPU allocation and pricing | **CPU is only allocated during request processing** (cheapest) |

### Container, Networking, Security

Expand the **Container, Networking, Security** section.

**Container** tab:
| Field | Value |
|-------|-------|
| Container port | `8080` |
| Memory | `512 MiB` |
| CPU | `1` |
| Request timeout | `60` |
| Maximum concurrent requests | `80` |

**Variables & Secrets** tab:

Plain env vars (click **Add variable**):
| Name | Value |
|------|-------|
| `NODE_ENV` | `production` |
| `DB_DRIVER` | `postgres` |
| `N8N_BASE_URL` | your n8n webhook base URL, e.g. `https://your-n8n.app.n8n.cloud/webhook` (server-side only — proxied through `/api/n8n/*`) |

Secrets (click **Reference a secret**):
| Env var name | Secret | Version |
|--------------|--------|---------|
| `DATABASE_URL` | `database-url` | `latest` |
| `PIPEDRIVE_API_KEY` | `pipedrive-api-key` | `latest` |

**Connections** tab:
- **Cloud SQL connections** → **Add connection** → pick `leadflow-db`.

**Security** tab:
- **Service account** → choose `leadflow-runtime`.

### Autoscaling

Expand **Revision autoscaling**.

| Field | Value |
|-------|-------|
| Minimum number of instances | `0` (scale to zero) |
| Maximum number of instances | `3` |

### Deploy

Scroll down → **Create**. First deploy takes ~30–60 seconds.

The service detail page shows the public URL at the top, like
`https://leadflow-xxxxxx-ew.a.run.app`. Copy it — you need it for the
next step.

---

## 10. Update n8n's HTTP Request URLs

In your n8n workflows, every HTTP Request node that posts back to the
app currently uses your localhost / Cloudflare Tunnel URL. Replace the
host with the Cloud Run URL from step 9.

Affected callbacks:

- `POST /api/email-queue`
- `POST /api/responses`
- `POST /api/workflow-errors`
- `POST /api/apollo/results`
- `POST /api/organization/success`
- `POST /api/organization/error`

Save and re-activate each workflow.

You can stop the local Cloudflare Tunnel — it's no longer needed for
prod. Local dev still uses it.

---

## 11. Verify

In the Cloud Run service detail page → **Open the URL** (top right) or
just paste it into a browser tab.

```
https://leadflow-xxxxxx-ew.a.run.app/health
```

Should return:

```json
{ "status": "ok", "driver": "postgres", "message": "Organization API is running" }
```

Then `https://leadflow-xxxxxx-ew.a.run.app/` opens the UI. Walk the
four-stage workflow. If anything errors, check **Cloud Run** → service
→ **Logs** tab.

---

## Updating later

UI route: rebuild from Cloud Shell (rerun step 6), then on the Cloud
Run service detail page → **Edit & deploy new revision** → just click
**Deploy** at the bottom (no edits needed; it picks up the new
`:latest` image).

CLI route — one liner in Cloud Shell:

```bash
gcloud run services update leadflow \
  --image=europe-west1-docker.pkg.dev/$(gcloud config get-value project)/leadflow/app:latest \
  --region=europe-west1
```

If you change `db/init.sql`, redo step 4 (Cloud Shell + auth proxy +
`npm run db:migrate`) — it's idempotent.

---

## Rollback (UI)

Cloud Run → service → **Revisions** tab. You'll see one row per
deployed image. Click the **⋮** on a previous good revision → **Manage
traffic** → set 100% to that revision → **Save**. Live in seconds.

---

## Pushing changes from Cloud Shell

Sometimes you'll need to commit and push directly from Cloud Shell (e.g.
after running `npm install` to sync the lockfile). First-time setup:

```bash
# Identity (one-time, persists across Cloud Shell sessions)
git config --global user.email "you@example.com"
git config --global user.name "Your GitHub Username"

# GitHub authentication — gh CLI is preinstalled in Cloud Shell.
# Pick: GitHub.com → HTTPS → Yes (auth git too) → Login with a web browser.
# A one-time code is shown; open the URL it prints, paste the code, Authorize.
gh auth login
```

After that, `git push` from Cloud Shell works without prompting for
credentials.

---

## Troubleshooting

| Error / symptom | Cause | Fix |
|-----------------|-------|-----|
| `npm error code EUSAGE … npm ci can only install packages when your package.json and package-lock.json are in sync` (during Cloud Build) | Lockfile drift between `package.json` and `package-lock.json` | In Cloud Shell: `npm install` to regenerate the lockfile, then `git add package-lock.json && git commit -m "fix: sync package-lock.json" && git push`, then re-run `bash deploy/build.sh` |
| `does not have storage.objects.get access` during `gcloud builds submit` | Compute SA missing Cloud Build / Storage / Artifact Registry / Logging roles (post-April-2024 GCP projects) | Run `bash deploy/grant-cloudbuild-iam.sh` once per project |
| `invalid image name "…/app:": could not parse reference` | `${SHORT_SHA}` is empty because `gcloud builds submit` doesn't auto-populate it (only git-triggered Cloud Build does) | `cloudbuild.yaml` now uses `_SHA` (defaults to `manual`). Pass `_SHA=$(git rev-parse --short HEAD)` in `--substitutions` for proper commit tags |
| Cloud Run revision creation fails with `Image 'mirror.gcr.io/leadflow/app:latest' not found` | The image picker autocompleted to Docker Hub mirror instead of Artifact Registry | Paste the full URL: `europe-west1-docker.pkg.dev/<PROJECT_ID>/leadflow/app:latest` |
| `Failed to approve email: N8N_BASE_URL is not configured on the server` | The Cloud Run service is missing the `N8N_BASE_URL` runtime env var | Cloud Run → service → Edit & deploy new revision → Variables & Secrets → add `N8N_BASE_URL=https://your-n8n.app.n8n.cloud/webhook` → Deploy |
| `Failed to approve email: VITE_N8N_BASE_URL is not configured on the server` | Running an old image from before the n8n proxy refactor | Rebuild and redeploy: `git pull && bash deploy/build.sh` in Cloud Shell, then Cloud Run → Edit & deploy new revision → Deploy (picks up new `:latest`) |
| Cloud Shell `git pull` aborts with `Your local changes to … would be overwritten by merge` | Local edits to a tracked file (e.g. the `sed`-patched `cloudbuild.yaml`) | `git checkout <file>` to discard, or `git stash` to keep; then `git pull` |
| `Author identity unknown` when committing in Cloud Shell | First time using git in this shell | `git config --global user.email "you@…" && git config --global user.name "…"` |
| `Username for github.com:` prompt on `git push` | GitHub no longer accepts passwords | Run `gh auth login` (see "Pushing changes from Cloud Shell" above) |

---

## What this UI route does NOT cover

The CLI runbook ([DEPLOY-GCP-WITH-DB.md](./DEPLOY-GCP-WITH-DB.md)) has
the multi-user-future appendix and a fuller cost breakdown. They apply
identically to the UI route.
