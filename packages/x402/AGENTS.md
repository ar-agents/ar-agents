# `@ar-agents/x402` agent guide

This file is the runtime guide for LLM agents that have these tools
loaded. Read it once; you will not need to re-read on every call.

## What this package is

Typed tools for the **x402 protocol** (HTTP 402 agent payments,
x402.org / coinbase x402 spec v1). Buyer side: probe a paid URL's price,
then pay-and-fetch through a wallet signer the host wired in. Seller
side: verify an incoming payment via a facilitator. The wallet and all
signing stay OUTSIDE this package; without a signer you can read prices
but never spend.

## When to use which tool

| Goal | Tool | Notes |
| ---- | ---- | ----- |
| Find out what a resource costs | `x402_get_payment_requirements` | Free, safe, never signs. Always do this FIRST. |
| Actually pay and get the content | `x402_paid_fetch` | **MOVES MONEY (crypto, irreversible once settled).** Gate it. |
| Validate a buyer's payment (seller side) | `x402_verify_payment` | Off-chain check via facilitator /verify. Does NOT settle. |

WHEN NOT to use:

- Do NOT use `x402_paid_fetch` on a URL you have not probed; you would
  authorize whatever amount the server asks for.
- Do NOT use this package for fiat payments in Argentina; that is
  `@ar-agents/mercadopago` / `@ar-agents/uala`. x402 is crypto
  (USDC-style EIP-3009 tokens on Base, Avalanche, Solana, etc.).
- Do NOT use `x402_verify_payment` to settle; settlement happens in the
  seller's route handler via `settleAndRespond` (a code-level helper,
  not a tool).

## Result schemas (memorize these)

`x402_get_payment_requirements`:

```jsonc
{ "ok": true, "paymentRequired": true, "x402Version": 1,
  "error": "X-PAYMENT header is required",
  "accepts": [{
    "scheme": "exact", "network": "base-sepolia",
    "maxAmountRequired": "10000",      // atomic units, STRING
    "asset": "0x...token", "payTo": "0x...recipient",
    "resource": "https://...", "description": "...",
    "maxTimeoutSeconds": 60, "mimeType": "...?", "extra": {}
  }] }
// or { "ok": true, "paymentRequired": false, "note": "..." }
```

`x402_paid_fetch`:

```jsonc
{ "ok": true, "status": 200, "paid": true, "body": "<response text>",
  "requirements": { /* what was paid */ },
  "settlement": { "success": true, "transaction": "0x...txhash",
                  "network": "base-sepolia", "payer": "0x..." } }
// failure: { "ok": false, "code": "unconfigured" | "payment_rejected"
//            | "protocol" | "error", "reason": "..." }
```

`x402_verify_payment`:

```jsonc
{ "ok": true, "isValid": true, "payer": "0x..." }
// or { "ok": true, "isValid": false, "invalidReason": "insufficient_funds" }
// or { "ok": false, "code": "unconfigured" | "facilitator_error", ... }
```

## Constraints

- **`maxAmountRequired` is a STRING in atomic token units.** USDC has 6
  decimals, so `"10000"` = 0.01 USDC. Never present it to a user as a
  raw number without converting.
- **Payments are irreversible once settled on-chain.** There is no
  refund endpoint in the protocol.
- **The first `accepts` entry is paid by default.** Hosts can override
  selection in code (`selectRequirements`); as an agent, surface ALL
  entries from the probe and tell the user which one will be used.
- **Authorization validity windows are short** (`maxTimeoutSeconds`,
  typically 60s). Sign and submit promptly; do not probe, wait minutes,
  then pay from stale data; re-probe instead.
- **Scheme payloads are opaque here.** For the "exact" scheme on EVM the
  signer produces an EIP-3009 transferWithAuthorization signature; this
  package never inspects it.

## Confirmation gates (HITL)

`x402_paid_fetch` is the only money-moving tool. Two layers:

1. Description-based: confirm amount, asset, and payTo with the user in
   conversation before calling. This depends on you and can be bypassed
   by prompt injection.
2. Programmatic: the host can wire `x402Tools({ onPayment })`. When set,
   that callback runs BEFORE signing; if it returns false the tool
   returns `{ ok: false, reason: "Confirmation declined" }`. This is the
   real enforcement (same pattern as `@ar-agents/mercadopago`'s
   `requireConfirmation`).

Read-only tools (`x402_get_payment_requirements`, `x402_verify_payment`)
need no gate.

## Error model

All errors inherit from `X402Error` (which extends `ArAgentsError` from
`@ar-agents/core`). Tools never throw; they serialize errors into
`{ ok: false, code, reason }`:

- `unconfigured`: no signer (paid_fetch) or no facilitator (verify)
  wired. Tell the operator the integration is not set up; offer the
  probe tool, which still works.
- `payment_rejected`: the HITL gate declined, no acceptable requirement
  was selected, or the server STILL returned 402 after payment (check
  `reason` for the settlement `errorReason`, e.g. `insufficient_funds`).
- `protocol`: the server's 402 body or headers do not match the x402 v1
  schemas. The resource may not actually speak x402.
- `facilitator_error`: the facilitator returned 5xx/4xx. Retryable for
  5xx.

Spec error codes you may see inside `invalidReason` / settlement
`errorReason`: `insufficient_funds`, `invalid_scheme`, `invalid_network`,
`invalid_payload`, `invalid_exact_evm_payload_signature`,
`invalid_exact_evm_payload_authorization_valid_before` (expired), and
friends. They come from the facilitator verbatim.

## Latency expectations

| Operation | Typical | Why |
| --------- | ------- | --- |
| `x402_get_payment_requirements` | 1 RTT to the resource | Plain fetch. |
| `x402_paid_fetch` | 2 RTT + signer time | Initial 402 + paid retry; server-side settlement can add seconds (on-chain tx). |
| `x402_verify_payment` | 1 RTT to facilitator | Off-chain simulation, no tx. |

## Spec ambiguities noted (v1)

- The /verify response's `payer` field appears in spec examples but not
  in a field table; modeled as optional.
- `outputSchema` is documented optional but the reference server emits
  `null`; both are accepted and normalized to absent.
- `mimeType` and `maxTimeoutSeconds` are listed "required" in the 5.1.2
  prose header but the per-field table marks `mimeType`, `outputSchema`
  and `extra` optional; the table wins here (mimeType optional).
- The facilitator base URL is deployment-specific; the protocol does not
  fix a default. Hosts must configure `FacilitatorClient({ baseUrl })`.

## AR context

x402 is the crypto-native rail for agent-to-agent payments; in the
ar-agents stack it complements (does not replace) the fiat rails
(`mercadopago`, `uala`, `banking`). For an Argentine agent selling an
API abroad, x402 + USDC sidesteps cross-border fiat friction; for local
consumer charges, prefer the fiat packages.
