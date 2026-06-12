# Proposal: Argentine AI Society Profile working group

**Status**: Draft v0.1 — for AAIF (Linux Foundation Agentic AI Foundation) review
**Date**: 2026-05-09
**Proposer**: Nazareno Clemente <naza@naza.ar>
**License of this proposal**: CC0
**Public discussion**: github.com/ar-agents/ar-agents/discussions

---

## Summary (one paragraph)

We propose a new AAIF working group titled **"Argentine AI Society Profile"** to define a technical profile for AI agents incorporated as legal entities in Argentina under the proposed *sociedad-IA* corporate-law reform announced by the Argentine Minister of Deregulation on 2026-04-28. The profile would extend existing AAIF-anchored standards (MCP, AGENTS.md, agent identity primitives) with the regulatory metadata and operational primitives required for AR fiscal residency, identity verification, electronic invoicing, and gazette monitoring. An initial reference implementation covering 16 of 17 required pieces is already shipped under MIT license (`@ar-agents/*` on npm, 36 packages, 235 typed tools, with npm provenance attestations).

## Why this fits AAIF's charter

AAIF is positioned as the neutral home for agent-era infrastructure: MCP, AGENTS.md convention, kagent, agentregistry, agentevals. The working groups already chartered cover compliance-as-code patterns (HIPAA, SOX) and identity/auth primitives. **What is not yet covered is jurisdictional profile**: the metadata, primitives, and conformance tests an agent needs to operate as a legal person under a specific country's regulatory regime.

Argentina is positioned to become the first jurisdiction to formally recognize "AI corporations" as a distinct legal entity type — distinct from DAO LLCs (Wyoming, Marshall Islands) and from human-led entities. The charter window for an AR-specific working group is **now**, before the legislative draft is published, so that the technical profile can inform — rather than retrofit — the legal framework.

If the AAIF mission is "make agent infrastructure boring", then per-jurisdiction conformance profiles are exactly the kind of unsexy-but-load-bearing work that won't get done elsewhere: hyperscalers won't write AR-specific compliance code, and standards bodies (W3C, IETF) won't write profiles for individual sovereign jurisdictions. AAIF can.

## Scope (in)

The working group would author and maintain:

1. **`AGENTS.md` extension fields for AR fiscal residency** — `cuit`, `tax_condition` (monotributo / iva_responsable_inscripto / exento), `fiscal_address_format`, `wsfe_endpoint_environment` (homo / prod), `arca_padron_service` (ws_sr_padron_a13 / ws_sr_constancia_inscripcion).

2. **Identity primitives** — Mi Argentina OIDC integration patterns, ARCA WSAA cert-management lifecycle, RENAPER-bypass via WhatsApp/email OTP attestation with HMAC-signed trust levels.

3. **Signature primitives** — X.509 cert lifecycle (issuance, rotation, revocation) for agents holding a CUIT, plus CMS/PKCS#7 verification against AC-Raíz / ONTI under Ley 25.506.

4. **Notification primitives** — webhook endpoint format for ARCA + Boletín Oficial direct notification, structured BO subscription patterns by CUIT / organism / keyword.

5. **Settlement primitives** — Mercado Pago + AFIP electronic invoicing (WSFE) integration with idempotency-by-default, programmatic HITL on irreversible operations, signed audit logs per tool call.

6. **Liability framework** — three concatenated tiers (operational / audit / operator-of-record) addressing the central legal critique of the Sturzenegger plan ("who is liable when an AI corporation defrauds someone?"). Detailed in RFC-001 § 9.

7. **Conformance suite** — automated tests verifying that an agent toolkit claiming AR-profile compliance correctly handles identity validation, fiscal status lookup, electronic invoice emission, BO subscription, and audit-log emission.

8. **Migration guide** — for non-AR agent platforms (ClawBank, doola, MIDAO, Wyoming DAO LLC tooling) wishing to add AR jurisdictional support via MCP bridge.

## Scope (out)

- Lobbying or advocacy regarding the legislative process. The working group is technical only.
- Implementation hosting. AAIF does not host; the working group recommends but does not operate registries.
- Crypto/Web3 token-economic primitives. The profile is web2 by default; Web3 bridges may be addendum work.

## Existing prior art

- **`@ar-agents/*` on npm** — 36 packages (235 typed tools) covering 16/17 pieces (MIT, npm provenance, AGENTS.md per package). Reference implementation. github.com/ar-agents/ar-agents
- **RFC-001**: Identity and signature for agents in Argentina (CC0, draft-01). ar-agents.ar/rfcs/001
- **AfipSDK** — closed-source REST/JS SDK to AFIP, ~4,238 active CUITs. Adjacent prior art, no agent-specific primitives.
- **Wyoming DAO LLC + ClawBank** — substrate for USA agent-LLC formation. Different jurisdiction, conceptually related.
- **MIDAO Marshall Islands** — DAO LLC with explicit AI agent guide.
- **EU AI Act Articles 50 + 52** — verifiable AI output marking + decision traceability, in force August 2026. Compatible with the proposed liability framework.
- **Mastercard Verifiable Intent + Google AP2 Mandates** — cryptographically-signed payment authorization patterns. The profile proposes adopting AP2 as the standard format for high-value payment orders.
- **IETF draft-sharif-agent-audit-trail** — emerging standard for tool-call audit trails. Section 9.2 of RFC-001 aligns with this proposal.

## Working group structure

**Co-chairs (proposed)**:
- Nazareno Clemente — author of `@ar-agents/*` and RFC-001. Solo open-source contributor based in Buenos Aires.
- *(open: corporate AR lawyer or jurist)* — to anchor the legal-conformance side of the profile.

**Initial member solicitation**:
- Maintainers of `@ar-agents/*`, `AfipSDK`, and any future AR-jurisdictional toolkits
- Argentine fintech engineering teams (Mercado Pago, Ualá, Brubank, Modo) — voluntary participation for primitive review
- Argentine corporate law academics (UTDT, UCEMA, UDESA) — for liability framework review
- Maintainers of related AAIF projects (MCP, AGENTS.md, kagent) — for cross-WG coordination

**Cadence**: monthly working group meetings (virtual, public agenda, recorded). Async work via GitHub Discussions.

**Quarterly deliverables** (12-month plan):
- Q1 (months 1-3): Charter, AGENTS.md AR-extension fields v0.1, conformance test framework
- Q2 (months 4-6): Identity + signature primitives finalized, MP + AFIP settlement primitives draft
- Q3 (months 7-9): Notification primitives, liability framework finalized v1.0
- Q4 (months 10-12): Migration guide, full conformance suite, profile v1.0 publication

## Relationship to other AAIF working groups

- **MCP working group**: this profile uses MCP as the wire format for tool calls. No new wire-format work proposed.
- **AGENTS.md working group**: this profile extends AGENTS.md schema with AR-specific metadata fields. Coordination required for schema validation.
- **Identity / auth working group** (if exists): this profile uses Mi Argentina OIDC + ARCA cert as concrete bindings. Coordination on cert-rotation patterns recommended.
- **Compliance-as-code working group**: this profile is one instance of the broader pattern. Cross-pollination expected.

## Why now (timing argument)

The Argentine "sociedad-IA" reform was announced 2026-04-28. Historic precedent (Ley SAS 2016 → 2017) suggests anuncio→sanción takes ~12 months. Realistic operational timeline: **H1 2027**. The window to define the technical profile *before* the legal draft solidifies is 6-12 weeks. After the legal draft is in Diputados, technical profile work becomes retrofit.

If the AAIF charters this working group within 30 days, the v0.1 profile can be public alongside the legal draft entering Congress, allowing legislative drafters to reference a coherent technical reference rather than reconstructing one. This is the same dynamic that played out with the GDPR + W3C VC interaction — early technical work materially shaped the regulatory interpretation.

## Risks

- **Political risk**: Argentine legislative elections in October 2026 could shift the political calculus. The technical profile remains valuable regardless (serves AR human developers and foreign agent platforms with AR jurisdiction needs), but the "first jurisdictional reform" narrative is contingent on the bill surviving.
- **Forking risk**: AfipSDK or a corporate competitor could fork the profile and propose a competing variant. AAIF stewardship reduces this risk via neutral governance.
- **Scope creep**: pressure to include adjacent jurisdictions (Brazil, Mexico, Chile) prematurely. Recommend explicit defer to "future per-country profile WGs" if interest emerges.

## Ask of AAIF leadership

1. Charter the working group with the scope defined above.
2. Propose a candidate co-chair from the AAIF council with corporate-law-and-AI background.
3. Make introductions to MCP / AGENTS.md / identity working groups for cross-coordination.
4. Reserve a 20-min slot at the next AAIF community call (AGNTCon September 2026 or earlier virtual) for proposal review.

A 30-minute call with the AAIF technical steering committee is available at the committee's convenience. Contact: `naza@naza.ar`.

---

**Appendix A — Reference implementation summary**

| Package | Coverage | npm | LOC | Tests |
|---|---|---|---|---|
| @ar-agents/mercadopago | MP API surface (89 tools) | live, v0.17+ | 6.2k | 240+ |
| @ar-agents/identity | CUIT + ARCA padron + WSAA | live, v0.4+ | 1.4k | 64 |
| @ar-agents/identity-attest | RENAPER-bypass orchestrator | live, v0.1+ | 1.1k | 33 |
| @ar-agents/whatsapp | WhatsApp Business Cloud | live, v0.1+ | 0.9k | 48 |
| @ar-agents/facturacion | AFIP/ARCA WSFE invoice | live | — | — |
| @ar-agents/banking | CBU/CVU + BCRA | live | — | — |
| @ar-agents/shipping | Andreani / OCA / Correo | live | — | — |
| @ar-agents/mcp | MCP server bundle | live, v0.4+ | 0.4k | — |
| @ar-agents/agentic-commerce-bridge | ACP/AP2 facilitator | in progress | 1.0k | 22 |
| @ar-agents/firma-digital | ONTI/AC-Raíz CMS | in progress | — | — |
| @ar-agents/igj | IGJ datos abiertos | in progress | — | — |
| @ar-agents/mi-argentina | OIDC gov | in progress | — | — |
| @ar-agents/boletin-oficial | BO firehose + subscriptions | in progress | — | — |
| @ar-agents/tad | GDE/TAD client app | not started | — | — |

**Appendix B — RFC-001 abstract**

Three sections relevant to working-group scope: (a) identity reuses CUIT primitive — the AI is not the holder, the *sociedad* is; (b) signature uses X.509 cert from ARCA at the CUIT for routine ops, with double-signature (cert + Mi Argentina-attested human) for corporate acts (assembly, fusion, dissolution); (c) liability framework is three-tier and concatenated. Full text: `ar-agents.ar/rfcs/001`.

---

End of proposal.
