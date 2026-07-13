# Changelog

## 0.11.4

### Patch Changes

- Updated dependencies [[`f0bbf80`](https://github.com/ar-agents/ar-agents/commit/f0bbf804c96461f642a72e774c9207ed88e19daa), [`f0bbf80`](https://github.com/ar-agents/ar-agents/commit/f0bbf804c96461f642a72e774c9207ed88e19daa)]:
  - @ar-agents/mercadopago@0.18.7
  - @ar-agents/shipping@0.4.2

## 0.11.3

### Patch Changes

- Updated dependencies [[`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab), [`024a68f`](https://github.com/ar-agents/ar-agents/commit/024a68f968e1074f1474764c2b82fcdf6dc4ad52), [`2d9985d`](https://github.com/ar-agents/ar-agents/commit/2d9985d17894ec7dd731434a3fcbd11391b703ab)]:
  - @ar-agents/core@0.4.1
  - @ar-agents/igj@0.3.0
  - @ar-agents/mi-argentina@0.3.0

## 0.11.2

### Patch Changes

- Updated dependencies [[`21e5c38`](https://github.com/ar-agents/ar-agents/commit/21e5c389ca5355567c89c125a53749e3e22a50bf), [`ce478a3`](https://github.com/ar-agents/ar-agents/commit/ce478a3e683c0aa9605e4b73624d33d392546c8a)]:
  - @ar-agents/core@0.4.0
  - @ar-agents/identity-attest@0.9.0
  - @ar-agents/banking@0.5.4
  - @ar-agents/boletin-oficial@0.2.4
  - @ar-agents/facturacion@0.5.1
  - @ar-agents/firma-digital@0.3.3
  - @ar-agents/gde-tad@0.3.4
  - @ar-agents/identity@0.9.4
  - @ar-agents/igj@0.2.5
  - @ar-agents/mercadolibre@0.6.1
  - @ar-agents/mercadopago@0.18.6
  - @ar-agents/mi-argentina@0.2.4
  - @ar-agents/shipping@0.4.1
  - @ar-agents/whatsapp@0.6.1

## 0.11.1

### Patch Changes

- [#140](https://github.com/ar-agents/ar-agents/pull/140) [`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea) Thanks [@naza00000](https://github.com/naza00000)! - Security hardening.
  - **identity-attest**: the Auth0 id_token verification now pins the signature algorithm (`RS256`), closing the algorithm-confusion vector (consistent with the ap2 verifier).
  - **identity / firma-digital**: `node-forge` (on the signature-verification path) is constrained to `~1.4.0` (patch-only) so a consumer cannot silently resolve a regressed minor.
  - **mcp**: `@modelcontextprotocol/sdk` is constrained to `~1.29.0` (patch-only) on the transport path.

- Updated dependencies [[`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea), [`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea)]:
  - @ar-agents/facturacion@0.5.0
  - @ar-agents/mercadolibre@0.6.0
  - @ar-agents/whatsapp@0.6.0
  - @ar-agents/shipping@0.4.0
  - @ar-agents/core@0.3.1
  - @ar-agents/identity-attest@0.8.2
  - @ar-agents/identity@0.9.3
  - @ar-agents/firma-digital@0.3.2

## 0.11.0

### Minor Changes

- [#118](https://github.com/ar-agents/ar-agents/pull/118) [`9bc92a0`](https://github.com/ar-agents/ar-agents/commit/9bc92a063c15eb54aed8284180420feaf393893a) Thanks [@naza00000](https://github.com/naza00000)! - **Behavior change (default-ON):** the art. 102 governance gate is now ENFORCED BY DEFAULT in the published MCP server. A vanilla `npx @ar-agents/mcp` now REFUSES any money / fiscal / legal / irreversible / unclassifiable tool unless a human-approval hook is wired — `READ`-level tools (e.g. `validate_cuit`, `lookup_cuit_afip`, `search_payments`) always pass. The refusal is a clear MCP `isError` telling the operator to wire an `approve` hook or opt out. This is a MINOR (not a silent patch) because a server that previously executed money/fiscal/legal tools autonomously will now block them.

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

- [#128](https://github.com/ar-agents/ar-agents/pull/128) [`b1c5443`](https://github.com/ar-agents/ar-agents/commit/b1c54434ee89dc1d40c45096d34732c4f8d6dc01) Thanks [@naza00000](https://github.com/naza00000)! - **Guardrails: spending caps + amount-aware approval + a registry kill-switch.** These extend the art. 102 gate (they do not replace it).
  - **Spending caps (opt-in, amount-aware, FAIL-SAFE).** Pass `createServer({ governance: { caps: { perOpMax, dailyMax, currency, extractAmount } } })`. A MONEY tool whose amount is WITHIN the per-op + daily limits AUTO-APPROVES (so an autonomous entity can make small payments without a human on each one); anything else falls back to the human `approve` hook. Safety is built in: amount-based auto-approval REQUIRES an operator-supplied, tool-aware `caps.extractAmount` that returns the TRUE charge for each of your money tools (e.g. MercadoPago `create_payment` → `args.amount_ars`; a payment preference → `sum(items[].unit_price * quantity)`). We deliberately do NOT guess the amount from generic arg keys — a caller could add a small decoy `amount` key (stripped by the tool's schema before execution) to auto-approve a large real charge. Any doubt (no `extractAmount`, an empty caps object with no limit set, an unreadable/negative/NaN amount, or a throwing extractor) → the human approve hook. **Default behaviour is unchanged:** with no `caps`, every money tool still needs the approve hook (fail-closed); non-money tools are never affected. The running daily total uses an in-memory per-process tally by default; supply your own via `governance.tally`.

  - **`goodStandingHalt` kill-switch wired to the registry.** `createServer({ governance: { isHalted: goodStandingHalt({ entityId }) } })` makes the ar-agents registry able to REMOTELY halt this entity: once it is `suspended`/`revoked` in the registry good-standing oracle, every tool refuses. Best-effort (a transient oracle error does not halt by default; set `haltOnUnreachable: true` for a stricter posture).

  - New exports: `decideSpending`, `inMemoryTally`, `goodStandingHalt`, and the `SpendingCaps` / `SpendingTally` / `SpendingDecision` types. The boot summary line shows the active caps.

  MINOR (not patch): a server configured with `caps` + a correct `extractAmount` will auto-execute in-limit money tools that a no-caps server would have refused. Review your limits and your extractor before enabling.

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0
  - @ar-agents/banking@0.5.3
  - @ar-agents/boletin-oficial@0.2.3
  - @ar-agents/facturacion@0.4.6
  - @ar-agents/firma-digital@0.3.1
  - @ar-agents/gde-tad@0.3.3
  - @ar-agents/identity@0.9.2
  - @ar-agents/identity-attest@0.8.1
  - @ar-agents/igj@0.2.4
  - @ar-agents/mercadolibre@0.5.2
  - @ar-agents/mercadopago@0.18.5
  - @ar-agents/mi-argentina@0.2.3
  - @ar-agents/shipping@0.3.3
  - @ar-agents/whatsapp@0.5.2

## 0.10.15

### Patch Changes

- Updated dependencies [[`099abf5`](https://github.com/ar-agents/ar-agents/commit/099abf56bc19ef208a0a55e5340ec1b9b7d968ca)]:
  - @ar-agents/identity-attest@0.8.0

## 0.10.14

### Patch Changes

- Updated dependencies [[`ce7d818`](https://github.com/ar-agents/ar-agents/commit/ce7d818ef35795ce4fd83dd78abde30eed9dc00d)]:
  - @ar-agents/identity@0.9.1
  - @ar-agents/facturacion@0.4.5

## 0.10.13

### Patch Changes

- Updated dependencies [[`f200577`](https://github.com/ar-agents/ar-agents/commit/f200577ee4f1f09aab8b27055b2b12cb817884df)]:
  - @ar-agents/identity-attest@0.7.0

## 0.10.12

### Patch Changes

- Updated dependencies [[`e73be19`](https://github.com/ar-agents/ar-agents/commit/e73be1945206b3f2ebce0eed13a74ada238b6c22)]:
  - @ar-agents/mercadopago@0.18.4

## 0.10.11

### Patch Changes

- Updated dependencies [[`5c2ff8c`](https://github.com/ar-agents/ar-agents/commit/5c2ff8cc6f0063920ffb0ffe52bda86509c3baf8)]:
  - @ar-agents/identity@0.9.0
  - @ar-agents/facturacion@0.4.4

## 0.10.10

### Patch Changes

- Updated dependencies [[`043a4b1`](https://github.com/ar-agents/ar-agents/commit/043a4b1e3be9108ec71d32fe53f2bd60772a49a1)]:
  - @ar-agents/identity@0.8.3
  - @ar-agents/facturacion@0.4.3

## 0.10.9

### Patch Changes

- Updated dependencies [[`13eda70`](https://github.com/ar-agents/ar-agents/commit/13eda702825088a42ef5b9eef4b55d169129c567)]:
  - @ar-agents/identity-attest@0.6.0

## 0.10.8

### Patch Changes

- Updated dependencies [[`8f461b7`](https://github.com/ar-agents/ar-agents/commit/8f461b7d1544d16b910951b3bbb84c6ffa2be552)]:
  - @ar-agents/firma-digital@0.3.0

## 0.10.7

### Patch Changes

- Updated dependencies []:
  - @ar-agents/banking@0.5.2
  - @ar-agents/boletin-oficial@0.2.2
  - @ar-agents/facturacion@0.4.2
  - @ar-agents/firma-digital@0.2.3
  - @ar-agents/identity@0.8.2
  - @ar-agents/igj@0.2.3
  - @ar-agents/mercadopago@0.18.3

## 0.10.6

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

- Updated dependencies []:
  - @ar-agents/banking@0.5.1
  - @ar-agents/boletin-oficial@0.2.1
  - @ar-agents/facturacion@0.4.1
  - @ar-agents/firma-digital@0.2.2
  - @ar-agents/gde-tad@0.3.2
  - @ar-agents/identity@0.8.1
  - @ar-agents/identity-attest@0.5.2
  - @ar-agents/igj@0.2.2
  - @ar-agents/mercadolibre@0.5.1
  - @ar-agents/mercadopago@0.18.2
  - @ar-agents/mi-argentina@0.2.2
  - @ar-agents/shipping@0.3.2
  - @ar-agents/whatsapp@0.5.1

## 0.10.5

### Patch Changes

- Vision mega-update: package descriptions aligned to the canonical framing (open infrastructure for Argentina's sociedades de IA), em dashes removed, mcp bundles 13 packages, incorporate points to ar-agents.ar.

- Updated dependencies []:
  - @ar-agents/firma-digital@0.2.1
  - @ar-agents/gde-tad@0.3.1
  - @ar-agents/identity-attest@0.5.1
  - @ar-agents/igj@0.2.1
  - @ar-agents/mercadopago@0.18.1
  - @ar-agents/mi-argentina@0.2.1
  - @ar-agents/shipping@0.3.1

## 0.10.4

### Patch Changes

- Updated dependencies [[`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95)]:
  - @ar-agents/whatsapp@0.5.0
  - @ar-agents/facturacion@0.4.0
  - @ar-agents/banking@0.5.0
  - @ar-agents/mi-argentina@0.2.0
  - @ar-agents/identity-attest@0.5.0
  - @ar-agents/igj@0.2.0
  - @ar-agents/gde-tad@0.3.0
  - @ar-agents/firma-digital@0.2.0
  - @ar-agents/boletin-oficial@0.2.0
  - @ar-agents/mercadolibre@0.5.0
  - @ar-agents/shipping@0.3.0

## 0.10.3

### Patch Changes

- Updated dependencies [[`8c58aa0`](https://github.com/ar-agents/ar-agents/commit/8c58aa061a7579a2854ee4239ceb698c92148f28)]:
  - @ar-agents/mercadopago@0.18.0

## 0.10.2

### Patch Changes

- Updated dependencies [[`ea61bf9`](https://github.com/ar-agents/ar-agents/commit/ea61bf999e540982f6b50443c127f757c15c8d7a)]:
  - @ar-agents/identity@0.8.0
  - @ar-agents/facturacion@0.3.2

## 0.10.1

### Patch Changes

- Updated dependencies [[`2103c17`](https://github.com/ar-agents/ar-agents/commit/2103c17e89fc6f17659ece3dc0fdc9d28a05e4e7)]:
  - @ar-agents/facturacion@0.3.1

## 0.9.0

### Minor Changes

- [`dbc2332`](https://github.com/ar-agents/ar-agents/commit/dbc23325fffe9b47954ae28ba48a723083d0a884) - Add `@ar-agents/gde-tad` to the MCP bundle. The 4 gde-tad tools (`validate_igj_inscription`, `list_domicilio_inbox`, `list_mis_tramites`, `get_critical_notifications`) are exposed to every MCP host (Claude Desktop, Cursor, Continue, Cline) alongside the 11 existing subpackages. Total exposed surface: 133 tools across 12 subpackages. The doctor CLI now reports gde-tad config + always-on tools.

### Patch Changes

- Updated dependencies [[`dbc2332`](https://github.com/ar-agents/ar-agents/commit/dbc23325fffe9b47954ae28ba48a723083d0a884)]:
  - @ar-agents/gde-tad@0.2.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`4aaaecc`](https://github.com/ar-agents/ar-agents/commit/4aaaecc4bab0429f61bd034b60c0c77607562b20), [`4aaaecc`](https://github.com/ar-agents/ar-agents/commit/4aaaecc4bab0429f61bd034b60c0c77607562b20)]:
  - @ar-agents/banking@0.4.0
  - @ar-agents/facturacion@0.3.0

## 0.7.0

### Minor Changes

- [`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e) Thanks [@naza00000](https://github.com/naza00000)! - Add `doctor` CLIs to the remaining 4 packages — completes the uniform CLI surface across the toolkit.

  ```bash
  npx @ar-agents/banking doctor       # algorithm-only tools, BCRA endpoint, 11 tools
  npx @ar-agents/facturacion doctor   # AFIP cert/key/CUIT/env/PdV check + tools
  npx @ar-agents/shipping doctor      # which carriers (Andreani/OCA/Correo) are wired
  npx -y @ar-agents/mcp doctor        # which @ar-agents/* subpackages your MCP host has wired
  ```

  The `mcp doctor` is particularly useful — it shows the full subpackage status (enabled / partial / disabled) with the always-on tools per package, so a Claude Desktop / Cursor user knows exactly what their host can do without enumerating env vars.

  All 7 published `@ar-agents/*` packages with tools now ship a uniform `doctor` subcommand. Plus `mp-doctor` from earlier still works for backward compat.

### Patch Changes

- Updated dependencies [[`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e), [`e067a4a`](https://github.com/ar-agents/ar-agents/commit/e067a4a4f37e882b32fd0cbf6dfdb872f31d0e6e)]:
  - @ar-agents/identity@0.7.0
  - @ar-agents/banking@0.3.0
  - @ar-agents/facturacion@0.2.0
  - @ar-agents/shipping@0.2.0

## 0.6.2

### Patch Changes

- Updated dependencies [[`9b8e83c`](https://github.com/ar-agents/ar-agents/commit/9b8e83ce6f291a24e00101830a49afceb0102920)]:
  - @ar-agents/mercadopago@0.17.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e), [`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e), [`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e)]:
  - @ar-agents/identity@0.6.0
  - @ar-agents/mercadopago@0.17.1
  - @ar-agents/whatsapp@0.4.0
  - @ar-agents/facturacion@0.1.2
  - @ar-agents/identity-attest@0.4.2

## 0.5.1

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.17.0

## 0.4.12

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.16.0

## 0.4.11

### Patch Changes

- Add `mcpName: "io.github.ar-agents/mcp"` to `package.json` and ship `server.json` for the official MCP Registry. The `mcpName` field is the ownership-verification marker required by the registry's npm package validation. `server.json` is the registry metadata file consumed by `mcp-publisher publish`.

  This is the prerequisite for listing on https://registry.modelcontextprotocol.io. Authentication and the `mcp-publisher publish` invocation are still manual (interactive GitHub device auth), but everything else is in place: the package metadata, the registry server descriptor, and the MIT license + GitHub `repository.url` that the registry verifier expects.

  No API or runtime changes.

## 0.4.10

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

- Updated dependencies [[`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46)]:
  - @ar-agents/mercadopago@0.15.3
  - @ar-agents/identity@0.5.1
  - @ar-agents/identity-attest@0.4.2
  - @ar-agents/whatsapp@0.3.1
  - @ar-agents/banking@0.1.1
  - @ar-agents/facturacion@0.1.1
  - @ar-agents/shipping@0.1.1

## 0.4.9

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.15.0` (`requireConfirmation` opt-in HITL
  callback, webhookDedup wired, idempotency-key collision-safe encoding,
  VercelKVRateLimiter jitter + retry cap) and
  `@ar-agents/identity-attest@0.4.0` (Auth0 + Magic.link moved to subpath
  exports for true Edge-Runtime isolation).

## 0.4.8

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.14.0` (deep-audit hardening:
  browser-context guard, strict Zod on patch schemas, deterministic
  idempotency on subscriptions/preferences, HITL warnings on irreversible
  ops), `@ar-agents/whatsapp@0.3.0` (browser-context guard), and
  `@ar-agents/identity-attest@0.3.0` (Edge Runtime via Web Crypto).

## 0.4.7

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.13.0` (`VercelKVRateLimiter` for
  distributed rate limiting in serverless).

## 0.4.6

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.12.0` (idempotency-by-default) and
  `@ar-agents/whatsapp@0.2.0` (`scopedTo` mode for agent-hijacking
  prevention).
- **19 new registry tests** (`test/registries.test.ts`) covering both
  configured and unconfigured paths for every registry factory:
  identity, banking, mercadopago, whatsapp, shipping, facturacion,
  identity-attest. Honest coverage now at 74%/48%/92%/74% (was
  66%/26%/88%/66% with the previous threshold relaxation).
- Coverage thresholds raised to match the new floor: 70/45/90/70.

## 0.4.5

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.11.0` — composability + cross-LATAM + fraud scoring:
  - **Tool middleware pattern**: `withAuditLog`, `withRateLimit`, `withMetrics`, `withRetry` + `compose()`
  - **TaxID validation cross-LATAM**: AR/BR/MX/CL/CO/UY/PE
  - **`additional_info` enrichment** on `create_payment` (fraud scoring → 3-5x lower rejection rate per RG 5286/2023)
  - **VercelKVAuditLog** with day/actor/tenant indexes
  - **Migration guide** vs official `mercadopago` SDK
  - **+1 tool** (`validate_tax_id`) → 87 total
  - **284 tests pass** (was 245)

## 0.4.4

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.10.0` — compliance + DX + observability:
  - **Audit logging** with pluggable adapter
  - **Webhook idempotency dedup** to prevent double-processing
  - **Pagination helpers** (AsyncIterable) for 7 paginated endpoints
  - **Token bucket rate limiter** with adaptive learning
  - **AR issuer cuotas catalog** (10+ AR banks + federal Ahora program)
  - **OpenTelemetry instrumentation** via `/otel` subpath
  - **3DS challenge resolution** via `confirmChallengeAndPoll`
  - **+4 tools** → 86 total. **245 tests pass**.

## 0.4.3

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.9.0` — production hardening pass:
  - **Circuit breaker** with state machine + rolling window (CLOSED/OPEN/HALF_OPEN)
  - **Deadline propagation** via parent AbortSignal
  - **W3C Trace Context** (OpenTelemetry-compatible without peer dep)
  - **Replay-attack protection** on webhook signatures (5-min default)
  - **`mp_health_check` tool** for status-page polling
  - **223 unit tests + 14 property-based tests + 11 failure injection + integration tests vs MP sandbox + benchmarks**

  No surface change at the MCP level. The MCP server inherits all v0.9 hardening automatically. Tool count: 82 (was 81).

## 0.4.2

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.8.0` — Edge Runtime support (Web Crypto, no `node:crypto`), Vercel KV adapters subpath (`@ar-agents/mercadopago/vercel-kv`), HMAC webhook verify with replay-attack protection (5 min default tolerance), 8-recipe cookbook shipped in tarball, 185 tests pass.

  No surface change at the MCP level. The MCP server inherits the Edge Runtime compatibility + KV adapters automatically; tool schemas unchanged.

## 0.4.1

### Patch Changes

- Picks up `@ar-agents/mercadopago@0.7.0`. The MCP server now exposes **+25 new MP tools** (81 MP tools total) without any config changes. Highlights:
  - Customer + Card CRUD completion (4 tools)
  - Subscription/Plan/Refund/Preference extensions (5 tools)
  - Merchant Orders category (3 tools)
  - Stores + POS CRUD completion (6 tools)
  - Bank Accounts (2 tools)
  - Point Devices físicos — terminal hardware (5 tools)
  - Pure helpers: `compute_marketplace_fee`, `explain_payment_status` (2 tools)

  Total tool count across the MCP server jumped from ~95 to **~120 tools** in one install.

## 0.4.0

### Minor Changes

- MCP v0.4: ships `@ar-agents/shipping` as 7th tool registry.

  The MCP server now exposes 7 packages:
  - `@ar-agents/identity` (validate_cuit, lookup_cuit_afip)
  - `@ar-agents/identity-attest` (4 attestation tools)
  - `@ar-agents/mercadopago` (56 MP API tools, includes v0.6 account/balance/settlements/3DS/test-cards)
  - `@ar-agents/whatsapp` (6 messaging tools)
  - `@ar-agents/banking` (5 CBU/BCRA tools)
  - `@ar-agents/facturacion` (10 WSFE tools)
  - **NEW: `@ar-agents/shipping` (6 tools — Andreani/OCA/Correo)**

  Carriers auto-detect from env vars:
  - Andreani: `ANDREANI_USERNAME` + `ANDREANI_PASSWORD` + `ANDREANI_CLIENT_NUMBER` (+ `ANDREANI_ENV`)
  - OCA: `OCA_CUIT` + `OCA_OPERATIVA`
  - Correo Argentino: auto-wired (no creds needed). Set `AR_AGENTS_CORREO_DISABLED=1` to opt out.
  - `SHIPPING_DEFAULT_CARRIER` for the default when agent doesn't specify.

  Server version bumped to 0.4.0 in the MCP handshake.

## 0.3.2

### Patch Changes

- MP v0.6: account/balance + settlements + 3DS analyzer + test cards. **+6 tools (56 total)**.

  **Account / Balance / Settlements (4 tools)**:
  - `get_account_balance` — current MP wallet `{ available, unavailable, total, currency_id }`. Per-seller in marketplace setups.
  - `list_account_movements({ from?, to?, limit?, offset? })` — wallet movement log (incoming payments, refunds, holdings, transfers).
  - `list_settlements({ from?, to?, status? })` — `release_money` transfers from MP wallet → registered CBU.
  - `get_settlement(id)` — single settlement detail with bank_account info.

  **3DS analyzer (1 tool + 1 helper)**:
  - `analyze_payment_3ds(payment_id)` — fetches the Payment, derives `{ status: 'not_required'|'frictionless'|'challenge_required'|'rejected'|'unknown', mode, challengeUrl, description }`. When `challengeUrl !== null`, MUST redirect the buyer to complete authentication.
  - `analyze3DS(payment)` exported as a pure helper for callers who already have a Payment object.

  **Test cards (1 tool + helpers)**:
  - `get_test_cards` — returns the official AR (MLA) sandbox cards: VISA/Mastercard/Amex credit + debit. Each has the "magic" holder names that route to specific status_detail (APRO, OTHE, CONT, FUND, CALL, SECU, EXPI, FORM).
  - `TEST_CARDS_AR`, `TEST_PAYERS_AR`, `buildTestCardScenario(card, scenario, amount)` exported for direct use in test files.

  **132 tests pass** (was 117; +15 v0.6 tests). publint clean. attw 🟢. 24.3 KB brotli'd (within 32 KB budget).

- Updated dependencies []:
  - @ar-agents/mercadopago@0.6.0

## 0.3.1

### Patch Changes

- MP v0.5: production hardening + marketplace flows. **+9 tools (50 total)**.

  **Webhook handler combo (1 tool)**:
  - `handle_webhook` — verifies HMAC-SHA256 signature, parses the event, and (optionally) auto-fetches the underlying resource (Payment, Subscription) in ONE call. Replaces the manual chain of verify_webhook_signature + parse_webhook_event + get_payment.
  - `mercadoPagoTools({ webhookSecret })` to enable.
  - Returns `{ verified, event, resource, resource_error }`. Reject with HTTP 401 when `verified: false`.

  **OAuth Marketplace flow (3 tools + 5 helper functions)**:
  - `oauth_authorize_url` — pure function, builds the URL the seller visits to authorize your marketplace app.
  - `oauth_exchange_code` — server-side exchange of the OAuth code for an `OAuthToken` (`access_token` + `refresh_token` + `user_id` + `expires_in`).
  - `oauth_refresh_token` — refresh a per-seller token before it expires (~6h).
  - Helper functions exported: `buildAuthorizeUrl`, `exchangeCodeForToken`, `refreshAccessToken`, `expirationTimeMs`, `isExpiringSoon`.
  - `mercadoPagoTools({ oauth: { clientId, clientSecret } })` to enable.

  **Order Management API (5 tools)**:
  - `create_order`, `get_order`, `update_order`, `capture_order`, `cancel_order` — MP's modern Order API. Distinct from Preference: explicit lifecycle, manual-capture support (auth-only flows for ride-share, hotels, marketplaces), multi-payment-per-order semantics.
  - `capture_mode: "manual"` enables the auth-only flow → `capture_order(id, amount?)` later.

  **Marketplace split payments**:
  - `marketplace`, `marketplace_fee` (in ARS), `collector_id` (seller MP user_id) supported on BOTH `create_order` AND `create_payment_preference`.
  - Funds route to the seller; `marketplace_fee` is split off to the marketplace's MP account.

  117 tests pass. publint clean. attw all green. 21.6 KB brotli'd (within 32 KB budget).

  The MCP wrapper auto-picks up the new tools — `@ar-agents/mcp` patch bump.

- Updated dependencies []:
  - @ar-agents/mercadopago@0.5.0

## 0.3.0

### Minor Changes

- MCP v0.3: ships `@ar-agents/facturacion` as 6th tool registry.

  The MCP server now exposes 6 packages:
  - `@ar-agents/identity` (validate_cuit, lookup_cuit_afip)
  - `@ar-agents/identity-attest` (4 attestation tools)
  - `@ar-agents/mercadopago` (41 MP API tools)
  - `@ar-agents/whatsapp` (6 messaging tools)
  - `@ar-agents/banking` (5 CBU/BCRA tools)
  - **NEW: `@ar-agents/facturacion`** (10 WSFE tools — emitir factura, consultar último, catálogos)

  Auto-detects facturación from env: `AFIP_CUIT_REPRESENTADO` + `AFIP_CERT_PEM/PATH` + `AFIP_KEY_PEM/PATH` (same vars as identity, but the cert must be authorized for the `wsfe` service in addition).

  Tunables: `WSFE_DEFAULT_PTOVTA`, `WSFE_TIMEOUT_MS`, `WSFE_MAX_RETRIES`.

  Server version bumped to 0.3.0 in the MCP handshake.

## 0.2.0

### Minor Changes

- MCP v0.2: ships `@ar-agents/banking` as a 5th tool registry.

  The MCP server now exposes:
  - `@ar-agents/identity` (validate_cuit, lookup_cuit_afip)
  - `@ar-agents/identity-attest` (issue_attestation, verify_attestation)
  - `@ar-agents/mercadopago` (41 MP API tools)
  - `@ar-agents/whatsapp` (6 messaging tools)
  - **NEW: `@ar-agents/banking` (validate_cbu, lookup_bank_by_code, list_banks, list_psps, lookup_credit_situation)**

  Banking tools auto-wire to BCRA's public API via `BcraPublicApiAdapter`
  (no auth required). To opt out, set `AR_AGENTS_BCRA_DISABLED=1` in env.
  Tunables: `BCRA_TIMEOUT_MS` (default 30000), `BCRA_MAX_RETRIES` (default 1).

  Server version bumped from 0.1.0 → 0.2.0 in the MCP handshake.

## 0.1.3

### Patch Changes

- Identity v0.5: production robustez parity with the rest of the toolkit.

  **WSAA + WSCDC now share a hardened HTTP layer** (`fetchWithRetry`):
  - Per-request timeouts via `AbortSignal` (default 30s, override with `requestTimeoutMs`).
  - Exponential backoff on 5xx + transient network errors (default 1 retry, override with `maxRetries`).
  - SOAP-aware: HTTP 500 with a real `<Fault>` body is treated as a parseable response (not retried).
  - Optional `onCall` observability hook fires after every WSAA + WSCDC request — `{ label, durationMs, httpStatus, retried, success }` — drop-in for OpenTelemetry / Datadog / console.

  **`WsaaWscdcAdapter` accepts the new options** (`requestTimeoutMs`, `maxRetries`, `onCall`) and forwards them to both the TA refresh path and the per-CUIT lookup path.

  **`fetchWithRetry` is exported from `@ar-agents/identity/wsaa`** so multi-step flows (custom AFIP services, A4, A5, etc.) can reuse the same retry/timeout/observability stack.

  No breaking changes — existing 0.4 setups keep working with the previous (no-retry, no-timeout) defaults until you opt in.

  The MCP wrapper bumps to pull in the new identity major.

- Updated dependencies []:
  - @ar-agents/identity@0.5.0

## 0.1.2

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.4.0

## 0.1.1

### Patch Changes

- Updated dependencies []:
  - @ar-agents/mercadopago@0.3.0
  - @ar-agents/identity-attest@0.2.0

## 0.1.0

### Initial release — the MCP wrapper

One MCP server that bundles the entire `@ar-agents/*` toolkit (identity, identity-attest, mercadopago, whatsapp) into any MCP host (Claude Desktop, Cursor, Codeium, Continue, Cline, etc.). Up to **34 tools in one install**, configured entirely via env vars.

**What it does**

- Spawns as a stdio MCP server (`npx @ar-agents/mcp`).
- Auto-detects which `@ar-agents/*` packages to enable based on env vars present.
- Bridges Vercel AI SDK 6 `tool()` definitions → MCP `Tool` shape, including Zod → JSON Schema conversion (using Zod 4 native `z.toJSONSchema()`).
- Reports startup summary on stderr (which packages enabled, how many tools registered).

**Tool inventory**

| Source                            | Tools (when configured) |
| --------------------------------- | ----------------------- |
| `@ar-agents/identity` (always on) | 1-2                     |
| `@ar-agents/identity-attest`      | 5                       |
| `@ar-agents/mercadopago`          | 21                      |
| `@ar-agents/whatsapp`             | 6                       |

**Env-var configuration**

- Without any env vars: only `validate_cuit` (algorithm-only).
- Each package's tools enable independently when its env vars are set. See README for the full table.

**Quality**

- 12/12 tests pass (adapter conversions, registry env-var detection, server boot).
- 21.33 KB ESM brotli'd (under 60 KB budget).
- publint + arethetypeswrong all 🟢.
- Smoke-tested CLI binary boots and connects via stdio with both empty and full env-var setups.

**Implementation notes**

- Uses Zod 4's native `z.toJSONSchema()` (no `zod-to-json-schema` dep needed).
- MCP SDK: `@modelcontextprotocol/sdk@^1.0.0`.
- Tool name collisions across registered packages throw at startup (no silent overrides).
