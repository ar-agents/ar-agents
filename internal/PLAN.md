# ar-agents — Canonical Strategy (INTERNAL, single source of truth)

Status: V2 master strategy (2026-06-30). Supersedes `docs/CAPTURE-TRANSFORMATION.md` (kept for history) and any public framing. INTERNAL ONLY.

> **PUBLIC POSTURE — HARD RULE (Naza, 2026-06-30).** The public face (ar-agents.ar, README, RFCs, any external word) is **tight-lipped, neutral, matter-of-fact, non-verbose**. It is "open infrastructure + a registry of record for automated companies that just works." NEVER public: the words *monopoly / dominate*, the capture/billions ambition, the moat mechanics, the shadow-onboarding metric, the rev-share/credit plans. The ambition lives in this file. A neutral standard earns the legal designation; a visible land-grab loses it.

## North Star (internal)
Make ar-agents the default way AI-operated entities are **born, operate, are judged, and get banked** in Argentina, and the technical spine of the global standard for AI-operated entities. Be the **registry of record + trust oracle** (the DUNS / credit-bureau of automated companies), structurally **upstream of their financial access**. Dominate the AR market and capture billions. One project, one brand: **ar-agents**.

## The law bet (Naza, 2026-06-30)
ALL-IN on the AR Ley General de Sociedades passing. We do NOT hedge against it dying as a planning constraint. AR-specific formation/UBO depth is acceptable. If the anteproyecto dies, we re-evaluate a pivot THEN (the law-independent trust/audit layer is the natural fallback, but it is not the constraint now).

## The open / closed line (resolved 2026-06-30 — keep open core)
ONE brand, two layers, clear and easy to understand:
- **OPEN (MIT) — the funnel + the neutral standard:** the `@ar-agents/*` OPERATE-rails SDKs (payments/identity/facturacion/banking/whatsapp/shipping/mcp), the RFCs + attestation formats, and the offline verifier (`arg-verify`). Open because it is the adoption funnel (agents are born + run here, feeding the Registry), because the standard must be openly verifiable to be cited as neutral by a regulator (the designation moat), and because trust-minimized verification requires the verifier + the public anchor be open. Closing this WEAKENS the monopoly.
- **CLOSED (proprietary, hosted) — the toll + the moat + the money:** the Registry (DB, good-standing scoring, history corpus), the Oracle (queryable good-standing + webhooks + the latent-demand metric), the hosted Auditor (anchoring-as-a-service, retention, metering/billing), the Formation orchestration service, the UBO/KYC layer, the central infra, the data/risk products.
- **The moat is NEVER the code.** It is: legal designation + the registry network (a portable good-standing "credit file" that is painful to abandon) + the audit/data corpus + the good-standing semantics counterparties learn to trust.
- Public line, verbatim ceiling: *"The rails are open and free, self-host forever. The registry, the good-standing oracle, and the hosted auditor are the product."*

## The one loop that ranks everything
**Entities IN the registry → at least one real counterparty QUERYING the oracle before transacting → loop proven.** UBO verification phases, data products, rev-share, and reciprocity are all DOWNSTREAM of that loop existing. Do not build downstream before the loop. Cheapest accelerant for the demand side = the **shadow-onboarding metric** (measure latent demand, use it to land the first counterparty).

## Agent-optimization (HARD principle)
Everything is built for agents to discover and consume with zero human-only steps: machine-readable APIs + JSON schemas, discovery (`/.well-known/agents.json`, `/api/discovery`), MCP tools, `agents.md` ergonomics, the Formation Pack's machine sidecar, the Oracle's programmatic surface. An agent should be able to be born, operate, and be judged on ar-agents end-to-end.

---

## Product: own the entity lifecycle (3 pillars)

### Pillar 1 — Birth: Formation + UBO
- **Formation v1:** prompt + metadata → repo/runtime (wired `@ar-agents/*` + Auditor safe defaults) + **Formation Pack** + **Registry stub** (`forming`) + **Formation Checklist**.
- **Formation Pack ("open-source bureaucracy hack"):** dual-use, human (notary/IGJ/AFIP) AND machine (LLM/agent) readable. Draft bylaws tuned for AI-operated entities, prefilled IGJ/AFIP forms, strong structured headings + a JSON/YAML sidecar mirroring the legal parameters/constraints. LEGAL GUARDRAIL: templates validated by a real lawyer; framed as drafts to review with a notary; never "legal advice."
- **Registry Garbage Collector:** auto-`stale` any `forming` entry with no audit-log or checklist progress past a threshold (~45d); reversible; visible in history. Keeps the corpus high-signal.
- **UBO primitive:** `UBOProfile` (legal name, gov ID CUIL/CUIT/passport, jurisdiction, contact) + `UBOLink` attestation (binds entityId ↔ ubo ↔ verificationMethod ↔ verifiedAt/expiresAt + our signature + public anchor). Phase 1 self-attested = build now. Phases 2/3 (Renaper/AFIP/external KYC) are REGULATED activities (data controller under Ley 25.326, possible AML obligated subject) — **legal-scope before building**. Bankable entities require ≥ a defined UBOProfile + a UBOLink at a min level.

### Pillar 2 — Metabolism: Operations + Guardrails
- **Jurisdiction-aware core** (`Jurisdiction`/`FiatRail`/`TaxProfile`(=`TaxRule`)/`RegistryProfile`(=`Registry`)), AR first impl. [SHIPPED — Sprint 1 seam in `@ar-agents/core`.]
- **Operational recipes:** high-level workflows exposed as SDK + Vercel AI SDK + MCP tools; auto-emit audit logs; use the right `TaxProfile`/`FiatRail`; respect guardrails by default.
- **Guardrails default-on (art.102 spirit)** in the public MCP + apps: spending caps, explicit approval for refunds/cancels/deletes/large transfers, kill-switch (registry state → `suspended`/`killed`). Code, not LLM instruction; logged by the Auditor. [IN PROGRESS — Sprint 4 gate built + repairing.]

### Pillar 3 — Credit & Reputation: Registry, Oracle, Auditor
- **Registry v1 (DB-backed):** states `forming`/`active`/`stale`/`suspended`/`killed`; good-standing score + dimensional breakdown + daily history; UBO status; RFC conformance; incident log. [PARTIAL — Sprint 2 KV registry + oracle shipped; harden to DB + states + GC + scoring breakdown + incidents.]
- **Auditor as first-class product:** write APIs (ops events, guardrail decisions, external signals), HMAC + Ed25519, trust-minimized OTS anchoring, billing tied to registry entities, thin edge/node/MCP clients. [SHIPPED — OTS anchoring (S1B), metering (S3); harden + bill per entity.]
- **Oracle API:** authenticated consumers (score/UBO/state/conformance/incidents, pull + webhooks) + the **shadow-onboarding latent-demand metric** (count unauth/malformed hits, hashed/aggregated, no secrets/raw payloads long-term). [PARTIAL — Sprint 2 oracle shipped; add webhooks + consumer SDK + the metric + a mock-PSP demo to prove the loop.]

## Monetization (entity-centric, friendly, scalable)
- **Free formation** (max entities born on our rails) + **Formation Pro** (pull-based upsell, never gates core formation).
- **Per-entity subscription = the core recurring business** (Auditor anchoring/retention + Registry presence/badges + guardrails/dashboards + support SLAs). Priced low enough to never stop a serious builder; scaled by volume + risk band (informational vs money-moving).
- **Rails & credit rev-share (LATER, after the loop):** be upstream of financial access; share on transaction volume, credit/lending, insurance/guarantees.
- **Data/risk products (LATER):** aggregated analytics/risk scoring once the Registry has scale + the privacy posture is solid.
- Principle: monopoly economics = owning many entities + being structurally upstream of their financial access, NOT squeezing each one.

---

## Current state (shipped this session, on `main`)
- Sprint 1 ([#114](https://github.com/ar-agents/ar-agents/pull/114)): jurisdiction seam (`@ar-agents/core`) + OpenTimestamps trust-minimized attestation.
- Sprint 2 ([#115](https://github.com/ar-agents/ar-agents/pull/115)): KV registry + good-standing oracle + certifier-with-teeth (security-hardened: 2 critical + 2 high closed pre-merge).
- Sprint 3 ([#116](https://github.com/ar-agents/ar-agents/pull/116)): billable metering.
- Site reframe ([#117](https://github.com/ar-agents/ar-agents/pull/117)): home for the day-1 crypto-native buyer + recurring product.
- Sprint 4: art.102 gate default-on in public `@ar-agents/mcp` — built + verifying (repair in flight).

## Remaining backlog (ranked behind the loop; refined by the V2 gap-analysis)
1. Finish Sprint 4 (gate repair + PR).
2. Shadow-onboarding metric (cheap; manufactures the demand-side pitch).
3. Registry hardening (DB + states + GC + good-standing scoring breakdown + incident log).
4. Formation v1 + Formation Pack (the birth wedge) + Registry stub + Checklist.
5. UBO primitive (schema + self-attested; defer regulated phases pending legal scoping).
6. Oracle webhooks + authenticated-consumer SDK + mock-PSP demo (prove the loop).
7. Public front-end: strip to neutral / tight-lipped / agent-optimized; sharpen agent surfaces.
8. Sprint 5: RFC-003 reciprocity (AR + 1 jurisdiction).

## How agents (Claude sessions) use this plan
This is the canonical strategy. Allegiance to the North Star, not the literal text. Critically evaluate; flag technical/legal risks; surface major shifts before executing; reconcile reality back INTO this file (keep it the single source of truth). Public outputs stay neutral + minimal; the ambition stays internal.
