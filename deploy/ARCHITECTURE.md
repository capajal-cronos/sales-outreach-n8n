# Architecture

How a typical "frontend → backend → external services" app should be wired,
versus how this app actually wires it.

## Ideal

```
                ┌──────────────────┐
                │  Browser (React) │
                └────────┬─────────┘
                         │  /api/*  (single origin, no secrets)
                         ▼
                ┌──────────────────┐
                │   Express API    │  ← owns all credentials
                └─┬──────┬──────┬──┘
                  │      │      │
                  ▼      ▼      ▼
             Database  Pipedrive  n8n
                                  ▲
                                  └── n8n callbacks come back here
```

The browser only talks to Express. Express is the single integration hub
and the only place credentials live. State lives in a database.

## What this app does

```
        ┌────────────────────────────────┐
        │        Browser (React)         │
        └────┬─────────┬───────────┬─────┘
             │         │           │
      /api/* │   direct│     direct│   ← Pipedrive token + n8n URL
             │         │           │      are baked into the JS bundle
             ▼         ▼           ▼
        ┌────────┐  ┌─────┐   ┌──────────┐
        │Express │  │ n8n │   │Pipedrive │
        │ (3001) │  └──┬──┘   └──────────┘
        └─┬──┬───┘     │
          │  │         │
          ▼  ▼         └── n8n callbacks
       JSON Pipedrive      (via Cloudflare Tunnel if n8n is cloud-hosted)
       files (server token, used by /api/leads)
```

The browser fetches three services directly — including Pipedrive with a
key that Vite has baked into the public JS bundle. State is spread
across browser `localStorage`, four JSON files on disk, an in-memory
error log in `server.js`, and Pipedrive itself.

## What's different

| Concern             | Ideal                          | This app                                  |
|---------------------|--------------------------------|-------------------------------------------|
| Browser fetches     | Only Express                   | Express + n8n + Pipedrive                 |
| Pipedrive token     | Server-only                    | Inlined into the public JS bundle         |
| n8n base URL        | Server-only (or public, fine)  | Inlined into the public JS bundle         |
| Storage             | One database                   | `localStorage` + 4 JSON files + memory    |
| Frontend → API URL  | Relative or env-configured     | Hardcoded `http://localhost:3001`         |
| n8n → Express       | Hits public Express URL        | Same, but needs a tunnel when dev-hosted  |

## Why it ended up this way

The shortcuts are mostly the path of least resistance for a single-user
internal tool:

- **Direct Pipedrive calls from the browser** save building a proxy layer
  in Express. Acceptable for a tool only the developer uses; a leak risk
  for any wider audience.
- **Direct n8n calls from the browser** mean components own their own
  workflow triggers. Easier to reason about per-component, but couples
  the bundle to n8n's URL and prevents server-side auth/rate limiting.
- **JSON files** avoid setting up a database. Works because there's one
  process on one machine; would break under multi-instance or
  scale-to-zero hosting.
- **Hardcoded `localhost:3001`** is fine in dev. It's the first thing
  that has to change for any non-local deployment.

None of this is wrong for the current scope (one operator, one laptop,
n8n in the cloud). It becomes wrong the moment the app is deployed
publicly or used by people outside the team that owns the Pipedrive
account.
