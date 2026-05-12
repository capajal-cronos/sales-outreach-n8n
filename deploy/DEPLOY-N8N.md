# Deploying the n8n workflows to n8n Cloud

This guide moves the n8n workflows from a self-hosted instance (or your
laptop) to **n8n Cloud** — the managed offering from n8n.io. Fully
managed: automatic upgrades, backups, TLS, monitoring. No DevOps.

> **Why n8n Cloud over self-hosting?** Operating n8n yourself means
> running a VM, renewing TLS certs, keeping n8n and Postgres up to date,
> watching for outages, doing backups. n8n Cloud costs ~€20/mo and
> erases all of that. Worth it for an app with one or two daily users
> like LeadFlow Pro. For high-volume use or strict data-residency
> requirements, self-host instead — see "Alternative: self-host" at the
> bottom.

Keep this file open in one tab as you go, plus your current n8n UI
(source) and the n8n Cloud signup page (destination).

---

## Names you'll use throughout

| Variable | Example | Notes |
|----------|---------|-------|
| Cloud workspace subdomain | `<your-subdomain>` | You pick this during signup; can't be changed easily. |
| Webhook base URL | `https://<your-subdomain>.app.n8n.cloud/webhook` | Generated from the subdomain. This becomes `N8N_BASE_URL` on Cloud Run. |
| LeadFlow URL | `https://<your-service>-<project-number>.<region>.run.app` | Your Cloud Run service from the LeadFlow deploy. Copy it from the Cloud Run service overview page. |

---

## 1. Sign up for n8n Cloud

1. Go to https://n8n.io/cloud
2. Click **Get started**
3. Sign in (Google / GitHub / email)
4. Pick a plan. Check the current pricing at https://n8n.io/pricing/
   — the Starter tier is usually enough for an internal tool like
   LeadFlow Pro; upgrade later if you outgrow it.
5. Pick a **workspace subdomain** — this becomes
   `https://<subdomain>.app.n8n.cloud`. Pick something short and stable;
   changing it later requires support.
6. Wait ~30 seconds for the workspace to provision.

---

## 2. Get your webhook base URL

Once the workspace is up, n8n drops you in the editor. The webhook base
URL is the workspace URL plus `/webhook`:

```
https://<your-subdomain>.app.n8n.cloud/webhook
```

Verify it: top-right menu → **Settings** → **Webhook URLs**. You'll
see one URL per webhook node once you've imported a workflow.

Save this base URL — you'll plug it into Cloud Run later as
`N8N_BASE_URL`.

---

## 3. Export workflows from your current n8n

Skip this section if you're starting from scratch and have no existing
workflows.

For each workflow on your current self-hosted n8n:

1. Open the workflow in the editor
2. Top-right `⋮` menu → **Download**
3. Save the `.json` somewhere — name it after the workflow so you can
   re-import in the right order

The workflows you need to migrate (eleven total — see
[`n8n/README.md`](../n8n/README.md) for what each does):

| File / workflow | Webhook path | Trigger type |
|----------------|--------------|--------------|
| frontend manual search | `/organizations` | webhook |
| add organizations filter | `/organization-filters` | webhook |
| add organizations file | `/organizations-file` | webhook |
| accepted-apollo-orgs | `/apollo-accepted-organizations` | webhook |
| find people in pipedrive | `/find-people` | webhook |
| save people in pipedrive | `/save-people` | webhook |
| make leads from people | `/make-leads` | webhook |
| mailing system | `/send-leads-mails` | webhook |
| approved mails | `/email-approval` | webhook |
| response monitor - imap | IMAP Email Trigger | trigger |
| parallel mail generation | Execute Workflow (sub-workflow) | sub-workflow |

If they're already committed to the `n8n/` folder in this repo, you can
upload directly from there instead of exporting again.

> **Credentials don't export.** n8n strips secret values on export for
> security. The JSON keeps *credential references* (IDs/names) so the
> nodes know which credential they need, but you'll have to re-create
> the credentials themselves on the cloud side. We'll handle that in
> step 5.

---

## 4. Import workflows into n8n Cloud

In your new n8n Cloud workspace:

1. **Workflows** (left sidebar) → **Add workflow** → **Import from File**
2. Pick the first `.json`
3. The workflow opens — nodes that need credentials will show a red
   "credential required" warning. Don't worry about those yet.
4. Top-right → **Save** (Ctrl+S)
5. Repeat for all 11 workflows

Recommended import order so cross-references resolve cleanly:

1. `parallel mail generation` (sub-workflow — others reference it)
2. The 9 webhook-triggered workflows
3. `response monitor - imap`

After import, every workflow is saved but **not active** — none will
respond to webhooks until you activate them in step 7.

---

## 5. Re-create credentials

Click **Credentials** in the left sidebar → **Add Credential**. Create
each one your workflows need:

### a. Pipedrive API

| Field | Value |
|-------|-------|
| Credential type | **Pipedrive API** |
| API Token | the same long hex string in your `.env` `PIPEDRIVE_API_KEY` |
| Name | `Pipedrive` (must match what the imported workflow references — see the credential dropdown inside a node) |

### b. OpenAI / OpenRouter / Anthropic (whichever the email-generation node uses)

| Field | Value |
|-------|-------|
| Credential type | match what your `parallel mail generation` workflow uses (OpenRouter for example) |
| API Key | from openrouter.ai / openai.com / anthropic.com |
| Name | match the imported reference |

### c. SMTP (for sending approved emails)

| Field | Value |
|-------|-------|
| Credential type | **SMTP** |
| Host | your SMTP server (e.g. `smtp.gmail.com`) |
| Port | `587` (STARTTLS) or `465` (SSL) |
| User | sender address |
| Password | app password (NOT your account password — Gmail requires this) |
| Name | match the imported reference |

> **Gmail app passwords:** Go to https://myaccount.google.com/apppasswords,
> create an app password for "Mail", paste it here. Account password
> won't work and 2FA must be enabled on the account first.

### d. IMAP (for reading replies)

| Field | Value |
|-------|-------|
| Credential type | **IMAP** |
| Host | `imap.gmail.com` (or your provider) |
| Port | `993` |
| User | same address as SMTP |
| Password | the same app password as SMTP |
| Name | match the imported reference |

### e. Apollo (optional, if the search workflows use it directly)

Most LeadFlow workflows call Apollo via HTTP Request nodes with a
hard-coded API key in the URL/header. If yours does, just paste your
Apollo token into the relevant HTTP Request node. If you have it
configured as a real n8n credential, replicate it here.

After each credential is saved, go back to the workflow editor → click
the node with the red warning → pick the credential from the dropdown
→ save. Repeat per node, per workflow.

---

## 6. Update callback URLs inside your workflows

Inside several workflows, n8n POSTs results **back** to the LeadFlow
app at `https://<your-cloud-run-url>/api/...`. These outbound URLs need
to point at your Cloud Run service, not your old self-hosted dev URL or
Cloudflare Tunnel.

Open each workflow and find every **HTTP Request** node that hits one
of these LeadFlow endpoints, then update the URL:

| Workflow | Outbound to LeadFlow |
|----------|---------------------|
| `parallel mail generation` | `POST /api/email-queue` |
| `response monitor - imap` | `POST /api/responses` |
| any workflow that catches errors | `POST /api/workflow-errors` |
| `frontend manual search` / `add organizations filter` | `POST /api/apollo/results` |
| `accepted-apollo-orgs` | `POST /api/organization/success`, `POST /api/organization/error` |

Replace the host with your Cloud Run URL (keep the `/api/...` path):

```
https://<your-cloud-run-url>/api/<path>
```

> **Tip — make this easier to maintain:** Put the LeadFlow base URL in
> a single n8n environment variable (Settings → Variables →
> `LEADFLOW_BASE_URL`), then reference it in each HTTP Request node as
> `={{ $env.LEADFLOW_BASE_URL }}/api/...`. Future host changes are then
> a one-variable edit instead of editing every workflow.

Save each workflow after editing.

---

## 7. Activate the workflows

For each of the 10 active workflows (everything except
`parallel mail generation`, which is a sub-workflow called via
"Execute Workflow"):

1. Open the workflow
2. Toggle **Active** in the top-right corner
3. Confirm

`parallel mail generation` is a sub-workflow — leave it **inactive**.
n8n still executes it because the parent workflow calls it directly.

---

## 8. Sanity-check each webhook

From your laptop, fire a no-op POST at each webhook and confirm n8n
responds. Run these against `https://<subdomain>.app.n8n.cloud/webhook`:

```bash
BASE='https://<subdomain>.app.n8n.cloud/webhook'

for path in organizations organization-filters organizations-file \
            apollo-accepted-organizations find-people save-people \
            make-leads send-leads-mails email-approval; do
  status=$(curl -s -o /dev/null -w '%{http_code}' -X POST \
    "$BASE/$path" -H 'Content-Type: application/json' -d '{}')
  echo "$status  $path"
done
```

Every webhook should return **200** (or maybe **400** if the workflow
validates its input and rejects an empty body — also fine, means the
webhook is wired up). A **404** means the workflow isn't active or the
path is wrong.

---

## 9. Update LeadFlow's `N8N_BASE_URL` on Cloud Run

Now point the deployed LeadFlow app at n8n Cloud:

**UI:**
1. Cloud Console → **Cloud Run** → `leadflow` → **Edit & deploy new revision**
2. Expand **Container, Networking, Security** → **Variables & Secrets**
3. Edit `N8N_BASE_URL` → set value to `https://<subdomain>.app.n8n.cloud/webhook`
4. Scroll down → **Deploy**

**CLI:**
```bash
gcloud run services update leadflow \
  --region=europe-west1 \
  --update-env-vars=N8N_BASE_URL=https://<subdomain>.app.n8n.cloud/webhook
```

Cloud Run rolls a new revision in ~30 seconds.

---

## 10. End-to-end test

Walk a fresh lead through the whole pipeline to confirm both directions
work:

1. Open the deployed LeadFlow app (`https://leadflow-…run.app`)
2. **OrganizationSearch** — search for a test org (something with a
   known domain). The frontend POSTs to your n8n Cloud webhook; n8n
   posts back to `/api/apollo/results` on Cloud Run.
3. **PeopleFinder** — pick the org, find/save people.
4. **LeadManagement** — generate emails. Wait until they appear in the
   pending queue (the LLM step takes a few seconds).
5. **Approve** one email. n8n's `/email-approval` workflow should
   fire, send the email via SMTP, and update the Pipedrive label.
6. **ResponseMonitor** — send a real reply to yourself. n8n's IMAP
   trigger should pick it up and POST it to `/api/responses`. The reply
   appears in the UI within ~30 seconds.

If any step fails, check:
- **n8n Cloud executions tab** for each workflow — shows incoming
  webhooks and any errors per-execution
- **Cloud Run logs** — `gcloud logging tail "resource.type=cloud_run_revision"`
  or in the UI

---

## 11. Decommission the old n8n

Once everything works end-to-end on n8n Cloud:

1. **Deactivate** all workflows on the old self-hosted instance so they
   don't double-fire on any reply that lands in both inboxes.
2. **Snapshot** the old VM / Docker volume — keep it for a week as a
   fallback in case you find a missing workflow.
3. **Stop** the old n8n container or VM to stop paying for it.
4. After ~2 weeks of no issues, **delete** the snapshot and any DNS
   records pointing at the old host.

---

## Maintenance from here

| Task | Where |
|------|-------|
| n8n version upgrades | Automatic on n8n Cloud |
| TLS certificate renewals | Automatic on n8n Cloud |
| Workflow backups | Automatic — also: top-right `⋮` → Download regularly |
| Editing a workflow | Edit in cloud → Save → re-export the `.json` → commit to `n8n/` folder in the repo so future-you has a recoverable copy |
| Rotating Pipedrive token | Credentials → Pipedrive → edit → save. Affects every workflow using it. |
| Adding a new workflow | Build it, activate it, add the path to `src/config/n8n.js` if the frontend needs to call it, redeploy LeadFlow |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Webhook returns 404 | Workflow not active, or wrong path | Toggle Active in n8n; verify `/webhook/<path>` matches the path in `src/config/n8n.js` |
| Webhook returns 200 but nothing happens | Workflow active but a downstream node errored silently | Open the workflow → Executions tab → find the failed run → look at the red node |
| LeadFlow shows "Failed to approve email: …" | n8n unreachable or workflow broken | Check `N8N_BASE_URL` env var on Cloud Run matches your cloud subdomain |
| Replies don't show up in ResponseMonitor | IMAP trigger broken or POST to `/api/responses` failing | Check the n8n IMAP credential is connected; check Cloud Run logs for `/api/responses` errors |
| SMTP sends fail | Gmail "less secure apps" no longer works | Use an app password (see step 5c) |

---

## Alternative: self-host

If you really want to self-host (data residency, regulatory, or just
prefer it), the rough shape is:

1. Spin up a small VM (GCP Compute Engine `e2-small` works, ~€7/mo)
2. Install Docker
3. Run n8n + Postgres via Docker Compose (n8n needs its own DB to
   persist workflows and credentials — SQLite works for dev, Postgres
   for prod)
4. Point a domain at the VM, run **Caddy** in front for automatic HTTPS
5. Set the right environment variables on the n8n container:
   `N8N_HOST`, `N8N_PROTOCOL=https`, `WEBHOOK_URL`, `DB_TYPE=postgresdb`
   plus DB connection details
6. Open only port 443 in the GCP firewall, lock SSH behind IAP or a
   bastion
7. Backup the n8n DB regularly (a daily `pg_dump` to Cloud Storage is
   cheap and easy)

Then everything from step 3 onwards of this guide works the same — just
substitute your own domain for `<subdomain>.app.n8n.cloud`.

If you want me to write a separate `DEPLOY-N8N-SELFHOSTED.md` runbook
modeled on the GCP-UI deploy doc (full VM creation, Docker Compose file,
Caddy config, firewall rules), say the word.
