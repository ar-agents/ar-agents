---
"@ar-agents/mcp": minor
---

**Behavior change (default-ON):** the art. 102 governance gate is now ENFORCED BY DEFAULT in the published MCP server. A vanilla `npx @ar-agents/mcp` now REFUSES any money / fiscal / legal / irreversible / unclassifiable tool unless a human-approval hook is wired — `READ`-level tools (e.g. `validate_cuit`, `lookup_cuit_afip`, `search_payments`) always pass. The refusal is a clear MCP `isError` telling the operator to wire an `approve` hook or opt out. This is a MINOR (not a silent patch) because a server that previously executed money/fiscal/legal tools autonomously will now block them.

**Blast radius — read this before upgrading.** The gate is FAIL-CLOSED: the `unknown` risk class is denied by default (correct — a tool we can't classify must never move money or constitute a company silently). But classification is by NAME (plus description / sideEffects): **ANY tool whose name is not a recognized read verb is treated as `unknown` and is GATED by default-ON.** With every registry wired, that is roughly **65 of ~145 exposed tools** — and it currently includes some genuine **READ** tools whose names don't match the read-verb heuristic, e.g.:

- IGJ registry reads — `igj_get_entity`, `igj_search_entities`, `igj_get_autoridades`, `igj_get_domicilios`, `igj_get_asambleas`
- Boletín Oficial reads — `bo_search`, `bo_today`, `bo_get_norma`, `bo_list_subscriptions`
- Signature-verification reads — `firma_inspect_cert`, `firma_verify_chain`, `firma_verify_cms_signature`, `firma_is_onti_issued`
- AFIP catalog reads — `obtener_alicuotas_iva`, `obtener_tipos_comprobante`, `obtener_tipos_documento`, `obtener_tipos_concepto`, `obtener_tipos_moneda`
- Shipping reads — `trackear_envio`, `listar_sucursales`
- Plus `lookup_credit_situation`, `mp_health_check`

So a default-ON server will refuse these reads too, not only money/fiscal/legal acts. To see exactly which tools are gated in YOUR configuration, run **`ar-agents-mcp doctor`** — its GOVERNANCE section lists every exposed tool, its resolved risk level, and whether it is GATED. To let the gated reads (and any approval-level tool) run, either **wire an approve hook** via `createServer({ governance: { approve } })`, or set **`AR_AGENTS_MCP_ENFORCE=off`** for ungated passthrough (not recommended for autonomous money/fiscal/legal acts). Reclassifying these reads as `read` (so they pass while real acts stay gated) is a separate, deliberate change to the cross-package risk manifest — not done here.

The gate reuses `@ar-agents/core`'s `classifyTool` + `levelRequiresApproval` (the same risk manifest local agents use), now fed each tool's `name`, `description` **and** `sideEffects`, and is applied in the CallTool handler, by tool name, before the tool executes — so a denied money tool never touches the network. Carrying `sideEffects` closes a latent fail-OPEN: a tool with a read-ish name but a `moves money` / `irreversible` side effect is now correctly gated instead of being downgraded to `read`.

**Opt-out:** set `AR_AGENTS_MCP_ENFORCE=off` to restore the old ungated passthrough. Resolution order is `createServer({ governance: { enforce } })` option > `AR_AGENTS_MCP_ENFORCE` env > default-ON.

**Wiring HITL:** pass `createServer({ governance: { approve: (toolName, args) => boolean } })` to approve approval-level calls. The boot summary (stderr) now prints the governance mode (`enforce=ON/OFF`, halt) so self-hosters see the default.

**Kill-switch:** `AR_AGENTS_MCP_HALT=1` (or a `governance.isHalted` hook) suspends EVERY tool with a `society_suspended` error; default is no halt (behavior unchanged unless wired).

Additive API: `createServer` gains an optional `governance` arg (existing `createServer()` callers are unaffected and stay default-ON). New additive exports: `resolveGovernance`, `decideGovernance`, `describeGovernance`, and the `GovernanceOptions` / `ResolvedGovernance` / `GovernanceDecision` / `ApproveHook` / `HaltHook` / `CreateServerOptions` types. Adds `@ar-agents/core` as a direct dependency (previously transitive).
