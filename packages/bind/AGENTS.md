# `@ar-agents/bind` agent guide

This file is the runtime guide for LLM agents that have these tools
loaded. Read it once; you will not need to re-read on every call.

## What this package is

Typed tools for **BIND APIBANK**, the Banking-as-a-Service API of Banco
Industrial (BCRA entity 322; Banco de Valores rides the same API as 198).
This is for ACTUAL bank-account money movement: immediate interbank
transfers, DEBIN collections, echeqs, and account statements.

## When to use this vs sibling packages

| You want to...                                      | Use                       |
| ---------------------------------------------------- | ------------------------- |
| Move money from a real BANK account (CBU)            | `@ar-agents/bind` (here)  |
| Collect via DEBIN / operate echeqs                   | `@ar-agents/bind` (here)  |
| Charge cards, subscriptions, MP wallet money         | `@ar-agents/mercadopago`  |
| Payment links / payouts from a Uala Bis account      | `@ar-agents/uala`         |
| Validate a CBU/CVU checksum or BCRA bank lookups     | `@ar-agents/banking`      |

Do NOT use this package for offline CBU validation; `@ar-agents/banking`
does that without credentials or network. This package answers the
question `@ar-agents/banking` cannot: WHO owns this CBU right now,
according to the interbank network.

## When to use which tool

| Goal                                       | Tool                   | Notes                                   |
| ------------------------------------------- | ---------------------- | --------------------------------------- |
| Find my account_id (needed everywhere)     | `bind_list_accounts`   | Call first. Id format XX-X-XXXX-X-X.    |
| Reconcile / read statement                 | `bind_get_movements`   | obp paging is 1-based.                  |
| Verify a payee before paying               | `bind_get_cbu_owner`   | ALWAYS before a first-time transfer.    |
| Send money OUT                             | `bind_create_transfer` | **IRREVERSIBLE once COMPLETED.**        |
| Collect money IN (counterparty approves)   | `bind_create_debin`    | Safe: buyer must accept within expiry.  |
| Inspect electronic checks                  | `bind_get_echeqs`      | `status` filter is required.            |

## Hard constraints

- **Amounts are DECIMAL PESOS** (`10.5` = ARS 10,50), never centavos.
  Opposite convention from `@ar-agents/uala` / `@ar-agents/mercadopago`.
- **`origin_id` is the idempotency key** for transfers and DEBINes: max
  15 chars, caller-defined, re-sending an existing one returns the
  original operation. Reuse it on retries; never invent a new one for the
  same logical payment.
- **Destination is `to.cbu` (CBU or CVU) OR `to.label` (alias)**: one of
  the two, plus optional `to.cuit` (recommended by BIND for transfers).
- `expiration` on DEBIN is in minutes, max 4320 (3 days).
- Every result is a `BindResult` envelope. Check `ok` before reading
  `data`; on `ok: false` surface `message` to the user.

## Confirmation flow for transfers (mandatory ritual)

1. `bind_get_cbu_owner` on the destination.
2. Restate to the user: owner display_name + CUIT, bank, amount in ARS.
3. Get an explicit "si, transferi" (or equivalent affirmative).
4. Only then call `bind_create_transfer`.

The host may additionally wire the programmatic `requireConfirmation`
gate; if your call returns
`{ ok: false, reason: "Confirmation declined..." }`, the human rejected
it. Do not retry; report back.

## Error model

- `code: "unconfigured"`: no credentials wired. Tell the operator the
  BIND integration is not set up. No money was or can be moved.
- `code: "auth_failed"`: credentials or token rejected. Re-onboarding or
  password rotation needed; do not retry blindly.
- `code: "validation"`: your inputs were rejected locally BEFORE any
  network call (bad CBU length, missing destination, amount <= 0).
- `code: "api_error"`: BIND returned an HTTP error; `status` >= 500 is
  retryable, 4xx is not.
- `code: "network_error"`: fetch failed or timed out. Retryable.

## Endpoint provenance (verified vs designed)

Verified against BIND's public apidoc (sandbox.bind.com.ar/apidoc,
APIBank SandBox v1.7.15, fetched 2026-06-12):

- `POST /login/jwt` (`{username, password}` -> `{token, expires_in}`),
  header scheme `Authorization: JWT <token>`.
- `GET /banks/:bank_id/accounts/:view_id` (accounts list).
- `GET /banks/:bank_id/accounts/:account_id/:view_id/transactions`
  (movements, `obp_from_date` / `obp_to_date` / `obp_limit` /
  `obp_offset` headers).
- `GET /accounts/cbu/:cbu_cvu` and `GET /accounts/alias/:alias`
  (ownership lookup).
- `POST .../transaction-request-types/TRANSFER/transaction-requests`
  (body: `origin_id`, `to.{cbu,label,cuit}`, `value.{currency,amount}`,
  `concept`, `description`, `emails`).
- `POST .../transaction-request-types/DEBIN/transaction-requests`
  (body: `origin_id`, `to.{cbu,label}`, `value`, `concept`,
  `description`, `provision`, `expiration`).
- `GET .../transaction-request-types/CHECK` (echeq list, `obp_status`
  required, `obp_mode` / date / cuit filters).

Interface designed, verify against the sandbox on onboarding:

- The production base URL (BIND provides it commercially; default here
  is the sandbox `https://sandbox.bind.com.ar/v1`).
- Full enum value sets (transfer/DEBIN concept codes, currency codes,
  echeq status and mode values): the public docs gate them behind
  reference pages; pass what BIND's reference tables specify.
- Deep echeq detail fields beyond those listed in the public example
  (kept as a loose object on purpose).
- Pre-issued-token expiry: unknown for externally supplied tokens; the
  adapter assumes 1 hour and re-logs in with username/password if given.
