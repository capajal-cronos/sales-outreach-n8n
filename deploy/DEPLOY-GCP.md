# Deploying to Google Cloud

This walkthrough is specific to this app's architecture (Express + Vite +
JSON-file storage, see [ARCHITECTURE.md](./ARCHITECTURE.md)). It is *not*
a generic "how to deploy a Node app" guide.

The recommended path is **Compute Engine + persistent disk**. Cloud Run
looks tempting but doesn't fit because the app stores state in
`data/*.json` on the local filesystem.

---

## 0. Fix these before deploying anything

These aren't GCP-specific; they're "this code can't go to production
unchanged" items. See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full
context.

1. **Hardcoded `http://localhost:3001` in `src/App.jsx`.** The browser
   in production cannot reach the server's localhost. Either:
   - Have Express serve the built frontend (same origin → use relative
     `/api/...` paths), or
   - Add a `VITE_API_BASE_URL` env var and use it everywhere `App.jsx`
     calls localhost.
2. **`VITE_PIPEDRIVE_API_KEY` is baked into the public JS bundle.** Vite
   inlines every `VITE_*` var at build time. If the deployed URL is
   reachable by anyone outside the team, the token leaks. Move
   Pipedrive calls in `PeopleFinder.jsx` / `OrganizationSearch.jsx` /
   etc. server-side, or put the whole app behind auth (IAP — see
   step 7).
3. **`app.use(cors())` in `server.js` allows every origin.** Tighten to
   your frontend's domain.

The rest of this guide assumes step 1 is done. Steps 2 and 3 can be
deferred if the app is behind auth.

---

## 1. Recommended path: Compute Engine VM

Why: closest match to the current architecture. JSON files keep working
because there's exactly one process on one machine, mounted on a disk
that survives VM restarts.

### 1a. Create the VM

```bash
gcloud compute instances create leadflow \
  --zone=europe-west1-b \
  --machine-type=e2-small \
  --image-family=debian-12 \
  --image-project=debian-cloud \
  --boot-disk-size=20GB \
  --tags=http-server,https-server
```

`e2-small` (~€12/mo) is enough; `e2-micro` (~€6/mo) works if you're
running n8n elsewhere.

### 1b. Persistent disk for `data/`

Don't store `data/*.json` on the boot disk — separate it so you can
resize, snapshot, or reattach independently.

```bash
gcloud compute disks create leadflow-data \
  --zone=europe-west1-b \
  --size=10GB \
  --type=pd-standard

gcloud compute instances attach-disk leadflow \
  --disk=leadflow-data --zone=europe-west1-b
```

On the VM, format and mount once:

```bash
sudo mkfs.ext4 -m 0 -E lazy_itable_init=0,lazy_journal_init=0,discard /dev/sdb
sudo mkdir -p /mnt/leadflow-data
sudo mount /dev/sdb /mnt/leadflow-data
echo '/dev/sdb /mnt/leadflow-data ext4 defaults,nofail 0 2' | sudo tee -a /etc/fstab
```

The app's `data/` directory will be a symlink (or bind-mount) to
`/mnt/leadflow-data`.

### 1c. Run the app

Two options. Pick one.

**Option A — Docker Compose (cleaner, easier to upgrade):**

```yaml
# /opt/leadflow/docker-compose.yml
services:
  app:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./repo:/app
      - /mnt/leadflow-data:/app/data
    environment:
      PORT: 3001
      N8N_BASE_URL: https://your-n8n.app.n8n.cloud/webhook
      VITE_PIPEDRIVE_API_KEY: ${PIPEDRIVE_API_KEY}
      # ...rest of .env
    command: sh -c "npm ci && npm run build && node server.js"
    restart: unless-stopped
    ports:
      - "127.0.0.1:3001:3001"
```

(For production, build a real image with `npm ci && npm run build`
baked in instead of running on every container start.)

**Option B — systemd directly on the VM:**

```bash
# Install Node 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# Clone, build, link data dir
sudo mkdir -p /opt/leadflow && sudo chown $USER /opt/leadflow
cd /opt/leadflow
git clone <your-repo> repo && cd repo
ln -s /mnt/leadflow-data data
cp .env.example .env  # then edit
npm ci
npm run build
```

```ini
# /etc/systemd/system/leadflow.service
[Unit]
Description=LeadFlow Pro API
After=network.target

[Service]
Type=simple
User=leadflow
WorkingDirectory=/opt/leadflow/repo
EnvironmentFile=/opt/leadflow/repo/.env
ExecStart=/usr/bin/node server.js
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now leadflow
```

### 1d. Reverse proxy + HTTPS

Caddy is the easy choice — automatic Let's Encrypt, one config file:

```bash
sudo apt install -y caddy
```

```caddy
# /etc/caddy/Caddyfile
app.yourdomain.com {
    reverse_proxy 127.0.0.1:3001
}
```

```bash
sudo systemctl reload caddy
```

Caddy fetches a TLS cert on first request. Done.

### 1e. Domain + firewall

Point `app.yourdomain.com` at the VM's external IP (A record in your
DNS provider). Open ports 80/443:

```bash
gcloud compute firewall-rules create allow-http-https \
  --allow tcp:80,tcp:443 --target-tags=http-server,https-server
```

### 1f. Tell n8n where the app lives

In your n8n HTTP Request nodes (the ones that POST to
`/api/email-queue`, `/api/responses`, `/api/workflow-errors`,
`/api/apollo/results`), replace `http://localhost:3001` with
`https://app.yourdomain.com`.

Cloudflare Tunnel is no longer needed — n8n.cloud can hit the public
GCE URL directly.

### 1g. (Optional but recommended) Lock it behind IAP

Identity-Aware Proxy puts a Google login in front of the app. This
neutralizes the "Pipedrive token in the JS bundle" problem because the
bundle is no longer reachable without authentication.

```bash
gcloud compute backend-services ...   # set up an HTTPS LB
gcloud iap web enable --resource-type=backend-services ...
```

The exact incantation depends on whether you use a managed instance
group or a standalone VM with a load balancer. Worth it for any
internal tool with secrets baked into the frontend.

---

## 2. Alternative: Cloud Run (only if you swap storage)

Cloud Run is attractive (scale-to-zero, no VM to manage) but has
**ephemeral filesystem** — anything written to `data/` is lost on
container restart, and you can't share files between instances.

To make this app fit Cloud Run, replace `serverDatabase.js`'s
`fs.readFile` / `fs.writeFile` calls with:

- **Firestore** (good fit — 4 JSON-shaped collections map cleanly to
  the 4 files), or
- **Cloud SQL Postgres** with a small connector, or
- **GCS bucket** (works but feels like fighting the model).

After that swap, deployment is `gcloud run deploy` and a single
container image. Cheaper than a VM if traffic is bursty (you pay only
for request seconds), more expensive if it's steady.

---

## 3. n8n on GCP (optional)

If you also want to self-host n8n on GCP:

- **Cloud Run + Cloud SQL Postgres** for n8n is the cleanest option.
  n8n has an official Docker image; mount Postgres for workflow state.
- Or run n8n in a second container on the same Compute Engine VM (in
  the Docker Compose file above), reachable internally as `http://n8n:5678`.

Self-hosting n8n on the same VM as the app eliminates the "n8n.cloud
needs to reach your localhost" problem entirely — they talk to each
other over Docker's internal network.

---

## 4. Cost estimate

| Component                              | Monthly (rough)        |
|----------------------------------------|------------------------|
| Compute Engine `e2-small` (24/7)       | €12                    |
| 10 GB persistent disk                  | €0.40                  |
| External IP (static)                   | €1.50 (free if dynamic)|
| Egress (1 GB/mo)                       | <€0.20                 |
| **Total (app only)**                   | **~€14/mo**            |
| + Self-hosted n8n on same VM           | +€0 (same machine)     |
| + Cloud SQL Postgres (db-f1-micro)     | +€8/mo                 |

For comparison, n8n.cloud Starter is €20/mo, so self-hosting saves the
running cost roughly tied or slightly cheaper, at the price of doing
n8n upgrades yourself.

---

## 5. What you don't need to do

- **GKE.** This is a single Node process. Kubernetes is over by an
  order of magnitude.
- **App Engine.** Same persistent-storage limitation as Cloud Run, plus
  more constraints.
- **Multi-region anything.** One operator, one machine is fine.
- **Load balancer in front of one VM** — unless you want IAP (step 1g).

---

## TL;DR

1. Fix the three "before deploying anything" items.
2. `gcloud compute instances create` + persistent disk for `data/`.
3. Run the app via systemd or Docker Compose.
4. Caddy in front for TLS.
5. Point your domain at the VM, open 80/443.
6. Update n8n's HTTP Request URLs to the new public domain. Stop using
   Cloudflare Tunnel.
7. Optional: put it behind IAP so the bundled Pipedrive token stops
   being a public-internet problem.
