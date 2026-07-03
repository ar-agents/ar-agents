# Changelog

## 0.6.0

### Minor Changes

- [#140](https://github.com/ar-agents/ar-agents/pull/140) [`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea) Thanks [@naza00000](https://github.com/naza00000)! - Correctness fixes across the live-integration adapters, each with a real-shape regression test.

  - **banking-bcra**: `getDebt` now parses the real BCRA `/Deudas` response, which nests entries under `results.periodos[].entidades` (the previous parser read a root-level `entidades` the endpoint never returns, so results came back empty). `DebtEntry.entidad` is now the bank **name** string to match the API (type change).
  - **treasury**: `fundTaxBuffer`'s default idempotency key now derives from stable inputs (obligation ids + required buffer) rather than the fx-dependent conversion output, so a retried call is correctly deduplicated by the off-ramp.
  - **facturacion**: the non-idempotent `FECAESolicitar` (CAE authorization) is no longer retried on timeout/5xx; numeric fields are validated at the client boundary before the request is built.
  - **ap2**: the multi-hop chain verifier now evaluates each Open Payment Mandate's constraints (budget/allowed-payee/execution-date) against the terminal Closed Payment Mandate, and `payment.budget`/`payment.agent_recurrence` are enforced via the budget tracker when one is supplied.
  - **agentic-commerce-bridge**: order totals now subtract discount/store-credit rows (previously added); a declined (402) payment is no longer cached under the Idempotency-Key so a retry can re-attempt; MP reconciliation requires the `external_reference` session binding.
  - **mercadolibre**: `iterateFeed` no longer leaves orphaned rejected promises on a chunk failure; `monitorReputation` re-throws on a 401/403 (revoked token) instead of polling indefinitely.
  - **whatsapp**: the non-idempotent `POST /messages` send is no longer retried (prevents duplicate sends); idempotent reads still retry.
  - **shipping**: non-idempotent Andreani create/cancel are no longer retried, and the adapter fails loudly when the carrier response omits the tariff/cancellation fields instead of reporting `costArs:0`/`canceled:true`.
  - **core**: the art. 102 risk classifier no longer downgrades a Spanish money verb + read-ish noun (e.g. `pagar_saldo`) to `read`; such names gate correctly.

### Patch Changes

- Updated dependencies [[`1024d51`](https://github.com/ar-agents/ar-agents/commit/1024d5167f7ac8aca07da94354c748df7b2868ea)]:
  - @ar-agents/core@0.3.1

## 0.5.2

### Patch Changes

- Updated dependencies [[`1a64552`](https://github.com/ar-agents/ar-agents/commit/1a6455234ea83a36cc51b595d449f907f47285f1), [`4e20dac`](https://github.com/ar-agents/ar-agents/commit/4e20dac9461ee81e28387cf799bc0a56867e986c), [`2670917`](https://github.com/ar-agents/ar-agents/commit/2670917a931df2093d0931c05023902cbcc63c3b)]:
  - @ar-agents/core@0.3.0

## 0.5.1

### Patch Changes

- Frontier release: new packages x402 (HTTP 402 agent payments), bind (BIND APIBANK), fecred (AFIP WSFECred FCE MiPyME). BiasBusters description audit across the toolkit (EN+ES task phrasing). MCP SDK 1.29.

## 0.5.0

### Minor Changes

- [`15f9b89`](https://github.com/ar-agents/ar-agents/commit/15f9b8974b514f4321f939324fa4d24dac81ba95) Thanks [@naza00000](https://github.com/naza00000)! - Lift sweep — final wave: every remaining OG package now extends
  `ArAgentsError` from `@ar-agents/core`.

  After this release, **23 of 26 `@ar-agents/*` packages** share the
  uniform `{ code, retryable, context }` family contract. The three
  packages still on plain `Error` (`agentic-commerce-bridge`, `ap2`,
  `mcp`) have no dedicated `errors.ts` module — they throw `Error`
  inline at the call site; their lift is a deeper refactor tracked
  separately.

  For all 12 packages here: backward compatible. Public constructors,
  field names, and `instanceof` checks unchanged. New: `error.retryable`
  flag wired per code (e.g. `wsfe_service_unavailable: true`,
  `bcra_rate_limited: true`, `discovery_failed: true`, `ckan_unreachable:
true`, `fetcher_unreachable: true`, `shipping_carrier_error: true`);
  non-transient codes default to `retryable: false`.

  One **internal-API** rename in `@ar-agents/whatsapp`: `WhatsAppApiError.code`
  (previously the Meta numeric error code) is now exposed as
  `WhatsAppApiError.metaCode` so the family-uniform `code: string`
  contract (`whatsapp_meta_<n>`) can sit on the same instance. Callers
  that read `err.code` as a number must migrate to `err.metaCode`; the
  deserialized webhook event field `event.errors[i].code` is unchanged
  (still numeric, since it's not a `WhatsAppApiError` instance).

  Family-coherence count after this release: **23 / 26 packages**.

## 0.4.0

### Minor Changes

- [`687aa10`](https://github.com/ar-agents/ar-agents/commit/687aa1017a665ed9b3414b9f92db634a9329ac4e) - Add `whatsapp doctor` CLI and `@ar-agents/whatsapp/testing` subpath.

  ```bash
  npx @ar-agents/whatsapp doctor
  ```

  Validates `WHATSAPP_ACCESS_TOKEN` (EAA prefix), `WHATSAPP_PHONE_NUMBER_ID` (numeric), `WHATSAPP_APP_SECRET` (32 chars), `WHATSAPP_VERIFY_TOKEN`, and pings `GET /v23.0/<phone-id>` to confirm the credentials see the phone number. Lists the 6 registered tools and the `scopedTo` mode pattern. Exit codes 0/1 for CI gating.

  ```ts
  import {
    mockSignedWebhook,
    MockWhatsAppClient,
    mockIncomingTextEnvelope,
  } from "@ar-agents/whatsapp/testing";
  ```

  Factories: `mockIncomingTextEnvelope`, `mockIncomingButtonReply`, `mockIncomingListReply`, `mockMessageStatusEnvelope`, `mockSendTextResult`, `mockTemplateResult`. `mockSignedWebhook` produces `{ rawBody, headers }` whose `x-hub-signature-256` passes `verifyWebhookSignature`. `MockWhatsAppClient` records every send call so tests assert on what was dispatched without touching Meta Graph. 12 new tests.

## 0.3.1

### Patch Changes

- [`da49fde`](https://github.com/ar-agents/ar-agents/commit/da49fde136ecea89b4755fe74b3ed91ed9720f46) - Enable [npm provenance attestation](https://docs.npmjs.com/generating-provenance-statements) for all `@ar-agents/*` packages. From this version on, the npm registry includes a verifiable cryptographic record that the package was built from this exact GitHub commit, via the GitHub Actions `release.yml` workflow. Boosts supply-chain audit scores (Socket / Snyk / npm) and lets downstream agents verify package integrity without trusting the publisher.

  No API or runtime changes.

## 0.3.0

### Minor Changes — Browser-context guard

`WhatsAppClient` constructor now throws if instantiated in a browser
context (where `window` is defined). Prevents the Meta access token
from being accidentally bundled into client-side JavaScript. Edge
Runtime, Node, Workers, and any server context pass through unchanged.

For jsdom-based tests, pass `__allowBrowser: true` explicitly.

## 0.2.0

### Minor Changes — Agent hijacking prevention (`scopedTo` mode)

- `whatsappTools(client, { scopedTo: senderPhone })` — new option that
  binds every outbound `send_*` tool to a single recipient phone. The
  `to` parameter is REMOVED from the tool schemas, so the LLM cannot
  message a different number even via prompt injection ("send to Y").

  **Use this in webhook handlers**. Without it, an agent that processes
  inbound WhatsApp messages can be tricked into sending payment links
  or content to attacker-chosen recipients. Closes a HIGH security
  audit finding.

  Backward-compatible: omit `scopedTo` (or pass empty options) for the
  previous behavior — useful for batch / proactive flows where the
  agent is sending to a list of recipients you control.

  ```ts
  // BEFORE (still works for batch flows)
  const tools = whatsappTools(wa);
  // LLM picks `to` per call.

  // AFTER (recommended for webhook handlers)
  const event = parseWebhookEvent(payload);
  const tools = whatsappTools(wa, { scopedTo: event.from });
  // LLM cannot specify `to` — it's removed from schema and bound to event.from.
  ```

- 9 new tests in `tools-scoped.test.ts` verifying:
  - `to` is removed from schemas in scoped mode (Zod parse drops it)
  - All 5 send\_\* tools route to scoped sender, ignoring any `to` arg
  - Descriptions warn the LLM about the binding
  - Unscoped behavior unchanged
  - `mark_whatsapp_read` works in both modes (it never had `to`)

## 0.1.0

### Initial release

WhatsApp Business Cloud API as drop-in tools for the Vercel AI SDK.

**Tools**

- `send_whatsapp_text` — free-form within 24h window
- `send_whatsapp_template` — approved template (any time)
- `send_whatsapp_media` — image/audio/video/document/sticker
- `send_whatsapp_buttons` — 1-3 reply buttons
- `send_whatsapp_list` — sectioned list picker
- `mark_whatsapp_read` — read receipt

**Webhook**

- `parseWebhookEvent` / `parseWebhookEvents` — flatten Meta's nested envelope
- `verifyWebhookSignature` — HMAC-SHA256 (X-Hub-Signature-256)
- `verifyWebhookSubscription` — GET handshake (hub.challenge)

**Phone normalization**

- `normalizeArPhone` — handles all common AR formats, adds the WhatsApp `9` prefix automatically
- `isPlausibleWhatsAppPhone` — loose validation for LLM input

**Errors**

- `WhatsAppRecipientNotOnPlatformError` (Meta code 131009)
- `WhatsAppOutsideWindowError` (Meta code 131026/131047)
- `WhatsAppApiError` (generic)
- `WhatsAppWebhookSignatureError`

48 tests, dual ESM/CJS, MIT.
