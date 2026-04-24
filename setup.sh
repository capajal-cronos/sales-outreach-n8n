#!/usr/bin/env bash
# Interactive first-run setup for sales-outreach-n8n.
# Idempotent: safe to re-run. Existing .env values are kept.

set -euo pipefail

cd "$(dirname "$0")"

YELLOW=$(tput setaf 3 2>/dev/null || echo "")
GREEN=$(tput setaf 2 2>/dev/null || echo "")
RED=$(tput setaf 1 2>/dev/null || echo "")
BOLD=$(tput bold 2>/dev/null || echo "")
RESET=$(tput sgr0 2>/dev/null || echo "")

say()  { printf "%s%s%s\n" "$BOLD" "$1" "$RESET"; }
warn() { printf "%s%s%s\n" "$YELLOW" "$1" "$RESET"; }
ok()   { printf "%s%s%s\n" "$GREEN"  "$1" "$RESET"; }
die()  { printf "%s%s%s\n" "$RED"    "$1" "$RESET" >&2; exit 1; }

say "sales-outreach-n8n — setup"
echo

# ─── Prerequisites ──────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || die "Node.js is required. Install Node 18+ and retry."
command -v npm  >/dev/null 2>&1 || die "npm is required."

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node 18+ required (found v$(node -v))."
fi

# ─── npm install ────────────────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  say "Installing dependencies..."
  npm install
else
  ok "Dependencies already installed."
fi

# ─── .env bootstrap ─────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  cp .env.example .env
  ok "Created .env from .env.example."
else
  ok ".env already exists — leaving it alone."
fi

# Helper: read current value of a key from .env
env_get() {
  local key="$1"
  grep -E "^${key}=" .env 2>/dev/null | head -n1 | cut -d= -f2- || true
}

# Helper: upsert a key=value pair in .env
env_set() {
  local key="$1"
  local value="$2"
  if grep -qE "^${key}=" .env 2>/dev/null; then
    # macOS/BSD sed needs -i ''; GNU sed accepts -i
    if [[ "$OSTYPE" == "darwin"* ]]; then
      sed -i '' "s|^${key}=.*|${key}=${value}|" .env
    else
      sed -i "s|^${key}=.*|${key}=${value}|" .env
    fi
  else
    printf "\n%s=%s\n" "$key" "$value" >> .env
  fi
}

prompt_if_empty() {
  local key="$1"
  local label="$2"
  local current
  current=$(env_get "$key")
  # Skip if already set to something other than a known placeholder
  case "$current" in
    ""|"your_pipedrive_api_key_here"|"https://your-n8n.app.n8n.cloud/webhook")
      read -r -p "  ${label}: " value
      if [ -n "$value" ]; then
        env_set "$key" "$value"
      else
        warn "  (skipped — you can edit .env later)"
      fi
      ;;
    *)
      ok "  ${key} already set."
      ;;
  esac
}

# ─── Required values ────────────────────────────────────────────────────────
say ""
say "Enter your configuration (press Enter to skip a field):"
prompt_if_empty VITE_PIPEDRIVE_API_KEY "Pipedrive API token"
prompt_if_empty VITE_N8N_BASE_URL      "n8n webhook base URL (e.g. https://your-n8n.app.n8n.cloud/webhook)"

# ─── Pipedrive custom fields ────────────────────────────────────────────────
PIPEDRIVE_TOKEN=$(env_get VITE_PIPEDRIVE_API_KEY)
if [ -n "$PIPEDRIVE_TOKEN" ] && [ "$PIPEDRIVE_TOKEN" != "your_pipedrive_api_key_here" ]; then
  say ""
  say "Running Pipedrive setup..."
  npm run setup:pipedrive
else
  warn ""
  warn "Skipped Pipedrive setup — no API token in .env."
  warn "Run  npm run setup:pipedrive  manually once you've added one."
fi

# ─── Done ───────────────────────────────────────────────────────────────────
say ""
ok "Setup complete."
echo
say "Next steps:"
cat <<EOF
  1. Import the n8n workflows from ./n8n/*.json into your n8n account
     (see n8n/README.md for step-by-step).
  2. Activate each workflow and verify the webhook paths match the base URL
     you entered.
  3. Start the app:
       npm start
     (frontend on :3000, API on :3001, Cloudflare tunnel if configured)

EOF
