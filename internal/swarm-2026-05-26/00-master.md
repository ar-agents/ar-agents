# Master synthesis — ar-agents swarm output (2026-05-26)

13 agents (8 research + 5 code). What follows is what they collectively converged on. Individual reports are in sibling files.

## The 5 things that matter most

### 1. The bill enters Congress in June. ~10–20 day window to dominate the narrative.

Sturzenegger's Sociedades-IA bill was announced 28-abr-2026 and is in drafting now. Multiple sources confirm it lands in Congress in June. The press window for "this is the open infra the law requires" is *closing*. Every press piece, RFC publication, working-group announcement, and gov DM should ship before the bill text drops — once it does, the conversation shifts from "what should the technical layer look like" to "what does the actual bill require," and the early-mover advantage compresses.

### 2. Roomix → Rauch is the single highest-EV outreach action in the building.

Nacho Gorriti, 24, Mar del Plata, closed a $500K pre-seed on 2026-05-24 led by Guillermo Rauch with Adam D'Angelo (OpenAI/Quora) and Charlie Songhurst (ex-Meta board) participating. AR-tech is a small graph. A single friend-of-friend chain reaches Gorriti, who can forward `ar-agents.ar` to Rauch with one line. Rauch is born-in-Lanús, runs Vercel ($340M ARR, 30% from AI agents per Feb 2026 data, IPO-ready), and ar-agents lives entirely on his stack. A retweet at his scale = step-change in everything downstream. Naza-action; cannot be delegated.

### 3. The hero curl on vultur.ar is fiction. This kills B2B credibility.

The landing's hero shows `curl -X POST https://api.vultur.ar/v1/facturas -H "Authorization: Bearer $VULTUR_API_KEY"`. DNS for api.vultur.ar doesn't resolve. There's no `/api/v1/*` route in the Next.js app. There's no `ApiKey` Prisma model. No key-issuance UI. No `VULTUR_API_KEY` documented anywhere. The only customer-controllable surface is MCP at `/api/mcp/[slug]` and that route stubs the tool execution. The first paying B2B customer (the Vultur audit walked through a concrete persona, "Mariano, CTO of Glosa.app") churns in 45 minutes when he tries the hero curl. This is the biggest fix on the entire roadmap.

### 4. Three webhook HMAC verifiers compare with `===` instead of `timingSafeEqual`. Two-hour security fix.

MercadoPago verifier (`packages/billing/src/mercadopago.ts:129`) uses `computed === v1`. Generic relay HMAC (`apps/web/src/lib/webhooks/relay.ts:96`) same. No `ts` freshness check on MP webhooks even though the signed manifest already includes `ts`. Sandbox-mode escape hatch (`mercadopago.ts:108-110`) accepts unsigned webhooks in any non-production env — preview deploys are public, so trivial fake-payment injection. PEM-prefix leak in `packages/identity/src/wsaa.ts:200,209` (`startsWith=${keyPem.slice(0,30)}`) shows cert metadata in error messages. None of these are theoretical; all are exploitable today.

### 5. mercadopago is best-in-class agent DX. The other 18 packages lag behind a shared `@ar-agents/core` that doesn't exist yet.

mercadopago has middleware composition (`compose(withMetrics, withRateLimit, withAuditLog)`), OpenTelemetry hooks, an idempotency story, a CLI doctor, 30 cookbook recipes, typed errors. It's better than Stripe's agent-toolkit on agent-ergonomics. The other 18 packages are weak imitators of itself: identity has a doctor and good docs but no middleware; uala v0.2 has InMemoryAdapter but no OTel; iva-percepciones/sicore have neither. Lifting the shared primitives to `@ar-agents/core` is ~2 weeks of work that elevates 17 packages overnight. Zero new code per package — just import the shared primitives.

## The 7-track plan (priority-ordered)

| # | Track | Owner | Lead time | First action |
|---|---|---|---|---|
| 1 | **Vultur HTTP customer API + ApiKey table** | Claude can build, Naza approves shape | 2–3 weeks | Schema + 1 endpoint this week, full surface ships in 2 |
| 2 | **Security fixes** (webhook HMAC, PEM leak, pricing) | Claude (no-brainer) | Same day | Already in flight (see below) |
| 3 | **@ar-agents/wscdc, iva-retenciones, modo, tienda-nube, suss** (the killer 5 missing packages) | Claude | 2–4 weeks total | wscdc + iva-retenciones today (S effort each), tienda-nube + modo this week, suss as v0.1 next |
| 4 | **@ar-agents/core shared primitives** (errors, OTel, middleware, withApproval HITL) | Claude | 2 weeks | Pilot on identity (lift mercadopago's otel.ts + middleware.ts) |
| 5 | **Outreach Wave 2 (already drafted) + new top-10 from swarm** | Naza | 1 week to send all | Roomix→Rauch warm intro is #1 (urgent), Barbieri/Simonelli/Mindlin/Sosa/Rabinovich are top-5 within AR |
| 6 | **Press push: Dergarabedian + Latent Space + Davidovsky + De Toma + RoW Dib + Cavalié** | Naza | 4 weeks rolling | Pitches in week 1, first publish target end of week 2 |
| 7 | **Working-group letter (Vía Libre + CETyS + Fundar)** | Naza | EOD Wed May 27 | Per playbook agent: this is the single highest-leverage move this week — buys civil-society legitimacy that hedges Risks 3 & 5 |

## Outreach top-30 distilled (S-tier only)

### Global agent-ecosystem
1. **Justin Spahr-Summers** (MCP co-creator, Anthropic) — `jspahrsummers` X DM + MCP Registry GH discussion
2. **David Soria Parra** (MCP co-creator, Anthropic) — `dsp_` X DM
3. **Malte Ubl** (Vercel CTO) — `cramforce` X DM, email known to reply
4. **Lee Robinson** (Vercel VP DevRel) — `leeerob` X DM
5. **Boris Cherny** (Claude Code lead, Anthropic) — `bcherny` X DM

### AR fintech + commerce
6. **Pierpaolo Barbieri** (Ualá CEO) — `pbarbieri` X DM, already in Wave 2 drafts
7. **Romina Simonelli** (Ualá VP + Cámara Fintech 1st VP 2026–28) — LinkedIn via Cámara Fintech
8. **Paula Arregui** (MercadoPago COO + Cámara Fintech secretary) — LinkedIn via Cámara
9. **Daniel Rabinovich** (MercadoLibre CTO/COO) — built Verdi; needs ar-agents
10. **Tomás Mindlin** (Tapi CEO) — `tomasmindlin` X, just won EY Entrepreneur 2026
11. **Gastón Irigoyen** (Pomelo CEO) — `gastonirigoyen` X, Kaszek-backed
12. **Martín Migoya** (Globant CEO) — pitch via Endeavor AR
13. **Santiago Sosa** (Tienda Nube CEO) — `santiagomsosa` X
14. **Sebastián Barrios** (ex-MELI now Roblox SVP Eng) — public quote anchor

### Press
15. **swyx + Alessio Fanelli** (Latent Space) — A1 pitch, 60-min episode
16. **César Dergarabedian** (iProfesional Editor Tecnología) — already covered the law
17. **Sebastián Davidovsky** (La Nación, author *Engaños Digitales*) — A3 angle
18. **Daniela Dib** (Rest of World LATAM reporter) — A2 fit
19. **Jack Clark** (Import AI / Anthropic Head of Policy) — counter-thesis angle (AR chose deregulation)

### Strategic acquirers (not for outreach today — moat-design intel)
20. **Vercel (Rauch)** — cleanest cultural + technical fit, $5-40M acqui-hire range
21. **Stripe** — Bridge precedent shows they'll buy infra; LATAM thesis live
22. **MELI** — defensive acquisition surface

### Engineering community
23. **Goncy** (`@goncy`, Vercel SE) — single highest-leverage AR evangelist
24. **Belén Curcio** (`@okbel`, Vercel Director Solutions) — internal Vercel sponsor
25. **Iván Alemuñoz** (AfipSDK maintainer) — 4-language audience overlap; cross-link asset
26. **Federico Carrone** (LambdaClass) — Rust BA + BeamBA host, two communities
27. **Lautaro Gesuelli + Lucas Petralli** (LLM Native BA + LangChain Ambassador LATAM)
28. **Francisco Ingham** (Pampa Labs / LangChain) — YouTube tutorial pipeline
29. **Matías Woloski** (Auth0 founder) — legitimacy quote anchor
30. **Ariel Jolo** (Sysarmy + Nerdearla) — owns AR-tech-community convening function

## Gov-track strategy (different from outreach)

The swarm converged on: **stop cold-pitching ministers; build legitimacy from three layers below them.**

- Week 1–2: **Juan Gustavo Corvalán** (UBA IALAB) — guest lecture + co-authored postgrado. Single highest-ROI academic move.
- Week 2–4: **César Gazzo Huck** (Subsec TIC, JGM), **Sergio Blanco** (ARCA Sistemas), **Héctor Huici** (Subsec Desregulación). Technical RFC engagement, not pitch. Three technocrats quietly nodding "this is real" beats one minister DM.
- Week 3–5: **Diego Fernández** (GCBA Innovación, AI District microcentro). CABA moves without national. Vultur as inaugural OSS resident.
- Week 4–6: **Cámara Argentina Fintech** (Biocca) + **Polo IT BA** (Roa) industry-association badges.
- Week 5–7: **Sturzenegger re-approach via Reidel** (intellectual peer DM, not pitch).

Hard rule: never frame ar-agents as "Sturzenegger's project." Always "Argentine open-source community's project Sturzenegger has endorsed." Hedges the Karina Milei / Bullrich-orbit risks.

## Code roadmap — the killer 5 + core lift

| Package / change | Effort | Why now |
|---|---|---|
| **`@ar-agents/wscdc`** | S (3 days) | Validate factura authenticity via AFIP WSCDC. Every AP-automation agent needs this. Reuses existing WSAA infra. |
| **`@ar-agents/iva-retenciones`** | S (3 days) | Symmetric to iva-percepciones. Closes federal-tax-retention surface. |
| **`@ar-agents/tienda-nube`** | M (1–2 wk) | The #2 e-commerce platform in AR. 100k+ AR merchants. No competitor SDK. |
| **`@ar-agents/modo`** | M (2 wk) | The 4th payment rail (covered in AGENTS.md but not shipped). MODO is bank-consortium PSP rivaling MP. |
| **`@ar-agents/suss`** | L (3–4 wk for v0.1) | Payroll F.931/SICOSS. No agent-friendly AR payroll lib exists today. Huge demand. |
| **`@ar-agents/core`** (lift mercadopago primitives) | M (2 wk) | Shared error base + OTel + middleware + withApproval HITL. Elevates 17 packages overnight. |
| **outputSchema on every tool** | S (codemod, 1 wk) | Free type-safety + partial-streaming unlock. Today 0/175 tools declare outputSchema. |
| **InMemoryAdapter on every package** | S (1 wk parallel) | uala v0.2 pattern. Devs can't integration-test without real creds otherwise. |
| **AFIP WSMTXCA + WSFEXv1** | M (1 wk each) | pyafipws covers; we don't. WSMTXCA = item-detail (retail). WSFEXv1 = real export (Bridge currently misroutes via WSFE). |

## Vultur punch list (top 5 from B2B audit)

1. **Ship `POST /api/v1/facturas` + ApiKey table + ratelimit-per-key** (2 wk) — fixes the deal-breaker
2. **Fix 0.5% / 0.8% pricing divergence** in 6 places (2 hr)
3. **Move AFIP cert paste into onboarding stepper, block stepper-green until real** (2 day)
4. **Enforce plan quotas on createSociety + emitFactura** (1 day)
5. **Bind Platform → Subscription** ($399 Platform tier charges nothing today) (3 day)

## Security punch list (top 5 from threat audit)

1. **`timingSafeEqual` on MP + relay HMAC verifiers** (2 hr) — RED, exploitable today
2. **Block `VULTUR_MODE!=production` webhook fallback** (30 min) — preview deploys are public
3. **Strip PEM-prefix leak from wsaa.ts errors** (30 min)
4. **Add second human to CODEOWNERS** (5 min) — kills "self-merge is review" theater
5. **Register `@ar-agent` / `@ar.agents` / `@ar_agents` defensive npm squats** (1 hr)

## Moat design (12-month posture)

**Where the moat is thin today** (honest from acquirer agent):
- Single-maintainer bus factor → any DD exposes immediately
- No exclusive partnership with any agent-platform major
- Revenue is rounding error → all acquisition math is strategic premium

**12-month builds:**
1. **Regulatory capture** — get named in a Sociedades-IA implementing regulation as one of the "compatible implementations." One sentence in a Resolución = 5-year de-facto status.
2. **Data moat** — anonymized AR-agent regulatory dashboards at ar-agents.ar/observatory. The corpus is uncloneable.
3. **Lock-in via Vultur** — signed audit log timestamping with ARCA integration so logs become legal evidence. Migration cost an acquirer values 5–10x what it cost to ship.
4. **Brand moat** — ship the manifesto + RFC track so aggressively that ar-agents becomes the de-facto Standards Org. De-facto-ness is uncloneable once cemented in regulator minds.

**The terminal scenario:** Stripe announces "Stripe Agents for Argentina" with full AR/MX/BR compliance + Vercel partnership + $50M LATAM dev fund. Could ship in 6 months with $10M budget. Counter: regulatory capture (Stripe can't get ARCA-endorsed in 6 months if you're the named reference), data moat (Stripe starts at zero corpus), and Argentina-built vs SF-built in a Milei-Thiel nationalism climate.

## What I'm starting RIGHT NOW (no Naza input needed)

In parallel, while Naza decides on the outreach lanes:
1. Webhook HMAC `timingSafeEqual` fixes (3 files, 2 hours)
2. PEM error leak strip (2 lines, 5 min)
3. Vultur pricing 0.5% / 0.8% divergence fix (6 files, 30 min)
4. Defensive npm squats `@ar-agent` / `@ar.agents` / `@ar_agents` (1 hour)
5. `@ar-agents/wscdc` v0.1 scaffold (3 days; this is the highest-value gap and is mechanical to ship)

## What needs Naza's decision

- **Outreach lane:** Which two to push hard this week? My recommendation: (a) Roomix→Rauch warm intro [global], (b) Working-group letter to Vía Libre + CETyS [legitimacy hedge].
- **Press lane:** Pitch all five (Dergarabedian, swyx, Davidovsky, De Toma, Dib) or sequence? My recommendation: Dergarabedian + swyx this week (highest fit), others next.
- **Build lane:** Build wscdc + iva-retenciones (both S, ship this week) THEN tienda-nube or modo? My recommendation: wscdc first (validates buy-side), iva-retenciones immediately (symmetric quick win), modo after (opens bank rail).
- **Vultur lane:** Ship the customer HTTP API now or wait until after first paying conversation? My recommendation: ship now. The hero-curl-fiction is killing inbound conversions.
