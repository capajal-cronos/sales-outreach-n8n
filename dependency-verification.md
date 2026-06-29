# Verified Dependencies — ProspectAI PoC Build

All 10 dependencies were independently verified against live docs/PyPI/npm as of June 2026. None are "uncertain"; 8 are **confirmed**, 2 are **changed** (Gmail scope classification, Exa find-similar deprecation).

## 1. Summary Table

| Dependency | Status | Headline gotcha |
|---|---|---|
| deepagents (LangChain Deep Agents) | confirmed | Returns a `CompiledStateGraph`, not a callable — invoke with `{"messages":[...]}`; human-in-the-loop needs a checkpointer. Pin `>=0.6,<0.7` (0.7.x is alpha). |
| langchain-mcp-adapters | confirmed | Transport string must be `"http"` or `"streamable_http"` (underscore). `"streamable-http"` (hyphen) raises ValueError. `get_tools()` is async. |
| langchain-anthropic (ChatAnthropic) | confirmed | Model IDs are pinned snapshots; brief's likely default (3.5-sonnet/4-1) is stale — migrate to `claude-sonnet-4-6`/`claude-opus-4-8`. Use `method="json_schema"` + `strict=True`. |
| langchain-ollama (ChatOllama) | confirmed | `with_structured_output` default is now `method="json_schema"`, not `function_calling`. Verify `.tool_calls` is structured on your exact model tag. |
| Apollo.io REST API | confirmed | People Search (`/mixed_people/api_search`, free, master key) NEVER returns emails/phones — enrichment costs credits; phones arrive async via webhook. No fixed rate limits to hardcode. |
| HubSpot CRM v3 + remote MCP | confirmed | `POST /objects/contacts` is CREATE-only (409 on dup) — use `/batch/upsert`. Email-engagement scopes are seat-gated/hidden. MCP ≠ production logging surface. |
| Gmail API (sendMail) | **changed** | `gmail.send` is **SENSITIVE, not restricted** (brief is wrong) — avoids CASA Tier 2. Test-user OAuth grants expire after 7 days. |
| Microsoft Graph sendMail | confirmed | `/me/sendMail` is DELEGATED-only — app-only/daemon tokens MUST use `/users/{id}/sendMail`. 202 = accepted, not delivered. |
| Supabase (Auth + Postgres) | confirmed | Port 6543 = transaction-mode only (breaks AsyncPostgresSaver prepared statements). Use direct `:5432`. Verify JWT locally via JWKS + `aud="authenticated"`. |
| Exa search + MCP + langchain-exa | **changed** | `find_similar` is DEPRECATED; Exa MCP exposes `web_search_exa`/`web_fetch_exa` (NOT `find_similar`/`get_contents`). Pricing rose Mar 2026 (~$7/1k). |

## 2. Discrepancies vs the Brief (must-fix)

Every finding below had a non-empty `briefDiscrepancies`. These are things the brief gets wrong or states imprecisely.

**CRITICAL — Gmail scope classification (changed):** The brief calls `gmail.send` a *restricted* scope. It is **SENSITIVE**, not restricted. This is materially good news: sensitive needs OAuth verification (~2–6 wks) but **avoids the restricted-scope CASA Tier 2 security assessment**. The brief's choice of `gmail.send` is the correct, faster path. Also not in the brief: in Testing mode, each external test-user grant (incl. refresh token) **expires 7 days after consent** — a long-running PoC silently stops sending after a week.

**CRITICAL — Microsoft Graph `/me/sendMail`:** Works with **delegated** `Mail.Send` only. If the build is a daemon/service (app-only client-credentials), `/me/sendMail` will fail — you must grant **application** `Mail.Send` (admin consent) and call `POST /users/{id|UPN}/sendMail`. App-only `Mail.Send` is tenant-wide; constrain it with an Application Access Policy or RBAC-for-Applications. Confirm which flow the build uses.

**CRITICAL — Exa find-similar / MCP tools (changed):**
- `find_similar` / `/findSimilar` is **deprecated** ("no longer recommended for new integrations") — still functional. Design discovery around `search(type="neural"|"auto")`.
- The official Exa MCP server exposes `web_search_exa` and `web_fetch_exa` (+ optional advanced/agent tools). There is **no MCP tool named `find_similar` or `get_contents`** — those capabilities are only available via the direct SDK/REST or `langchain-exa` (`ExaFindSimilarResults`). An agent expecting those MCP tool names will not resolve them.
- Pricing rose Mar 2026 (search ~$7/1k vs $5); re-budget.

**HIGH — HubSpot "upsert":** A plain `POST /crm/v3/objects/contacts` is **CREATE-only** and returns **409** on a duplicate email — it does NOT upsert. Use `POST /crm/v3/objects/contacts/batch/upsert` with `idProperty:"email"` (or search-then-PATCH). Scopes: contacts need `crm.objects.contacts.write` (+`.read`); email engagements need **both** `crm.objects.emails.write` AND `crm.objects.emails.read` — and these email scopes have historically been hidden/seat-gated, so verify availability in your portal tier. The remote MCP (mcp.hubspot.com, GA 2026-04-13) is for agent/conversational access and is **blocked from Activity objects when "sensitive data" is enabled** — not the right surface for production email logging; use direct REST.

**HIGH — Apollo rate limits:** Do NOT hardcode assumed rate limits. There are **no fixed published numbers** — limits are per-plan/per-endpoint across minute/hour/day windows. Read them from response headers (`x-rate-limit-*`) or `/usage_stats/api_usage_stats`, and handle HTTP 429. Also: use `/mixed_people/api_search` (free, **master key required**), not the legacy `/mixed_people/search`; phones arrive async via webhook.

**MEDIUM — Anthropic model ID:** If the build pins an older default (`claude-3-5-sonnet`, `claude-sonnet-4-5`, `opus-4-1`), migrate. As of June 2026 the current tier is `claude-opus-4-8`, `claude-sonnet-4-6`, `claude-haiku-4-5` (snapshot `claude-haiku-4-5-20251001`). `claude-opus-4-1-20250805` is deprecated (retires 2026-08-05). For native structured output set `method="json_schema"`; for tool determinism set `strict=True`.

**MEDIUM — langchain-mcp-adapters transport string:** If the config literally uses `"streamable-http"` (hyphen) it fails with ValueError. Use `"http"` or `"streamable_http"` (underscore). `get_tools()` must be `await`ed. Confirm the agent constructor matches your pinned versions (`langgraph.prebuilt.create_react_agent` vs `langchain.agents.create_agent`).

**MEDIUM — langchain-ollama default method:** `with_structured_output` default is now `method="json_schema"` (not `function_calling`). `function_calling` is still valid and works only on tool-trained models (matches the 14B+ floor). Pass `base_url` explicitly; set `validate_model_on_init=True`. Verify `.tool_calls` is structured (not buried in `content`) on your exact model+tag.

**MEDIUM — Supabase:** (1) Verify JWTs **locally via the asymmetric JWKS endpoint** (PyJWT/jose, ES256/RS256, `audience="authenticated"`) or `auth.get_claims()` — not the deprecated HS256 shared secret, not necessarily a `get_user()` round-trip. (2) For a persistent FastAPI app use a **direct connection** (`db.<ref>.supabase.co:5432`) or Supavisor **session** mode (`:5432`) — NOT transaction mode (`:6543`), since AsyncPostgresSaver uses prepared statements (or disable them: asyncpg `statement_cache_size=0`). (3) RLS only isolates tenants if the connection runs as anon/authenticated with the user JWT; the secret/service_role key **bypasses RLS** — enforce isolation in app code or forward the user token.

**LOW — deepagents:** Essentially correct. Note the returned object is a `CompiledStateGraph` invoked with a messages dict (not a callable taking a raw string); human-in-the-loop `interrupt_on` **requires a checkpointer** to function.

**Bright Data:** Brief is essentially correct — only a precision note (3 steps, not 2) and a pricing caveat; see §3.

---

## 3. Per-Dependency Detail

### deepagents (LangChain Deep Agents, Python) — confirmed
**Version:** `deepagents` 0.6.12 stable (2026-06-25), Python `>=3.11,<4.0`. 0.7.0 alpha exists — pin `>=0.6,<0.7`. CLI ships separately as `deepagents-cli`.
**API surface:** `from deepagents import create_deep_agent`. Signature (v0.6.x): `create_deep_agent(model=None, tools=None, *, system_prompt=None, middleware=(), subagents=None, skills=None, memory=None, permissions=None, backend=None, interrupt_on=None, response_format=None, state_schema=None, context_schema=None, checkpointer=None, store=None, debug=False, name=None, cache=None) -> CompiledStateGraph`. `model` is `str|BaseChatModel` (provider-prefixed string e.g. `"anthropic:claude-sonnet-4-6"`); `tools` is `Sequence[BaseTool|Callable|dict]`; `interrupt_on` is `dict[str, bool|InterruptOnConfig]`. Driven by the LangGraph runtime: `invoke({"messages":[...]})`, `stream`, `ainvoke`, `stream_events(version="v3")`. Auto-included tools: `write_todos` (planning), `task` (subagent delegation, singular), virtual filesystem (`ls/read_file/write_file/edit_file/glob/grep/execute`).
**Auth:** No auth layer of its own — delegated to the LLM provider via standard env vars (`ANTHROPIC_API_KEY`, etc.) resolved from the provider-prefixed model string. Optional LangSmith tracing uses `LANGSMITH_API_KEY`.
**Top gotchas:** Returns a graph, not a function — invoke with a messages dict. HITL requires a checkpointer; `interrupt_on={"tool_name": True}` pauses before the tool, resume via LangGraph Command/interrupt flow. Sandbox `execute` needs `pip install deepagents[quickjs]` + REPLMiddleware. Excluding `write_todos`/`task` removes the planning/subagent behavior the brief assumes.
**Snippet:**
```python
from deepagents import create_deep_agent
from langchain_core.tools import tool
from langgraph.checkpoint.memory import InMemorySaver

@tool
def search(query: str) -> str:
    """Search the web."""
    return f"results for {query}"

agent = create_deep_agent(
    model="anthropic:claude-sonnet-4-6",   # needs ANTHROPIC_API_KEY
    tools=[search],
    system_prompt="You are a research assistant.",
    interrupt_on={"search": True},         # human-in-the-loop pause
    checkpointer=InMemorySaver(),          # required for interrupts
)
result = agent.invoke(
    {"messages": [{"role": "user", "content": "Research deepagents and summarize."}]},
    config={"configurable": {"thread_id": "1"}},
)
print(result["messages"][-1].content)
```
**Docs:** pypi.org/project/deepagents/ · docs.langchain.com/oss/python/deepagents/overview · reference.langchain.com/python/deepagents/graph/create_deep_agent · langchain.com/blog/deep-agents-0-6 · github.com/langchain-ai/deepagents

### langchain-mcp-adapters (Python) — confirmed
**Version:** 0.3.0 (2026-06-10), Python `>=3.10`. Pin alongside `langchain`/`langgraph`/`mcp`.
**API surface:** `from langchain_mcp_adapters.client import MultiServerMCPClient`. `MultiServerMCPClient(connections: dict[str, ConnectionConfig])` — per-server `transport` (`"stdio"|"http"|"streamable_http"|"sse"`) + transport fields (stdio: `command`,`args`,`env`; http: `url`,`headers`,`auth`). `await client.get_tools(server_name=None) -> list[BaseTool]` (ASYNC). `client.session(server_name)` async ctx mgr for lower-level access. Helpers: `tools.load_mcp_tools`, `prompts.load_mcp_prompt`.
**Auth:** No package-level auth — per-MCP-server. Remote http: `headers={"Authorization": "Bearer TOKEN"}`. stdio: env vars to the subprocess. Adapter does not refresh OAuth tokens — supply valid ones.
**Top gotchas:** Transport string is the #1 footgun — `"streamable-http"` (hyphen) is REJECTED (ValueError, issues #322/#267); use `"http"` or `"streamable_http"`. `get_tools()` is async-only. 0.3.x: tool errors now return `ToolMessage(status="error")` instead of raising `ToolException`. Agent constructor differs by version (`langgraph.prebuilt.create_react_agent` vs `langchain.agents.create_agent`). For stateful HubSpot calls use `client.session(...)`.
**Snippet:**
```python
import asyncio
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent  # or langchain.agents.create_agent

async def main():
    client = MultiServerMCPClient({
        "math": {"transport": "stdio", "command": "python", "args": ["/path/to/math_server.py"]},
        "hubspot": {"transport": "streamable_http",  # or "http"; NOT "streamable-http"
                     "url": "https://your-hubspot-mcp.example.com/mcp",
                     "headers": {"Authorization": "Bearer YOUR_HUBSPOT_TOKEN"}},
    })
    tools = await client.get_tools()
    agent = create_react_agent("anthropic:claude-sonnet-4-5", tools)
    print(await agent.ainvoke({"messages": "List my open HubSpot deals."}))

asyncio.run(main())
```
**Docs:** pypi.org/project/langchain-mcp-adapters/ · github.com/langchain-ai/langchain-mcp-adapters · docs.langchain.com/oss/python/langchain/mcp · reference.langchain.com/python/langchain-mcp-adapters/client/MultiServerMCPClient · issue #322

### langchain-anthropic — ChatAnthropic (Python) — confirmed
**Version:** 1.4.8 (2026-06-26), Python `>=3.10,<4.0`, Production/Stable. `from langchain_anthropic import ChatAnthropic`.
**API surface:** `ChatAnthropic(model, temperature=, max_tokens=, timeout=, max_retries=, api_key=, thinking={"type":"enabled","budget_tokens":N})` — `model` required. Runnable methods `.invoke/.stream/.ainvoke/.astream/.abatch`. `.bind_tools(tools, *, strict=False, tool_choice=)` accepts Pydantic models, `@tool`, functions, OpenAI/Anthropic tool dicts. `.with_structured_output(schema, *, method="function_calling"|"json_schema", include_raw=False)` — `json_schema` uses Anthropic native structured output.
**Auth:** API-key. `ANTHROPIC_API_KEY` env (auto-read) or `api_key="..."`. No OAuth. Bedrock/Vertex/Foundry use their own creds.
**Top gotchas:** `method="json_schema"` requires `>=1.1.0` and uses native structured output (default is `function_calling`). `strict=True` (off by default) prevents type-coercion bugs — enable in production. Model IDs are pinned snapshots even when dateless (`claude-sonnet-4-6`). Opus 4.7+ uses a new tokenizer (~30% more tokens). Opus 4.8 API `effort` defaults to high — set explicitly. Do not use `ChatAnthropicTools` (experimental); use `bind_tools`/`with_structured_output`.
**Snippet:**
```python
from langchain_anthropic import ChatAnthropic
from pydantic import BaseModel, Field

model = ChatAnthropic(model="claude-sonnet-4-6", temperature=0, max_tokens=1024, max_retries=3)

class GetWeather(BaseModel):
    """Get current weather for a location."""
    location: str = Field(description="City and state")

print(model.bind_tools([GetWeather], strict=True).invoke("Weather in Austin, TX?").tool_calls)

class Movie(BaseModel):
    title: str; year: int; director: str

print(model.with_structured_output(Movie, method="json_schema").invoke("Tell me about Inception"))
```
**Docs:** pypi.org/project/langchain-anthropic/ · docs.langchain.com/oss/python/integrations/chat/anthropic · reference.langchain.com/.../bind_tools · .../with_structured_output · platform.claude.com/docs/en/docs/about-claude/models

### langchain-ollama — ChatOllama (Python) — confirmed
**Version:** 1.1.0 (~Apr 2026), Python `>=3.10,<4.0`, Production/Stable. `from langchain_ollama import ChatOllama`. Do NOT use deprecated `langchain_community.chat_models.ollama.ChatOllama`.
**API surface:** `ChatOllama(model, base_url="http://localhost:11434", temperature=0.8, validate_model_on_init=False, ...)`. `bind_tools(tools)`. `with_structured_output(schema, *, method="function_calling"|"json_mode"|"json_schema"=DEFAULT "json_schema", include_raw=False)` — `json_schema`/`function_calling` need a tool/structured-capable model; `json_mode` works on non-tool models (describe schema in prompt). Runnable: `invoke/ainvoke/stream/astream/batch`.
**Auth:** None for local. Calls `http://localhost:11434` with no key. Set `base_url=` for remote (`OLLAMA_HOST`/`OLLAMA_BASE_URL` honored by the underlying client, but prefer explicit `base_url`). No first-class API-key for local mode.
**Top gotchas:** Default `method` is now `json_schema`, not `function_calling`. Set `validate_model_on_init=True` to fail fast on unpulled models. Some models (e.g. certain qwen2.5-coder templates) put tool calls in `content` as a JSON string instead of `tool_calls` — verify `.tool_calls` on your exact tag. Tool-call reliability scales with model size; 14B+ floor is sound. Token-usage metadata unsupported.
**Snippet:**
```python
from langchain_ollama import ChatOllama
from langchain_core.tools import tool
from pydantic import BaseModel, Field

llm = ChatOllama(model="qwen2.5:14b", base_url="http://localhost:11434",
                 temperature=0, validate_model_on_init=True)

@tool
def get_weather(city: str) -> str:
    """Get the weather for a city."""
    return f"Sunny in {city}"

print(llm.bind_tools([get_weather]).invoke("What's the weather in Paris?").tool_calls)

class Lead(BaseModel):
    name: str = Field(description="Full name"); company: str; score: int

print(llm.with_structured_output(Lead, method="function_calling").invoke("Jane Doe at Acme, hot lead, score 9"))
```
**Docs:** pypi.org/project/langchain-ollama/ · docs.langchain.com/oss/python/integrations/chat/ollama · .../providers/ollama · reference.langchain.com/.../ChatOllama/with_structured_output · .../bind_tools · ollama.com/library/qwen2.5

### Apollo.io REST API — confirmed
**Version:** REST v1, base `https://api.apollo.io/api/v1` (auth health-check is `/v1/auth/health`, no `/api`).
**API surface (all POST + JSON unless noted):**
- People Search (FREE, no emails/phones, master key): `POST /api/v1/mixed_people/api_search` — `person_titles[]`, `person_seniorities[]`, `person_locations[]`, `organization_locations[]`, `q_keywords`, `page`, `per_page` (max 100/pg, 500 pgs, 50k-record cap). Use `api_search`, NOT legacy `/mixed_people/search`.
- People Enrichment (CREDITS): `POST /api/v1/people/match` — `first_name`,`last_name`,`email`,`organization_name`,`domain`,`linkedin_url`,`reveal_personal_emails`,`reveal_phone_number`,`run_waterfall_email`,`run_waterfall_phone`,`webhook_url`.
- Bulk People Enrichment (≤10): `POST /api/v1/people/bulk_match` (`details[]`).
- Organization Search (CREDITS): `POST /api/v1/mixed_companies/search`. Organization Enrichment: `POST /api/v1/organizations/enrich`; Bulk (≤10): `/organizations/bulk_enrich`.
- Usage: `GET /api/v1/usage_stats/api_usage_stats` (master key). Health: `GET /v1/auth/health`.
**Auth:** API key in header `X-Api-Key`. **Header-only since Sept 2024** — query/body keys removed. Keys created in Settings → Integrations → API Keys, scoped per-endpoint; `api_search`/`usage_stats` need a **master** key. OAuth 2.0 only for approved partners.
**Top gotchas:** People Search NEVER returns emails/phones — enrichment does (credits), and phones come back **async via `webhook_url`**, personal emails inline when `reveal_personal_emails=true`. Hard cap 50k records. **No published rate-limit numbers** — read response headers / poll usage stats; handle 429. Org Search consumes credits. Free plan ~100 credits/mo, ~600 req/day.
**Snippet:**
```js
const HEADERS = { 'Content-Type':'application/json', 'Cache-Control':'no-cache',
                  'X-Api-Key': process.env.APOLLO_API_KEY }; // header-only since Sept 2024
async function searchPeople() {
  const res = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search',
    { method:'POST', headers:HEADERS, body: JSON.stringify({
        person_titles:['VP of Engineering'], person_seniorities:['vp'],
        organization_locations:['United States'], per_page:25, page:1 }) });
  if (res.status === 429) throw new Error('Apollo rate limit (429) — back off');
  if (!res.ok) throw new Error(`Apollo search failed: ${res.status} ${await res.text()}`);
  return res.json(); // .people[] — NO email/phone
}
async function enrichPerson({ firstName, lastName, domain }) {
  const res = await fetch('https://api.apollo.io/api/v1/people/match',
    { method:'POST', headers:HEADERS, body: JSON.stringify({
        first_name:firstName, last_name:lastName, domain,
        reveal_personal_emails:true, reveal_phone_number:false }) }); // true => phones async via webhook
  if (!res.ok) throw new Error(`Apollo enrich failed: ${res.status} ${await res.text()}`);
  return res.json(); // .person.email when matched
}
```
**Docs:** docs.apollo.io/reference/{people-api-search, people-enrichment, bulk-people-enrichment, organization-search, organization-enrichment, authentication, rate-limits, view-api-usage-stats} · docs.apollo.io/docs/{test-api-key, create-api-key}

### HubSpot CRM API (v3) + remote MCP — confirmed
**Version:** CRM v3 objects API (URL-versioned `/crm/v3`). SDKs: `@hubspot/api-client` (Node), `hubspot-api-client` (Python). Remote HubSpot MCP: GA 2026-04-13 at `https://mcp.hubspot.com` (Streamable HTTP). Distinct from the LOCAL Developer MCP (GA 2026-02-19, for building apps — not CRM logging).
**API surface:** Create contact: `POST /crm/v3/objects/contacts` `{properties:{...}}` → 201+id. Update: `PATCH /crm/v3/objects/contacts/{id}`. **Upsert** by unique prop: `POST /crm/v3/objects/contacts/batch/upsert` `{inputs:[{idProperty:"email", id:"<email>", properties:{...}}]}`. Log email: `POST /crm/v3/objects/emails` `{properties:{hs_timestamp, hs_email_direction, hs_email_subject, hs_email_text, hs_email_status:"SENT"}, associations:[{to:{id:contactId}, types:[{associationCategory:"HUBSPOT_DEFINED", associationTypeId:198}]}]}`. (198 = email-to-contact.)
**Auth:** Direct REST/SDK production → **private-app access token** (long-lived, `Authorization: Bearer pat-xxxx`). Scopes: `crm.objects.contacts.write` (+`.read`); `crm.objects.emails.write` AND `crm.objects.emails.read`. Remote MCP uses OAuth 2.1 + PKCE + refresh rotation (not a private-app token), scopes auto-determined by installed tools + user grant.
**Top gotchas:** `POST /objects/contacts` is CREATE-only — 409 on dup; use `/batch/upsert` or search-then-PATCH. Email scopes are historically hidden/seat-gated (Sales/Marketing Hub) — verify selectable in your tier (403 risk). `hs_timestamp` REQUIRED on email object. MCP blocked from Activity objects when "sensitive data" is on. Wrong/missing `associationTypeId` orphans the engagement off the timeline.
**Snippet:**
```js
import { Client } from "@hubspot/api-client";
const hubspot = new Client({ accessToken: process.env.HUBSPOT_PRIVATE_APP_TOKEN });

const up = await hubspot.crm.contacts.batchApi.upsert({ inputs: [{ idProperty: "email",
  id: "jane@acme.com", properties: { email: "jane@acme.com", firstname: "Jane", lastname: "Doe" } }] });
const contactId = up.results[0].id;

await hubspot.crm.objects.basicApi.create("emails", {
  properties: { hs_timestamp: Date.now().toString(), hs_email_direction: "EMAIL",
    hs_email_status: "SENT", hs_email_subject: "Quick intro", hs_email_text: "Hi Jane, following up..." },
  associations: [{ to: { id: contactId },
    types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 198 }] }],
});
// Scopes: crm.objects.contacts.read/.write, crm.objects.emails.read/.write
```
**Docs:** developers.hubspot.com/docs/apps/developer-platform/build-apps/integrate-with-the-remote-hubspot-mcp-server · changelog/remote-hubspot-mcp-server-is-now-generally-available · /mcp · docs/apps/legacy-apps/authentication/scopes · docs/api-reference/crm-emails-v3/guide

### Gmail API — sending via OAuth 2.0 — **changed**
**Version:** Gmail API v1 (REST), `gmail.googleapis.com/gmail/v1`. Docs updated 2026-04-15. No version bump.
**API surface:** `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`, body `{"raw":"<base64url RFC 2822 MIME>"}`. Large/attachments → `/upload/gmail/v1/.../messages/send`. Node: `gmail.users.messages.send({userId:'me', requestBody:{raw}})`. Python: `service.users().messages().send(userId='me', body={'raw':raw}).execute()`.
**Auth:** OAuth 2.0 user-delegated. Minimal scope `https://www.googleapis.com/auth/gmail.send` — **SENSITIVE, not restricted** (gmail.compose/modify/full `https://mail.google.com/` are restricted). Sensitive needs OAuth verification (~2–6 wks brand + sensitive-scope review) but **NOT** CASA Tier 2.
**Top gotchas (changed from brief):** Brief calls gmail.send restricted — wrong; it's sensitive, and choosing it avoids CASA Tier 2. In Testing mode: ≤100 test users AND each grant (incl. refresh token) **expires 7 days after consent** — a long PoC silently stops sending after a week, must re-consent. Unverified + sensitive scope shows the "unverified app" warning. MIME must be RFC 2822 + **base64url** (`-`/`_`, no padding) — standard base64 → 400. Use `userId="me"`.
**Snippet:**
```js
const { google } = require('googleapis');
const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oauth2.setCredentials({ refresh_token: REFRESH_TOKEN }); // scope: gmail.send
const gmail = google.gmail({ version: 'v1', auth: oauth2 });
const mime = ['From: me','To: recipient@example.com','Subject: Hello from Gmail API',
  'Content-Type: text/plain; charset="UTF-8"','','This is the body.'].join('\r\n');
const raw = Buffer.from(mime).toString('base64')
  .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''); // base64url
await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
```
**Docs:** developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send · .../api/auth/scopes · .../api/guides/sending · support.google.com/cloud/answer/15549945 · .../7454865

### Microsoft Graph — sendMail — confirmed
**Version:** Graph v1.0 (GA; sendMail page updated 2026-06-19). JS: `@microsoft/microsoft-graph-client` v3.0.7 (production standard) — NOT the Kiota `@microsoft/msgraph-sdk` (still 1.0.0-preview). Auth: `@azure/identity` 4.x.
**API surface:** `POST /v1.0/me/sendMail` (delegated) and `POST /v1.0/users/{id|UPN}/sendMail` (app-only or delegated). Body `{message: Message, saveToSentItems?: boolean=true}` → **202 Accepted**, empty body. JS: `client.api('/me/sendMail').post(sendMail)` / `client.api('/users/${id}/sendMail').post(...)`. Client via `Client.initWithMiddleware({authProvider})` + `TokenCredentialAuthenticationProvider`.
**Auth:** OAuth2 via Entra ID. (1) **Delegated** → `Mail.Send` scope, interactive/auth-code/OBO; only this can use `/me/`. (2) **Application/app-only** → `Mail.Send` application permission + admin consent, client-credentials; MUST target `/users/{id}/sendMail`; request scope `.default`.
**Top gotchas:** `/me/sendMail` is delegated-only — app-only tokens fail (no signed-in user). App-only `Mail.Send` is tenant-wide (send as any mailbox) — constrain with Application Access Policy or RBAC-for-Applications (2026). 202 = accepted, NOT delivered (async, throttled). `saveToSentItems` defaults true. Basic-auth SMTP being retired — use Graph. Prefer stable v3.x client. Inline attachments ~3–4 MB; larger → upload session.
**Snippet:**
```js
import 'isomorphic-fetch';
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider }
  from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const credential = new ClientSecretCredential(process.env.TENANT_ID, process.env.CLIENT_ID, process.env.CLIENT_SECRET);
const authProvider = new TokenCredentialAuthenticationProvider(credential,
  { scopes: ['https://graph.microsoft.com/.default'] });
const client = Client.initWithMiddleware({ authProvider });

const sender = 'noreply@yourdomain.com'; // app-only: send AS this UPN
await client.api(`/users/${sender}/sendMail`).post({
  message: { subject: 'Hello from Graph', body: { contentType: 'HTML', content: '<p>It works.</p>' },
    toRecipients: [{ emailAddress: { address: 'dest@example.com' } }] },
  saveToSentItems: true,
}); // 202 == queued, not delivered
// Delegated variant: scope 'Mail.Send', endpoint '/me/sendMail'
```
**Docs:** learn.microsoft.com/en-us/graph/api/user-sendmail · /graph/permissions-reference · /graph/sdks/choose-authentication-providers · /graph/tutorials/typescript-app-only-authentication · /graph/outlook-send-mail-from-other-user · graphpermissions.merill.net/permission/Mail.Send · office365itpros.com/2026/02/17/mail-send-rbac-for-applications/

### Supabase (Auth + Postgres) from FastAPI — confirmed
**Version:** `supabase` (PyPI) 2.31.0 (2026-06-04), Python `>=3.9`. 3.0.0a1 pre-release exists — do NOT use in prod. Pulls in supabase-auth/postgrest/storage3/realtime/functions.
**API surface:** `create_client(url, key)` / `create_async_client(...)`. JWT verify in FastAPI: `auth.get_claims(jwt=None, jwks=None)` — local verify vs project JWKS (preferred, cached); `auth.get_user(jwt=None)` — server round-trip (~100–600ms). Data via PostgREST (honors RLS): `supabase.table("t").select/insert/update/delete(...).execute()`. LangGraph: plain DSN consumed by asyncpg/psycopg. RLS: `alter table t enable row level security;` + `create policy ... using(<expr>) with check(<expr>)`; helpers `auth.uid()`, `auth.jwt()`.
**Auth:** (1) Server keys — since Oct 1 2025 new projects default to `sb_publishable_...` (client, RLS-bound) + `sb_secret_...` (server, bypasses RLS); legacy anon/service_role JWT keys coexist. (2) User JWTs — access tokens (1h default) + refresh; new projects default to asymmetric signing (RS256 default, ES256 recommended). JWKS at `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json`. Verify locally + check `aud="authenticated"`.
**Top gotchas:** Port **6543 = transaction mode only**; SESSION mode is **5432 only** (since Feb 28 2025). AsyncPostgresSaver uses prepared statements → **must not** use 6543 (or set asyncpg `statement_cache_size=0`); use direct `db.<ref>.supabase.co:5432` or session pooler `:5432`. Direct conn is IPv6 by default (IPv4 = paid add-on); pooler hosts are IPv4. Pooler username is `postgres.<ref>` (direct is `postgres`). Legacy HS256 shared secret not for production. Secret/service_role key BYPASSES RLS — enforce tenant isolation in app or forward user JWT. Use immutable `app_metadata` for authz, never user-editable `user_meta_data`.
**Snippet:**
```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
import jwt
from jwt import PyJWKClient

JWKS = PyJWKClient("https://<ref>.supabase.co/auth/v1/.well-known/jwks.json")
bearer = HTTPBearer()

def current_user(cred = Depends(bearer)):
    token = cred.credentials
    key = JWKS.get_signing_key_from_jwt(token).key
    try:
        return jwt.decode(token, key, algorithms=["ES256", "RS256"], audience="authenticated")
    except jwt.PyJWTError:
        raise HTTPException(401, "invalid token")

# LangGraph persistence (direct conn):
# from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
# DSN = "postgresql://postgres:[PW]@db.<ref>.supabase.co:5432/postgres"
# async with AsyncPostgresSaver.from_conn_string(DSN) as cp: await cp.setup()
```
**Docs:** supabase.com/docs/reference/python/{auth-getclaims, auth-getuser} · /docs/guides/auth/signing-keys · /docs/guides/database/connecting-to-postgres · /database/postgres/row-level-security · /troubleshooting/supavisor-and-connection-terminology-explained-9pr_ZO · pypi.org/project/supabase/

### Exa search + MCP + langchain-exa — **changed**
**Version:** REST `https://api.exa.ai` (header `x-api-key`). `exa-py` 2.15.0 (2026-06-24, Python `>=3.9`). Official `exa-mcp-server` (npm) + hosted `https://mcp.exa.ai/mcp`. `langchain-exa` 1.1.0 (2026-03-26).
**API surface:** REST (POST): `/search`, `/findSimilar` (deprecated), `/contents`, `/answer`, `/chat/completions`. exa-py: `search(query, type="auto"|"neural"|"keyword"|"instant", num_results, contents, include_domains, ...)`, `search_and_contents(...)`, `get_contents(urls)`, `find_similar(url, ...)` (DEPRECATED), `answer(...)`, `stream_answer(...)`, Research/Agent API. **MCP tools:** `web_search_exa`, `web_fetch_exa` (default) + optional `web_search_advanced_exa`/agent tools — **NOT** `find_similar`/`get_contents`. langchain-exa: `ExaSearchRetriever`, `ExaSearchResults`, `ExaFindSimilarResults`.
**Auth:** API key only. REST header `x-api-key: <key>` (lowercase, NOT Bearer). SDKs read `EXA_API_KEY` or `api_key=`. Hosted MCP per dashboard config. No OAuth.
**Top gotchas (changed):** `find_similar`/`/findSimilar` DEPRECATED (still works) — design around `search(type="neural"/"auto")`. MCP has no `find_similar`/`get_contents` tools. Pricing rose Mar 2026 (search ~$7/1k, +$1/1k results beyond 10, contents ~$1/1k, deep/agentic ~$12–15/1k). `auto` ≠ neural — set `type="neural"` explicitly if needed. docs.exa.ai 307→exa.ai/docs. Pin langchain-exa exactly (1.0.0a1 alpha exists alongside 1.1.0).
**Snippet:**
```python
import os
from exa_py import Exa
exa = Exa(api_key=os.environ["EXA_API_KEY"])

res = exa.search_and_contents("latest advances in retrieval-augmented generation",
    type="neural", num_results=5, text=True)
for r in res.results: print(r.title, r.url, r.text[:200])

docs = exa.get_contents(["https://example.com/article"], text=True)
# find_similar is DEPRECATED — prefer search(type="neural") for new builds

# Via MCP (exposes web_search_exa / web_fetch_exa, NOT find_similar/get_contents):
# from langchain_mcp_adapters.client import MultiServerMCPClient
# client = MultiServerMCPClient({"exa": {"url":"https://mcp.exa.ai/mcp","transport":"streamable_http"}})
# tools = await client.get_tools()
```
**Docs:** exa.ai/docs/reference/quickstart · exa.ai/docs/sdks/python-sdk-specification · pypi.org/project/exa-py/ · github.com/exa-labs/exa-mcp-server · pypi.org/project/langchain-exa/ · docs.langchain.com/oss/python/integrations/tools/exa_search · exa.ai/pricing

### Bright Data Web Scraper API — LinkedIn — confirmed
**Version:** REST v3 (`/datasets/v3/...`), current as of June 2026. Hosted HTTP API (no SDK pin). LinkedIn dataset IDs: Profiles `gd_l1viktl72bvl7bjuj0`, Company `gd_l1vikfnt1wgvvqz95w`, Posts `gd_lyy3tktm25m4avu764`, Jobs `gd_lpfll7v5hcqtkxl6l`.
**API surface (base `https://api.brightdata.com`):** ASYNC (3 steps) — (1) Trigger: `POST /datasets/v3/trigger?dataset_id={ID}&include_errors=true[&type=discover_new&discover_by=keyword][&format=json]`, body = JSON array of inputs → `{"snapshot_id":"s_..."}`. (2) Poll: `GET /datasets/v3/progress/{snapshot_id}` → status in `{starting/building, running, ready, failed}`. (3) Download: `GET /datasets/v3/snapshot/{snapshot_id}?format=json` (also ndjson/jsonl/csv; 409 until ready). SYNC (≤~20 URLs, no polling): `POST /datasets/v3/scrape?dataset_id={ID}&format=json`. Logs: `GET /datasets/v3/log/{snapshot_id}`.
**Auth:** Single account API token, `Authorization: Bearer YOUR_API_KEY` on every call. No OAuth, no LinkedIn login. Managed in control panel (brightdata.com/cp/setting/users). Store as secret.
**Top gotchas:** Download is a SEPARATE 3rd step — the progress call does not return data; download returns **409** until `status=ready` (poll with backoff, not a tight loop). Status enum naming varies (`starting` vs `building`) — treat any non-`ready`/non-`failed` as "keep polling". Add `include_errors=true` or failed rows are silently dropped. Dataset ID selects scraper + input schema; "collect by URL" (`url`) vs "discover" (`type=discover_new`+`discover_by`) differ — wrong shape → empty/failed. Billing is **pay-per-successful-record**, no standing free tier (small starter credit only; "5K free" is promotional). Legacy `/dca/...` (v2) is dead — use v3.
**Snippet:**
```js
const TOKEN = process.env.BRIGHTDATA_API_TOKEN;
const DATASET = "gd_l1viktl72bvl7bjuj0"; // LinkedIn Profiles
const H = { Authorization: `Bearer ${TOKEN}` };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function scrapeLinkedIn(inputs) {
  const trig = await fetch(
    `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET}&include_errors=true`,
    { method:"POST", headers:{...H,"Content-Type":"application/json"}, body: JSON.stringify(inputs) });
  const { snapshot_id } = await trig.json();
  for (;;) {
    const p = await (await fetch(`https://api.brightdata.com/datasets/v3/progress/${snapshot_id}`, { headers:H })).json();
    if (p.status === "ready") break;
    if (p.status === "failed") throw new Error(`snapshot ${snapshot_id} failed`);
    await sleep(5000);
  }
  const res = await fetch(`https://api.brightdata.com/datasets/v3/snapshot/${snapshot_id}?format=json`, { headers:H });
  if (!res.ok) throw new Error(`download ${res.status}`); // 409 = not ready yet
  return res.json();
}
scrapeLinkedIn([{ url: "https://www.linkedin.com/in/elad-moshe-05a90413/" }]).then((d) => console.log(d));
```
**Docs:** docs.brightdata.com/datasets/scrapers/linkedin/{introduction, send-first-request} · /scraping-automation/web-data-apis/web-scraper-api/trigger-a-collection · /api-reference/web-scraper-api/management-apis/monitor-progress · /api-reference/scrapers/delivery-apis/download-snapshot · brightdata.com/products/web-scraper/linkedin

## 4. LangGraph human-in-the-loop (backfilled — sweep agent failed)

**Status:** confirmed (verified manually against the LangChain/LangGraph docs after the sweep agent hit the structured-output retry cap).

- **API surface:** HITL is provided as **HITL middleware** with an `interrupt_on` policy mapping tool names → approval config (`True` = interrupt with defaults, `False` = auto-approve, or an `InterruptOnConfig`). Lower-level, call the **`interrupt()`** primitive inside a node. Decisions: **approve** (run as-is), **edit** (modify args then run), **reject** (skip + synthesize a ToolMessage), **respond** (answer an ask-user tool directly).
- **Resume:** after the human decides, resume the graph with **`Command(resume=...)`** carrying the decision(s), via a stream/invoke call.
- **Persistence (required):** interrupts only work with a **checkpointer** — `InMemorySaver` for dev, **`AsyncPostgresSaver`** for prod (the Supabase Postgres). No checkpointer → no interrupt.
- **Gotchas:** (1) checkpointer is mandatory. (2) Known `deepagents` issue where **edit/reject resume can misbehave in subagents (only approve works reliably)** — test the send → approve / edit / reject path end-to-end on your pinned versions (deepagents issue #554). (3) For the PoC send gate use an explicit `interrupt_on={"send_email": True}` policy on the outreach graph.
- **Maps to the brief:** confirms §5/§6a — the `send_email` node is gated by HITL (approve/edit/reject) on the Supabase Postgres checkpointer. Brief is correct; only addition is the edit/reject resume caveat to test.
- **Docs:** https://docs.langchain.com/oss/python/langchain/human-in-the-loop
