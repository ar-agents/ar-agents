# `@ar-agents/uala` — agent guide

This file is the runtime guide for LLM agents that have these tools
loaded. Read it once; you will not need to re-read on every call.

## What this package is

Typed tools for **Ualá Bis** (the merchant-facing API of Ualá, the
Argentine fintech). Drops into Vercel AI SDK 6+ as a tool collection.
Adapter pattern: real network adapter (`UalaApiAdapter`) when configured,
throwing default (`UnconfiguredUalaAdapter`) otherwise.

## When to use which tool

| Goal                                     | Tool                            | Notes                                  |
| ---------------------------------------- | ------------------------------- | -------------------------------------- |
| Bill a customer who is NOT in front of me | `uala_create_payment_link`      | Returns shareUrl + optional QR.        |
| Check if a link was paid                 | `uala_get_payment_link`         | Poll only if no webhook wired.         |
| Revoke an open link                      | `uala_cancel_payment_link`      | Irreversible. Idempotent.              |
| Reconcile incoming money                 | `uala_list_transactions`        | Paginate via `cursor`.                 |
| Inspect a specific transaction           | `uala_get_transaction`          | Use when listing trimmed details.      |
| Pre-flight before a payout               | `uala_get_balance`              | Confirm funds available.               |
| Move money OUT                           | `uala_create_payout`            | **IRREVERSIBLE on `paid`.** Gate it.   |
| Track a payout                           | `uala_get_payout`               | Poll until status resolves.            |

## Constraints

- **All amounts are in centavos for ARS / cents for USD.** A payment of
  ARS 1.000 is `amount: 100000`. Never pass a float.
- **CBU is 22 digits exactly.** The adapter rejects anything else with
  `UalaValidationError` BEFORE hitting the network.
- **`idempotencyKey` is honored for `create_payment_link` and
  `create_payout`.** Reposting with the same key + same payload returns
  the original resource. Use a UUID per logical operation; reuse on
  retries.
- **Currency defaults to ARS** everywhere. Pass `currency: "USD"`
  explicitly for USD operations. Cross-currency conversion is NOT
  handled here.

## Confirmation gates (HITL)

Wrap these tools with a human-in-the-loop confirmation in the host UI:

- `uala_create_payout` — moves money OUT. **Always confirm.**
- `uala_cancel_payment_link` — irreversible. Confirm if the link has a
  pending payer.

Read-only tools (`get_*`, `list_*`, `get_balance`) do not need a
confirmation gate.

## Error model

All errors inherit from `UalaError`. Specific cases:

- `UalaUnconfiguredError` — the host wired the unconfigured default
  adapter. Surface to the operator: "Ualá integration is not set up."
- `UalaAuthError` — the API key was rejected. Likely revoked / expired
  / wrong environment. Do NOT retry blindly.
- `UalaApiError` — non-2xx from Ualá. `.status` and `.details` carry the
  raw response. Retry only on 5xx after backoff.
- `UalaValidationError` — input failed local validation. The agent
  passed bad data; do NOT retry the same call.

## Latency expectations (at p50, fair-weather)

| Op                          | p50 latency |
| --------------------------- | ----------- |
| `create_payment_link`       | ~250 ms     |
| `get_payment_link`          | ~120 ms     |
| `list_transactions`         | ~300 ms     |
| `get_balance`               | ~120 ms     |
| `create_payout`             | ~400 ms     |
| `get_payout`                | ~120 ms     |

The adapter enforces a 10-second hard timeout per request via
`AbortController`. A timed-out call surfaces as a `UalaApiError`-like
network rejection.

## What this package does NOT do

- **No webhook receiver.** Ualá webhooks land on YOUR endpoint, not on
  this library. Verify with Ualá's documented signature scheme on your
  side (the Vultur webhook aggregator handles this if you use it).
- **No marketplace transaction ledger / persistence.** This library is
  stateless; persist transactions in your own DB if you need history
  beyond what Ualá retains.
- **No FX conversion.** ARS↔USD conversion is the operator's
  responsibility.
- **No 3DS or KYC flows.** Ualá owns those on its side.

## AR context (for non-AR agents)

Ualá Bis is the merchant-facing product of Ualá. It is one of the four
main payment acceptance rails for Argentine SMBs (alongside Mercado
Pago, Modo, and traditional Issuer POS). It pays out to CBU; it does
not offer multi-currency settlement. Most amounts you will handle are
in ARS centavos. Do not assume USD unless the operator explicitly says
so.
