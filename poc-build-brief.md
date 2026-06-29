# Build Brief — AI Prospecting & Outreach PoC (working title: "ProspectAI")

> **For the implementing agent:** This is a build brief, not final code. Build a
> **proof-of-concept** that proves one end-to-end vertical slice (see §9). Start in
> plan mode, confirm the open questions in §11, then build the thin slice first and
> expand. **Library APIs in this space move fast — verify every framework API against
> live docs (Context7 or the official docs linked in §12) before writing code; do not
> trust API signatures from memory.** Architecture, package choices, and the
> third-party-vs-build split below are decided and verified as of mid-2026.

---

## 1. Goal

A multi-tenant web app that runs the full B2B outbound motion with AI doing the heavy
lifting and a human approving every email before it sends:

1. **Find** prospects + buying signals from a natural-language description (better
   coverage than Lusha/Bizzy, which the client found insufficient).
2. **Enrich** the best prospects with verified contact details + a research brief.
3. **Draft** a personalized email from a user prompt.
4. **Human approves/edits** the draft — nothing sends without sign-off.
5. **Send** from the user's own mailbox and **log** it to their CRM.

This is a PoC to put in front of a client. They decide go/no-go after seeing it. Bias
toward a **convincing, real, end-to-end demo on a thin slice** over breadth.

## 2. Client context (why this exists)

- The client tried **Bizzy** (not good enough) and currently uses **Lusha** (still
  misses prospects/data). The discovery layer is the differentiator — it must surface
  prospects and signals the incumbents miss, using AI, not just a static database.
- They want to **prompt** the system to find prospects and to draft mail, but they
  require a **human approval gate** before any email goes out.
- They use a CRM (likely **HubSpot**). The app must let each org **choose** its CRM —
  HubSpot first, with a clean seam to add **Pipedrive** and **Salesforce** later.

## 3. Decided choices (do not re-litigate)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Discovery engine | **Hybrid** — Apollo data API **+** an AI research agent | Apollo gives verified contacts; the agent finds what Apollo/Lusha miss and gathers signals |
| Contact data provider | **Apollo.io API** (first; behind an interface) | Broadest all-in-one DB with a real API |
| Email sending | **User's own mailbox via OAuth** (Gmail API / Microsoft Graph) | Sends from the real address; best deliverability for 1:1; no warmup infra to build |
| LLM | **Pluggable: Anthropic Claude (hosted) _or_ local via Ollama** | Claude = best agent quality; Ollama = full data privacy / no per-token cost. Switchable per org |
| Agent framework | **LangGraph** + **`deepagents`** harness + **`langchain-mcp-adapters`** | Required; HITL + planning + MCP are first-class |
| Backend | **Python** (FastAPI, async) | Required |
| Frontend | **React** (Vite + TypeScript) | Required |
| Tenancy | **Multi-tenant by org**, one user per org (model 1→many) | Required |
| CRM (first) | **HubSpot**, behind a `CRMPort` interface | Required; extensible |

## 4. The five layers, mapped to this app

| Layer | How this app does it |
|-------|----------------------|
| **1. Data / sourcing** | Apollo **People Search** + **Organization Search** (free, no credits) for the backbone; the AI research agent (web search) discovers companies/people Apollo misses |
| **2. Signals / intent** | AI agent gathers public signals (funding, hiring/job posts, news, leadership changes, site changes); Apollo **Organization Enrichment** also returns funding-round data. Agent scores "why now" |
| **3. Enrichment / research** | Apollo **People/Org Enrichment** (verified email/phone — costs credits, so enrich **on demand only**) + Claude synthesizes a one-page brief (fit, challenges, angle) |
| **4. Outreach / sending** | User prompt → Claude drafts → **LangGraph HITL interrupt** for human review/edit/approve → send via Gmail/Graph |
| **5. CRM** | `CRMPort` interface; **HubSpot adapter** upserts the contact + logs the sent email as an engagement |

## 4a. Signal & company-data sources (what the research agent pulls from)

The discovery agent assembles signals from public sources rather than relying on a
vendor's pre-canned feed. Each source sits behind a tool/interface so it can be swapped.

| Source | Gives you | Access | Self-source? |
|--------|-----------|--------|--------------|
| **Official registries** — NBB (BE annual accounts), KBO/BCE (BE identity), KVK (NL), LBR/RCS (LU) | Revenue/profit/equity trend, employee counts, NACE sector, directors, incorporation, status → **qualification + financial health + growth/distress angle** | Official APIs (free/low-cost; NBB returns JSON/XBRL) | ✅ Yes |
| **Job postings** | Hiring = expansion/need signal | Careers pages + job-board APIs via the search/scrape tool | ✅ Yes |
| **News / funding / launches** | "Why now" events | Search/news API (**Exa**) | ✅ Yes |
| **LinkedIn posts** (company + key people) | What a prospect is *actively talking about* → strongest personalization hook ("saw your post on X") + intent | **Bright Data LinkedIn Post API** (public, logged-out, no credentials) | ✅ Via provider |
| **Apollo org enrichment** | Funding rounds, revenue band, headcount | Apollo API | ✅ Via provider |

> **LinkedIn — the hard rule.** Use a **logged-out, public-data provider only**
> (Bright Data's Post/Profile/Company APIs). **Never** session-cookie tools, fake
> accounts, or logged-in automation — that is exactly what got Proxycurl sued into
> shutdown (2025) and what gets accounts banned. Logged-out scraping of *public* data
> has been upheld in court (Meta v. Bright Data, X v. Bright Data, 2024); authenticated
> scraping has not. **GDPR still applies regardless** (LinkedIn posts are personal data
> of EU individuals): a certified provider helps on the collection side, but the app is
> a data controller and must respect lawful basis + data-subject rights. LinkedIn
> enrichment is **in scope and a headline feature of the demo** — keep it transparent and
> honor data-subject rights even so.

## 5. Architecture

### Backend (Python / FastAPI, async)
- **API layer:** FastAPI. REST for CRUD; **SSE (or WebSocket)** to stream agent
  progress and surface the HITL approval step to the frontend.
- **Agent layer (LangGraph):**
  - **Discovery agent** — build with the **`deepagents`** harness (planning via
    `write_todos`, delegation to sub-agents via the `task` tool, on the LangGraph
    runtime). Tools: Apollo search/enrich (wrapped as LangChain `@tool`s over Apollo
    REST), and web-search/scrape tools loaded from an MCP server via
    `MultiServerMCPClient`. Output: a ranked prospect list with signals + brief.
    `create_deep_agent(...)` returns a `CompiledStateGraph` — invoke with `{"messages":[...]}`; pin `deepagents>=0.6,<0.7` (0.7.x is alpha).
  - **Outreach graph** — a LangGraph graph: `draft_email` node → **`interrupt`** for
    human approval → `send_email` node (via the `MailSender` port, §6a) → `log_to_crm` node. Gate the send with HITL
    (`interrupt_on={"send_email": True}` or an explicit `interrupt()` before send).
    **Requires a persistent checkpointer (`AsyncPostgresSaver`)** so a run can pause
    for human review across requests and resume. Use `InMemorySaver` only in tests.
  - Decisions supported by HITL: **approve / edit / reject** the draft; resume the graph with `Command(resume=...)`. ⚠️ Known `deepagents` issue #554 — edit/reject resume can misbehave in sub-agents (approve is reliable); test all three paths end-to-end.
- **MCP integration:** `langchain-mcp-adapters` → `MultiServerMCPClient` connects to:
  - a **web-search/scrape MCP** (**Exa** — its MCP exposes `web_search_exa` / `web_fetch_exa`; `find_similar` is **deprecated**, so design discovery around neural `search`; add Firecrawl later for deep page extraction) for the research agent;
  - optionally the **official HubSpot remote MCP server** for agent-driven CRM reads.
  Use **HTTP transport** for remote servers (stdio is for local processes — avoid it in
  a web server); the transport string is `"streamable_http"` or `"http"` (underscore — the
  hyphen `"streamable-http"` raises ValueError), and `client.get_tools()` is **async** (`await` it).
- **LLM (pluggable — Claude or local Ollama):** Put the model behind an `LLMProvider`
  factory keyed on the org's `llm_provider` setting:
  - `anthropic` → `langchain-anthropic` `ChatAnthropic` (hosted Claude). Current model IDs: **`claude-opus-4-8` / `claude-sonnet-4-6` / `claude-haiku-4-5`**; for structured output use `with_structured_output(..., method="json_schema")` (+ `strict=True`).
  - `ollama` → `langchain-ollama` `ChatOllama` (local; supports `bind_tools()` and
    `with_structured_output()` — note its default is now `method="json_schema"`, not
    `function_calling`; pass `base_url` explicitly, pointed at a configurable `OLLAMA_BASE_URL`)

  Everything downstream (deepagents/LangGraph nodes) must receive a **model object** and
  stay provider-agnostic — never reference a vendor SDK outside the factory. Centralize
  model + token-budget config there.

  > **Local-model caveat — set client expectations honestly.** The discovery agent
  > leans hard on multi-step **tool calling**. Only tool-trained Ollama models do this
  > reliably — **Qwen 2.5 14B+ / Qwen3, Llama 3.1+, Mistral Nemo, Gemma** — and even
  > those trail Claude on planning/orchestration quality. Recommended default:
  > **Claude for the agent-heavy discovery**, with **Ollama fully viable for the
  > privacy-sensitive drafting/brief steps**. Support all-local, but a small local model
  > will plan and orchestrate worse. Keep the provider switchable so the client can
  > compare side by side. Optionally allow **per-task routing** (Claude for discovery,
  > Ollama for drafting) — nice-to-have, not required for the PoC.
- **Persistence:** PostgreSQL (the **Supabase** Postgres). Application tables (org-scoped) +
  the LangGraph checkpointer schema. Encrypt per-org secrets at rest. **`AsyncPostgresSaver`
  must use the direct / Supavisor *session* port `:5432`** — the `:6543` transaction pooler
  breaks its prepared statements (or set asyncpg `statement_cache_size=0`). Verify Supabase
  JWTs locally via JWKS (`aud="authenticated"`); the `service_role` key **bypasses RLS**, so
  enforce tenant isolation with the user token or in app code.
- **Long-running runs:** discovery can take a while — run it as a background task and
  stream progress; don't block the HTTP request.

### Frontend (React / Vite / TS)
Screens:
1. **Settings / Integrations** — connect mailbox (**Gmail** for the PoC; Microsoft 365 selectable via the same port, OAuth), connect CRM
   (HubSpot OAuth/private-app token), enter Apollo API key, **select CRM provider**,
   **select LLM provider (Claude or local Ollama — with model name + Ollama URL when
   local)**, define the org's ICP in natural language.
2. **Discovery** — prompt box → live agent progress (SSE) → ranked prospect cards
   (company, person, "why-now" signals, fit score, short brief). Enrich-email button
   per prospect (consumes Apollo credits → fetch email/phone on demand).
3. **Prospect detail** — full enriched brief.
4. **Compose & approve** — pick prospect(s), give an angle/prompt → AI draft appears →
   **review/edit/approve/reject** (this is the HITL gate) → on approve: send + log.
5. **Sent log** — what went out, with CRM-logging status.

### Multi-tenancy
- Every table carries `org_id`; enforce org scoping in a single data-access layer
  (and DB row-level security if practical). One org = one tenant.
- `users` table belongs to an org (model 1→many even though it's 1:1 now).
- Per-org secret store (encrypted): Apollo key, mailbox OAuth tokens, CRM OAuth
  tokens/token, optional per-org Anthropic key (else a shared platform key).
- LangGraph threads/checkpoints namespaced by `org_id` + `thread_id`.

## 6. CRM abstraction (the extensibility requirement)

Define a stable port; implement HubSpot first.

```python
class CRMPort(Protocol):
    def find_contact(self, email: str) -> Contact | None: ...
    def upsert_contact(self, contact: ContactInput) -> Contact: ...
    def log_email(self, contact_id: str, email: SentEmail) -> None: ...
    def create_note(self, contact_id: str, body: str) -> None: ...
```

- `HubSpotAdapter` implements `CRMPort`. **Use HubSpot REST for deterministic writes** —
  **`POST /crm/v3/objects/contacts/batch/upsert`** with `idProperty:"email"` to upsert (a
  plain `POST /crm/v3/objects/contacts` is **create-only** and 409s on a duplicate), and
  **`POST /crm/v3/objects/emails`** (with associations) to log the sent engagement. Do
  **not** route guaranteed writes through the LLM. Scopes: `crm.objects.contacts.read`+`.write`
  and `crm.objects.emails.read`+`.write` (email scopes can be seat-gated — verify in your portal).
  The official HubSpot MCP server may additionally be exposed to the agent for *reads*.
- A factory selects the adapter from `org.crm_provider`. Adding Pipedrive/Salesforce
  later = implement `CRMPort` again + add to the factory + add to the frontend CRM
  picker. **No other code should reference HubSpot directly.**

## 6a. Email sending & outreach — pluggable and expandable

PoC sends 1:1 from the user's mailbox, but the outreach layer **must be expandable** to a
robust campaign system later. Sending an email is trivial; **getting it into the inbox is
the hard part and is mostly not software** (domain/IP reputation, warmup, spam filters).
Split the layer in two and treat them differently.

**Build in-app (product IP — make it robust):**
- Sequence/cadence engine: multi-step follow-ups, scheduling, throttling, daily caps, send-time logic
- Reply detection + threading, conversation view
- Human-approval gate (already core), A/B testing, analytics (open/click/reply/bounce)
- Suppression lists, unsubscribe handling, bounce/complaint processing, list hygiene
- SPF/DKIM/DMARC setup guidance

**Buy/delegate (do not build):**
- **Warmup** — a mailbox-pool *network effect*; impossible solo. (Its value is increasingly debated and providers penalize artificial patterns — low-volume personalized sending may need little/none.)
- **Mailbox/domain provisioning at scale**, and **high-volume sending rails + IP reputation** — use Amazon SES or a cold-email infra API.

**The seam that makes it expandable — a `MailSender` port (mirror `CRMPort`):**

```python
class MailSender(Protocol):
    def send(self, msg: OutgoingEmail) -> SendResult: ...
    def fetch_replies(self, since: datetime) -> list[Reply]: ...
```

- **PoC impl:** `MailboxSender` over Gmail API / Microsoft Graph (user's real mailbox).
- **Later impls, no change to the campaign engine:** `SesSender` (Amazon SES, owned high-volume) or `SmartleadSender` / `InstantlySender` that **delegate** sending + warmup + inbox-rotation to a cold-email infra API.

**Recommended expansion path for this client.** Positioning is research-led, personalized,
human-approved — *not* spray-and-pray volume. So grow along **Path A: owned real mailboxes
+ a light per-mailbox warmup service + the in-app sequence engine.** At 1:1 personalized
volume the deliverability burden is light, so this is genuinely buildable, gives the best
inbox placement, and fits the "quality, not spam" brand. Adopt **Path B (delegate to
Smartlead/Instantly)** only if the client later pivots to high-volume. Either way it's a
new `MailSender` implementation, not a rewrite.

## 7. Third-party services vs. build-ourselves (explicit ask)

### MUST be third-party (do not build these)
| Need | Service | Why not build it |
|------|---------|------------------|
| Contact data | **Apollo API** | Never build a contact database |
| LLM (hosted option) | **Anthropic Claude API** | Don't train models — Claude is the hosted choice |
| Email send (PoC) | **Gmail API / Microsoft Graph** (OAuth) | Send from the user's real mailbox; best deliverability for 1:1 |
| Email **warmup** / inbox-rotation (only at scale) | **Buy** (lemwarm / Mailreach / Smartlead / Instantly) | Warmup is a mailbox-pool *network effect* — can't be built solo. (The campaign/sequence engine itself you DO build — see §6a) |
| Web search/scrape (for the agent) | **Exa** (MCP; Firecrawl optional for deep extraction) | Don't build a crawler/index |
| LinkedIn post/profile data (optional) | **Bright Data** LinkedIn APIs (public, logged-out) | Don't run your own scraper or use session-cookie/fake-account tools — ban + lawsuit risk (see Proxycurl) |
| CRM | **HubSpot** (then Pipedrive/Salesforce) | Obviously |
| Auth + org mgmt + DB | **Supabase** (decided) | Auth + user/org records + Postgres in one; don't build auth or run a separate DB for the PoC |

### We build (this is the actual product / IP)
- The **LangGraph + deepagents orchestration** (discovery, scoring, brief synthesis).
- **Signal aggregation & "why-now" scoring** from web research + Apollo data.
- The **HITL email-approval workflow** (the human gate) and its UI.
- The **CRM abstraction layer** + HubSpot adapter.
- **Multi-tenant** data model, org/user management, encrypted secrets.
- Prompt engineering for discovery, brief generation, and email drafting.
- The whole **React frontend**.
- **Local LLM inference via Ollama** — self-hosted (the privacy / no-per-token-cost
  option). We *run* it, we don't build it; the app just connects to `OLLAMA_BASE_URL`.
  Not a paid third party. Document the recommended model (Qwen 2.5 14B+ for tool use).

### Accounts/keys the builder will need (document in `.env.example`)
`ANTHROPIC_API_KEY`, `APOLLO_API_KEY`, Google OAuth client (id/secret) for **Gmail** (required for the PoC), plus a Microsoft
Graph app registration for **M365** (added next), **HubSpot** private-app token, **Exa** key (`EXA_API_KEY`; optional
`FIRECRAWL_API_KEY`), **Supabase** URL + keys (provides Postgres + auth), and an
encryption key for secrets.
LLM config: `LLM_PROVIDER` (`anthropic` | `ollama`), and for local — `OLLAMA_BASE_URL`,
`OLLAMA_MODEL` (no API key needed for Ollama). LinkedIn enrichment (in scope): `BRIGHTDATA_API_KEY`.

## 8. Data model sketch (Postgres, all org-scoped)

- `orgs(id, name, crm_provider, llm_provider, llm_model, created_at)`
- `users(id, org_id, email, ...)`
- `integration_credentials(id, org_id, kind[apollo|gmail|microsoft|hubspot|search], encrypted_payload, ...)`
- `icp_profiles(id, org_id, description, structured_filters_json)`
- `prospects(id, org_id, company, person_name, title, linkedin, email, phone, fit_score, signals_json, brief_md, source[apollo|agent], status, enriched_at)`
- `emails(id, org_id, prospect_id, prompt, draft_md, final_md, status[draft|approved|rejected|sent], crm_logged, sent_at)`
- LangGraph checkpointer tables (managed by `AsyncPostgresSaver`).

## 9. PoC scope

### In scope (build this)
1. Single org setup: connect mailbox (**Gmail**; Microsoft 365 behind the same port, added next), connect HubSpot (private-app token), set Apollo + Exa keys, define ICP.
2. Discovery from a prompt → ~10–25 ranked prospects with signals (hiring, funding, registry financials, **LinkedIn posts**) + fit score + short brief (Apollo search + Exa research agent; emails enriched on demand).
3. Prospect review + select.
4. Prompt → AI draft → **human approve/edit/reject** → send via user mailbox → log contact + email to HubSpot.
5. Sent log.

### Out of scope for the PoC (leave clean seams, don't build)
- Reply monitoring / inbox threading / multi-step sequences / cadences.
- Email warmup, deliverability tooling, sending at volume — **but design the `MailSender` seam now** so the outreach layer is expandable post-green-light (see §6a).
- Pipedrive & Salesforce adapters (just the `CRMPort` seam + picker stub).
- Billing, multiple users per org, RBAC, analytics dashboards.

### Suggested build order (milestones)
1. **Skeleton:** FastAPI + Supabase (Postgres + auth) + React + org model + encrypted secrets.
2. **Apollo tools:** search + on-demand enrichment behind an interface; show raw results in UI.
3. **Discovery agent:** `deepagents` + Exa search MCP + Apollo tools + Bright Data LinkedIn → ranked prospects + brief, streamed to UI.
4. **Outreach graph with HITL:** draft → interrupt → approve/edit → send via **Gmail** (`MailSender` port; M365 added next).
5. **CRM:** `CRMPort` + HubSpot adapter; upsert contact + log email; wire the picker.
6. **Polish the demo path** (the §9 slice) end-to-end.

## 10. Security & correctness notes
- Encrypt all per-org OAuth tokens/API keys at rest; never log them; never send them to the frontend.
- Scope **every** query by `org_id` in one data-access layer — tenant isolation is the highest-risk area.
- The send action must be **impossible** without an explicit human approval event — enforce server-side, not just in the UI.
- Validate/normalize all external data (Apollo, agent output, CRM) at the boundary.
- Respect Apollo credit cost & limits: search is free (use `/mixed_people/api_search`, needs the master key) and returns **no** emails/phones; enrich only selected prospects (costs credits; phone numbers arrive **async via webhook**). Don't hardcode rate limits — read `x-rate-limit-*` response headers and handle HTTP 429.
- **GDPR / personal data (EU-critical).** LinkedIn posts/profiles and contacts are personal data of EU individuals. Use only logged-out public-data providers (never session-cookie/fake-account scraping), and honor lawful basis + data-subject rights even though LinkedIn enrichment is a headline feature of the demo. This is a compliance decision for the client, not just a feature toggle.

## 11. Decided (resolved — build to these)
1. **Search/research API:** **Exa** (neural/semantic) — best for discovery ("find what Lusha misses"). Keep it behind the search-tool interface so **Firecrawl** can be added for deep page extraction later.
2. **Auth + org management + DB:** **Supabase** — auth, user/org records, and the Postgres database in one. LangGraph's `AsyncPostgresSaver` checkpointer runs on that same Postgres.
3. **Mailbox:** **Gmail first** — build the full Gmail implementation for the PoC. **Microsoft 365** is a second implementation behind the same `MailSender` port (toggleable, added right after Gmail). Both supported; Gmail is the priority so M365 must not block the demo.
4. **HubSpot connection:** **private-app token** (on a test/your own HubSpot) for the PoC; OAuth install flow comes later behind the same CRM adapter.
5. **LLM:** both wired via the `LLMProvider` factory. **Claude** (hosted) for best quality; **Ollama runs on your own demo server** with **Qwen 2.5 14B+** (tool-calling capable) so the local-private option is demoable live alongside Claude. `OLLAMA_BASE_URL` points at that server.
6. **Priority signals (tune scoring to these four):** hiring/job postings, funding rounds, LinkedIn post activity, and financial health from registries (NBB/KVK/LBR).
7. **LinkedIn enrichment:** **in scope and front-and-center** in the demo, via Bright Data's logged-out public Post API. GDPR obligations still apply (see §10) — handle lawful basis + data-subject rights even though it's a headline feature.

### Still to confirm with the client (not blockers)
- Exact ICP / target segments and sectors to point the agent at.
- Whether the demo HubSpot / mailbox / Apollo accounts are yours (test) or the client's.
- The client's comfort with the LinkedIn/GDPR posture given it's front-and-center.

## 12. Reference docs (verify current APIs against these)

> **⚠️ Companion file `dependency-verification.md`** — a live-verified (June 2026) report of every dependency below, with per-dependency API surface, gotchas, and minimal code snippets. **All of its corrections have now been folded inline into this brief** — Gmail scope (§13), HubSpot upsert + scopes (§6, §13), and in §5: Anthropic model IDs, Exa MCP tool names, MS Graph delegated-vs-app `sendMail`, Supabase `:5432` checkpointer port, `langchain-mcp-adapters` `streamable_http` transport, Ollama `json_schema` default, deepagents return type + HITL `Command(resume)` caveat; plus Apollo limits (§10). Use this companion file for full detail and snippets, and as the tiebreaker if anything here looks stale.
- Deep Agents — [docs.langchain.com/oss/python/deepagents/overview](https://docs.langchain.com/oss/python/deepagents/overview) · [github.com/langchain-ai/deepagents](https://github.com/langchain-ai/deepagents) · [PyPI](https://pypi.org/project/deepagents/)
- LangChain MCP adapters — [docs.langchain.com/oss/python/langchain/mcp](https://docs.langchain.com/oss/python/langchain/mcp) · [github.com/langchain-ai/langchain-mcp-adapters](https://github.com/langchain-ai/langchain-mcp-adapters)
- LangGraph human-in-the-loop — [docs.langchain.com/oss/python/langchain/human-in-the-loop](https://docs.langchain.com/oss/python/langchain/human-in-the-loop)
- Apollo API — [docs.apollo.io](https://docs.apollo.io/) (People Search, People/Bulk Enrichment, Organization Search/Enrichment)
- LinkedIn data (logged-out, public) — [Bright Data LinkedIn APIs](https://brightdata.com/products/web-scraper/linkedin) (Profile/Post/Company). Legal context: Meta v. Bright Data (2024, public-data scraping upheld) vs. Proxycurl shutdown (2025, fake-account/logged-in scraping)
- Belgian/Benelux registries — NBB Central Balance Sheet Office [nbb.be](https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services), KBO/BCE (BE), KVK (NL), LBR/RCS (LU)
- HubSpot — MCP server [developers.hubspot.com/mcp](https://developers.hubspot.com/mcp) · Email engagements [developers.hubspot.com/docs/api-reference/crm-emails-v3/guide](https://developers.hubspot.com/docs/api-reference/crm-emails-v3/guide)
- Gmail send — `users.messages.send`; Microsoft Graph send — `/me/sendMail` (**delegated** `Mail.Send`) or `/users/{id}/sendMail` (**application** `Mail.Send`, daemon/app-only); OAuth2 for both
- `langchain-anthropic` `ChatAnthropic` (Claude) — [reference.langchain.com/python/langchain-anthropic](https://reference.langchain.com/python/langchain-anthropic)
- `langchain-ollama` `ChatOllama` (local) — [reference.langchain.com/python/langchain-ollama](https://reference.langchain.com/python/langchain-ollama) · Ollama tool calling — [docs.ollama.com/capabilities/tool-calling](https://docs.ollama.com/capabilities/tool-calling)

## 13. Setup checklist — what to have ready

### API keys & accounts (required for the PoC)

| Service | For | What to obtain | Notes / cost |
|---------|-----|----------------|--------------|
| **Anthropic** | Claude (agents, drafting) | API key | Pay per token; console.anthropic.com |
| **Apollo.io** | Contact data (search + enrichment) | Account + API key | Search is free; enrichment burns credits → free tier to start, paid plan for real volume |
| **Exa** | Research-agent neural search | `EXA_API_KEY` | Pay per search (~$7/1k as of Mar 2026); MCP tools `web_search_exa` / `web_fetch_exa` |
| **Bright Data** | LinkedIn Post API (public, logged-out) | Account + token (`BRIGHTDATA_API_KEY`) | Free tier ~5k records/mo; ~$1.5/1k after |
| **Supabase** | Auth + Postgres DB | Project URL + anon key + service-role key | Free tier fine; checkpointer Postgres uses port **`:5432`** (not the `:6543` pooler); `service_role` bypasses RLS |

### OAuth apps to register

- **Google Cloud (Gmail) — required.** GCP project → enable the **Gmail API** → OAuth consent screen kept in **"Testing"** mode with your demo accounts added as **test users** (skips Google's full verification) → create an **OAuth client ID + secret**. Scope: **`gmail.send`** (add `gmail.readonly` later if reply-monitoring is built). Note: `gmail.send` is a **sensitive** scope (not *restricted*) — it needs OAuth verification for production but **avoids** the restricted-scope CASA security assessment. **In Testing mode each external test-user grant (incl. refresh token) expires after 7 days**, so a long-running PoC silently stops sending after a week — re-consent or publish the app to fix.
- **Microsoft Entra (Microsoft 365) — next, not blocking.** App registration in Entra ID with **`Mail.Send`** + client secret. Defer until Gmail works. Note: `/me/sendMail` needs **delegated** `Mail.Send`; a daemon/app-only service must use **application** `Mail.Send` + `POST /users/{id}/sendMail` (constrain with an Application Access Policy).

### HubSpot

- A **test/dev HubSpot account** (free tier is fine).
- Create a **private app** → copy its **access token** (`HUBSPOT_PRIVATE_APP_TOKEN`).
- Grant scopes: `crm.objects.contacts.read`+`.write`, `crm.objects.companies.read`+`.write`, and `crm.objects.emails.read`+`.write` (the email scopes can be seat-gated — verify they're available in your portal tier).

### Hardware / hosting

- **Ollama server** for the live local-LLM demo: hardware that runs **Qwen 2.5 14B+** comfortably — roughly **12–16 GB VRAM**, or an Apple Silicon Mac with **≥24–32 GB unified memory**. Install Ollama, `ollama pull qwen2.5:14b` (fallbacks: `qwen2.5:7b` / `qwen3:8b` if tight). Ensure `OLLAMA_BASE_URL` is reachable from the backend. **Test this before the demo** so the Claude-vs-local comparison actually runs.
- **App hosting:** FastAPI backend + React frontend can run locally for the demo or on any simple host; Supabase covers the database.
- **A real Gmail/Workspace account you control** to send from, so test sends actually deliver.

### Minimal "first demo path" subset

To stand up the core slice fast you strictly need: **Anthropic + Apollo + Exa + Supabase + a Gmail OAuth app + a HubSpot private-app token.** Add **Bright Data** for the LinkedIn highlight and the **Ollama box** for the local-LLM comparison once the path is green.
