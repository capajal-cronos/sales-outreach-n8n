# Lead Generation & Outreach — Tooling Landscape

A reference for the B2B prospecting stack: the concepts (leads, prospects, buying
signals), the categories of software that exist, what each tool is for, how hard it
is to use, what it costs, and the official company-data registries you can pull from
directly.

> **Pricing note:** Figures are list prices verified around mid-2026 and are meant
> for orientation, not quoting. Most US tools price in **USD**; European tools
> (Pipedrive, KVK, registries) in **EUR**. Almost every "credit-based" tool costs
> more than its headline once data/usage is added — treat headline prices as a floor.

---

## 1. Core concepts

### Lead vs. prospect
They are not the same thing, and the distinction drives which tools you need.

| Term | Meaning | Stage |
|------|---------|-------|
| **Suspect** | Fits the rough profile but no interest shown | Raw market |
| **Lead** | A contact or company that *might* have interest — unqualified | Top of funnel |
| **Prospect** | A lead that has been **qualified**: matches your Ideal Customer Profile (ICP) and shows real potential to buy | Mid funnel |
| **Opportunity** | A prospect actively in a buying conversation | Bottom of funnel |
| **Customer** | Closed deal | Won |

The whole game is moving contacts **left → right** efficiently. Sourcing tools create
leads; enrichment + signals turn leads into qualified prospects; outreach tools work
prospects into opportunities; the CRM tracks the whole pipeline.

### ICP and buyer persona
- **ICP (Ideal Customer Profile):** the *company* you sell to best — industry, size,
  revenue, location, tech stack, maturity. Used to filter sourcing.
- **Buyer persona:** the *person* inside that company who decides — role, seniority,
  what they care about, what triggers them to act.

Good targeting is defined before any tool is touched. Tools are only as good as the
ICP/persona you point them at.

### Buying signals
A **buying signal** is an observable event or behavior suggesting a company is more
likely to buy *now* than at a random moment. They matter for two reasons: **timing**
(reach out when a need just appeared) and **relevance** (open with something specific
instead of generic).

**Company-level signals (events / firmographic):**
- **Funding round** — fresh budget, scaling, buying tools
- **Job openings / hiring** — one of the strongest *public* signals; hiring reps → needs sales tooling, hiring engineers → growth, etc.
- **Leadership change** — new VP/C-level reshuffles the tool stack in their first 90 days
- **Product launch / market or geographic expansion** — new needs appear
- **Tech-stack change** — adopted or dropped a tool you integrate with or replace
- **Financial growth or distress** — revenue/headcount jumps (expansion) or decline (cost pressure); visible in official accounts

**Person / behavior-level signals (intent):**
- **Website visits** — someone from a target company viewed pricing/product ("visitor identification")
- **Content engagement** — downloaded an asset, attended a webinar, clicked an ad
- **Third-party intent data** — aggregated signals that a company is researching your category
- **Social activity** — the contact posted or commented about a problem you solve

**Rule of thumb:** signal-based prospecting (reach out *on a trigger*) consistently
beats list-based prospecting (work a static list), because the timing and the opening
angle are handed to you.

---

## 2. The stack — what the categories are

A complete motion is five layers. Some tools do one layer well; "all-in-one" tools
blur several. Knowing the layers stops you from buying overlapping tools.

| Layer | Job | Example category |
|-------|-----|------------------|
| **1. Data / sourcing** | Find companies + contact details matching the ICP | Contact databases |
| **2. Signals / intent** | Tell you *who is worth contacting now* and why | Signal/intent platforms |
| **3. Enrichment / research** | Add depth + build the personalized angle | Enrichment + research tools |
| **4. Outreach / sending** | Sequence and send (email/LinkedIn), maximize deliverability | Sequencers / sending engines |
| **5. CRM** | Track pipeline, deals, follow-up | CRM |

---

## 3. Tool-by-tool reference

Ease-of-use is rated **Easy / Moderate / Steep** — "Steep" means powerful but a real
learning curve before it pays off.

### Layer 1 — Data / sourcing (find companies + contacts)

| Tool | What it's for | Ease | Price (approx) | Notes |
|------|---------------|------|----------------|-------|
| **Apollo.io** | All-rounder: large global contact DB + filters, **plus** built-in sequences and sending. Closest thing to a whole motion in one tool. | **Moderate–Steep** — very powerful but the UI is cluttered and overwhelming at first | Free / $49 / $79 / $119 per user/mo (annual). Generous free tier (full DB, ~250 emails/day). | Credit system is the real cost; phone numbers cost far more than emails. US-centric data, global coverage. |
| **Cognism** | Premium **European/UK** B2B data; GDPR-compliant at source; best-in-class mobile/phone numbers. | Moderate (managed onboarding) | ~£12k–25k/yr (enterprise, annual) | No credit anxiety (generous allowances). Expensive. Strong EU compliance story. |
| **ZoomInfo** | Largest US contact/firmographic DB + intent. Enterprise standard. | Steep (enterprise) | ~£15k–40k+/yr, no public pricing | Powerful, expensive, heavy contracts. Weaker on EU coverage/compliance than Cognism. |
| **Lusha** | Lightweight, self-serve contact lookup for individuals/small teams. | **Easy** | From <$500/yr, credit-based | Cheapest entry to decent data; lighter European depth. |
| **Bizzy** | **European/Benelux-focused** company DB (~21–50M EU companies — their own figures vary — sourced from official financial data) + 50+ filters + buying signals + an AI agent that learns from your accept/reject decisions. | Easy (positioned as simpler than Apollo/Clay) | Demo-gated, no public pricing | Strong fit when the target market is Europe. Pushes leads to CRM/sequencer; does **not** send for you. |
| **Hunter.io** | Narrow but excellent: find + verify email addresses by domain. | **Easy** | Free (50 credits) / $34 / $104 / $209 mo (annual) | Best for email discovery/verification; light sequencing. Cheap. Credits, not seats, drive cost. |

### Layer 2 — Signals / intent (who to contact now)

| Tool | What it's for | Ease | Price (approx) | Notes |
|------|---------------|------|----------------|-------|
| **Stairoids** | **European** real-time signal/intent platform: tracks website visits, LinkedIn engagement, job openings, competitor/influencer activity; scores intent **per company and per person** in the buying unit; AI agent flags hottest prospects. | Moderate | Demo-gated | Purpose-built for the "reach out on a trigger" motion. |
| **Bizzy** | Also surfaces signals (funding, hiring, leadership change) alongside its data. | Easy | Demo-gated | Doubles as Layer 1 + 2 for Europe. |
| **6sense / Bombora** | Enterprise third-party **intent data** — which accounts are researching your category. | Steep | Enterprise (high) | Heavy, expensive; for large GTM teams. |

### LinkedIn data (profiles, posts, companies) — acquire it the compliant way

LinkedIn is the richest source of people data and the strongest personalization hook
(recent posts), but **how** you get it decides whether it's defensible or a liability:

| Approach | Verdict |
|----------|---------|
| **Logged-out, public-data provider** — e.g. **Bright Data** Profile/Post/Company APIs | ✅ Upheld in court (Meta v. Bright Data, X v. Bright Data, 2024); no account to ban. ~$1.5/1k records, free tier ~5k/mo. |
| **Logged-in automation / session cookies / fake accounts** — most "cookie" Apify actors, older scrapers | ❌ Account bans + lawsuits — this is what got **Proxycurl** (the #1 LinkedIn data API) sued and **shut down in 2025**. |

**Hard rule:** never use a tool that asks for your LinkedIn login or session cookie —
use a provider that scrapes only logged-out public data and carries the legal burden.
**GDPR still applies regardless** — LinkedIn data is personal data of EU individuals,
so the data *user* needs a lawful basis and must honor data-subject/erasure requests,
even when the provider is certified. (Apify also offers *cookie-free* LinkedIn actors —
use only those, not the session-cookie ones.)

### Layer 3 — Enrichment / research (build the angle)

| Tool | What it's for | Ease | Price (approx) | Notes |
|------|---------------|------|----------------|-------|
| **Clay** | Orchestration engine: pulls from 100+ data providers in a "waterfall" (auto-fallback when one misses), runs AI columns for research/personalization, pushes to CRM/sequencer. The "build your own pipeline" tool. | **Steep** — spreadsheet + enrichment logic; a real learning curve before value | Free / **$185**/mo Launch / **$495**/mo Growth / Enterprise ~$30k/yr (legacy tiers $149/$349/$800 still honored for existing users) | Extremely powerful, credits burn fast, expensive at scale. Overkill unless you genuinely want to compose custom enrichment. |
| **uman.ai** | **Belgian** AI platform for complex B2B "solution selling": prospecting → **AI briefings** → personalized messaging → meeting prep → account management. Closest off-the-shelf tool to an automated research-and-personalization brief. | Easy–Moderate (guided for sellers) | Demo-gated | Built for IT/consultancy/telecom-style complex sales. Strong European/data-governance angle. |
| **Perplexity (Pro)** | Fast AI research for sector challenges, competitors, company background. | **Easy** | ~$20/mo | General-purpose research; not lead-specific but excellent for the "understand them" step. |

### Layer 4 — Outreach / sending (sequence + deliver)

> This layer is where **deliverability** lives — inbox warmup, multiple sending
> inboxes, spam-filter avoidance, bounce handling. It is a constant arms race and the
> main reason to buy rather than build at this layer.

| Tool | What it's for | Ease | Price (approx) | Notes |
|------|---------------|------|----------------|-------|
| **Instantly.ai** | All-in-one cold-email engine: unlimited sending inboxes, warmup, sequences, AI reply handling, light CRM, optional lead DB. Flat-fee. | **Easy** | From $47/mo; Hypergrowth $97/mo (25k contacts, 100k emails); lead DB add-on (SuperSearch) from ~$42/mo | Predictable flat pricing. Great value for volume cold email. |
| **Smartlead.ai** | Same category as Instantly: unlimited inboxes, warmup, sequences, unified "master inbox" for replies. Strong agency/white-label support. | Moderate | From $37–39/mo; Pro $94/mo (30k leads, 150k emails); white-label $29/client | Deliverability-focused; favorite of agencies. |
| **lemlist** | Multichannel sequencer: email **+ LinkedIn automation + cold calling**, with personalization features. Per-seat. | Easy | Email Pro $79/user/mo ($63 annual); Multichannel Expert $109 ($87 annual) | Friendly UI; headline price is ~40–60% of true cost once credits/add-ons are included. |
| **Mailshake / Woodpecker / QuickMail** | Simpler email sequencers, SMB-friendly. | Easy | ~$30–60/mo range | Solid, no-frills alternatives to Instantly/Smartlead. |
| **Reply.io** | Sequencer + built-in AI SDR assistant. | Moderate | ~$59+/user/mo | Sits between a sequencer and an AI-SDR product. |

### "All-in-one" / autonomous AI SDR (spans multiple layers)

These compress source → research → personalize → send → reply into one product. The
newest wave aims to remove the manual steps entirely.

| Tool | What it's for | Ease | Price (approx) | Notes |
|------|---------------|------|----------------|-------|
| **Apollo.io** | (See Layer 1) — genuinely covers data + sequencing + sending in one. | Moderate–Steep | Free–$119/user/mo | The pragmatic "one tool for a solo/small team" answer. |
| **Artisan (Ava), 11x (Alice), AiSDR, Salesforge (Agent Frank)** | Autonomous "AI SDR" agents that run the full loop on autopilot. **Salesforge / Agent Frank** is the most composable — it pairs with its own sending infra (Mailforge mailboxes, Infraforge dedicated infra). | Easy front-end, opaque internals | Higher / sales-led | Newest category; powerful but less control and higher cost. |

### Layer 5 — CRM (track the pipeline)

| Tool | What it's for | Ease | Price (approx) | Notes |
|------|---------------|------|----------------|-------|
| **Pipedrive** | Sales-first CRM, pipeline-centric, light and approachable. | **Easy** | Lite €14 / Growth €39 / Premium €49 / Ultimate €79 per user/mo (annual); monthly ~€24/49/79/99 | Cheapest credible sales CRM. Add-ons (LeadBooster, Campaigns, Web Visitors) raise the real cost. |
| **Close** | All-in-one SMB sales CRM with **built-in calling, SMS, and email sequences** — outbound out of the box. | **Easy** | Essentials $35 / Growth $99 / Scale $139 per user/mo (annual) | Best when you want CRM + dialer + sequences in one. Call minutes/recording add 30–50%. |
| **HubSpot Sales Hub** | Broad CRM + marketing ecosystem; scales to large orgs. | Moderate → complex as you grow | Free CRM; Starter $15–20/seat; Professional $90–100/seat **+ $1,500 onboarding**; Enterprise $150/seat + $3,500 onboarding | Sequences/automation gated at Professional. Gets expensive fast. |
| **Salesforce** | Enterprise CRM standard, infinitely customizable. | Steep | Enterprise | Overkill for small teams; heavy setup. |

---

## 4. Cheap vs. expensive — what to buy at what budget

A complete motion can cost **~€100/month** or **€40,000/year**. The difference is data
quality/compliance, scale, and how much is automated for you.

### Shoestring (≈ €60–150 / month total) — solo or small team
- **Sourcing + sending in one:** Apollo Basic ($49/user) — or Apollo **Free** to start
- **Email discovery top-up:** Hunter Free/Starter
- **Sending/deliverability (if not using Apollo's):** Instantly ($47) or Smartlead ($37)
- **CRM:** Pipedrive Lite (€14)
- → A real source → sequence → send → track loop for around €100/month.

### Mid (≈ €150–500 / month) — a working outbound team
- Apollo Professional ($79) **+** Smartlead Pro ($94) for deliverability
- **or** lemlist Multichannel ($87 annual) for email + LinkedIn
- **+** Pipedrive Growth (€39) or Close Essentials ($35)
- **+** Clay Launch ($185) *only if* you want to build custom enrichment pipelines

### Expensive (€1,000+ / month, or €12k–40k+ / year) — scale / enterprise
- **Premium European data:** Cognism (~£12k+/yr) — the choice when GDPR-compliant, mobile-accurate EU data matters
- **US enterprise data + intent:** ZoomInfo, 6sense, Bombora
- **Enterprise CRM + sequencing:** HubSpot Professional/Enterprise, Salesforce + Outreach/Salesloft
- **Heavy enrichment:** Clay Growth ($495) / Enterprise

**Takeaway:** for most small/mid teams, the cheap and mid tiers are not meaningfully
worse for *running* outbound — the expensive tier mainly buys **data depth,
compliance guarantees, and scale**, not a better day-to-day workflow.

---

## 5. Ease-of-use ranking (fastest to get value from)

The tools are not equally approachable. Two of the most powerful — **Apollo** and
**Clay** — are also the ones people most often bounce off early because the interface
and concepts are dense.

| Tier | Tools | Why |
|------|-------|-----|
| **Easiest** | Pipedrive, Hunter, Lusha, Instantly, Close, lemlist, Bizzy | Narrow scope or deliberately simple UI; productive within an hour |
| **Moderate** | Smartlead, HubSpot, Reply.io, uman | More surface area or broader feature set |
| **Steepest** | **Clay**, **Apollo**, ZoomInfo, Cognism, Salesforce, 6sense | Powerful but require real ramp-up; easy to feel lost at first |

**Practical implication:** if the priority is *getting going fast*, start in the
"Easiest" column. Reserve Clay/Apollo for when there's time to actually learn them —
their power is real but back-loaded.

---

## 6. Official company-data registries (authoritative, free or low-cost)

Commercial tools (Bizzy, Cognism, etc.) resell registry data with a markup. For
firmographics and **financial health** you can often go **direct to the official
source** — authoritative, cheap, and a genuine differentiator for a Europe-focused
motion.

> **Key distinction:** registries give you the *who they are / how healthy they are*
> layer — official identity and financials (size, revenue trend, headcount, growth or
> distress). They are **not** real-time intent signals: filings are annual and lag by
> months. Pair registries (**depth**) with signal tools (**timing**).

### Benelux — direct, detailed

| Country | Source | Access | What you get |
|---------|--------|--------|--------------|
| **Belgium** | **NBB Central Balance Sheet Office** (annual accounts) | Web-service API: *Authentic Data Query* (by enterprise number), *Authentic Data Daily Extract* (bulk ZIP datasets), *NBB.Stat*. Formats: PDF, XBRL, **JSON** (JSON for filings since Apr 2022). Developer portal with OpenAPI/Swagger; test env at `developer.uat2.cbso.nbb.be`. | Full filed **annual accounts**: revenue, equity, headcount, profit/loss trend → size, growth, and distress signals. The richest Benelux financial layer. |
| **Belgium** | **KBO/BCE** (Crossroads Bank for Enterprises) | Open data | Official identity: enterprise number, NACE activity codes, address, status, directors. Pair with NBB for full picture. |
| **Netherlands** | **KVK Handelsregister API** | Paid API: **€6.40/mo per key + €0.02/query** (search endpoint free); up to 300k queries/mo, 100/sec. **Requires a registered Dutch entity** to access the paid API. Open dataset of basic company info also published. | Registry identity (name, address, branches, activity). NL financial disclosure is thinner than Belgium's. |
| **Luxembourg** | **LBR / RCS** (Luxembourg Business Registers) | Open-data REST API; search by RCS number or name; RESA gazette retrieval; **no auth for basic reads**; basic searches free. | One of the most API-friendly registers in the EU. Company status, filings metadata, EUID. |

### Beyond Benelux — EU-wide layer (use when Benelux isn't enough)

| Source | Access | What you get / limits |
|--------|--------|------------------------|
| **BRIS** — Business Registers Interconnection System | Via the **European e-Justice Portal**; covers all EU states + Iceland, Liechtenstein, Norway. Each entity carries an **EUID**. | **Basic harmonised data only**: company name, legal form, registered seat, registration number. **No financials, ownership, or full filings.** Free for the basic set. Best for cross-border *existence/verification*. |
| **OpenCorporates** | API (global) | Largest open database of legal entities across jurisdictions. Good breadth; depth varies by country. |
| **VIES** (EU VAT) | Free EU service | Validate an EU **VAT number**; for many (not all) member states it also returns the registered name/address. Useful as a verification/dedup step. |
| **Commercial aggregators** — Creditsafe, Kyckr, Zephira, Topograph | Paid API | Re-expose many national registers (incl. RCS, RESA, financials) through **one** API with cross-jurisdiction joins — removes per-portal friction. This is the data layer some commercial prospecting tools are built on. |

**Scope recommendation:** for a Benelux-focused motion, go **direct** (NBB + KBO,
KVK, LBR) for depth and near-zero data cost. The moment coverage needs to span more of
Europe, switch to **BRIS for verification** + a **commercial aggregator** for depth,
rather than wiring up every national portal yourself.

---

## 7. Quick decision guide

- **"I just need to do outbound cheaply, today."** → Apollo (data + sending) + Pipedrive (CRM). ~€100/mo. Add Smartlead if deliverability matters.
- **"My market is European / Benelux and compliance matters."** → Bizzy or Cognism for data + Stairoids for signals; consider direct registry data (NBB/KVK/LBR) for free depth.
- **"I want deep, research-led personalization, not volume."** → uman (off-the-shelf briefings) and/or Clay (if technical) + Perplexity for research.
- **"I want it fully automated / agentic."** → Apollo, or the AI-SDR products (Artisan, 11x, AiSDR) — accept less control for less manual work.
- **"I want one tool with CRM + dialer + sequences."** → Close.

---

## Sources

- Apollo pricing — [apollo.io/pricing](https://www.apollo.io/pricing) · [breakdown](https://marketbetter.ai/blog/apollo-io-pricing-breakdown-2026/)
- Instantly vs Smartlead — [comparison](https://gigradar.io/blog/smartlead-vs-instantly) · [Instantly pricing](https://puzzleinbox.com/blog/instantly-pricing-guide)
- Clay pricing — [clay.com/pricing](https://www.clay.com/pricing) · [breakdown](https://salesmotion.io/blog/clay-pricing)
- lemlist pricing — [lemlist.com/pricing](https://www.lemlist.com/pricing) · [breakdown](https://astragtm.io/guides/lemlist-pricing-2026)
- Cognism / Lusha / ZoomInfo — [comparison](https://puzzleinbox.com/blog/apollo-vs-zoominfo-vs-cognism-vs-lusha-2026/) · [Cognism pricing](https://salesmotion.io/blog/cognism-pricing)
- Hunter.io — [hunter.io/pricing](https://hunter.io/pricing)
- Pipedrive — [costbench](https://costbench.com/software/crm/pipedrive/) · [G2](https://www.g2.com/products/pipedrive/pricing)
- HubSpot Sales Hub — [pricing guide](https://blog.hubspot.com/sales/hubspot-sales-hub-pricing)
- Close — [close.com/pricing](https://close.com/pricing)
- Bizzy — [bizzy.ai](https://bizzy.ai/)
- Stairoids — [stairoids.com/buying-signals](https://www.stairoids.com/buying-signals)
- uman — [uman.ai](https://www.uman.ai/)
- LinkedIn data (logged-out, public) — [Bright Data LinkedIn APIs](https://brightdata.com/products/web-scraper/linkedin); legal context: Meta v. Bright Data (2024, public scraping upheld) vs. Proxycurl shutdown (2025)
- NBB Central Balance Sheet Office — [web services](https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services) · [Authentic Data Query](https://www.nbb.be/en/central-balance-sheet-office/consultation/web-services/authentic-data-query)
- KVK (NL) — [developers.kvk.nl](https://developers.kvk.nl/documentation) · [billing FAQ](https://developers.kvk.nl/support/faq/billing)
- Luxembourg LBR/RCS — [e-Justice LU](https://e-justice.europa.eu/topics/registers-business-insolvency-land/business-registers-eu-countries/lu_en)
- BRIS — [European e-Justice Portal](https://e-justice.europa.eu/) · [BRIS search](https://webgate.ec.europa.eu/e-justice/searchBris.do)
