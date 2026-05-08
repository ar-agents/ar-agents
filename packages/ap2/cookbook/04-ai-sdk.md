# 04 — Vercel AI SDK 6 integration

Drop AP2 mandate operations into any `Experimental_Agent` as Vercel AI SDK
tools. The agent can verify mandates, build receipts, and compute hashes
through normal `tool()` calls — no protocol literacy required of the LLM.

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { ap2Tools } from "@ar-agents/ap2/ai-sdk";
import { generateAp2KeyPair } from "@ar-agents/ap2";

// Wire keys at app startup.
const merchant = await generateAp2KeyPair("ES256");
const agentKeys = await generateAp2KeyPair("ES256");

const tools = ap2Tools({
  agentPublicJwk: agentKeys.publicJwk,
  merchantPublicJwk: merchant.publicJwk,
  merchantPrivateKey: merchant.privateKey,
  defaultIssuer: "merchant_1",
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools,
  stopWhen: stepCountIs(8),
});

const { text } = await agent.generate({
  prompt:
    "I'm getting a Closed Checkout Mandate from a buyer agent. " +
    "Verify it, then build a Success CheckoutReceipt for order ord_42 if valid. " +
    `Mandate: ${closedCheckoutPresentation}`,
});
```

## Tool catalog

| Tool name | Returns | Use for |
|---|---|---|
| `verify_closed_checkout_mandate` | `{ ok, sdHash, checkout, closed }` | Merchant verifying an incoming closed checkout mandate |
| `verify_closed_payment_mandate` | `{ ok, sdHash, closed }` | MPP verifying a payment mandate before authorizing |
| `verify_dsd_jwt_chain` | `{ ok, hops, openMandates, closedMandate, terminalSdHash }` | Multi-hop chain verification (TAP model) |
| `build_checkout_receipt` | `{ ok, jwt }` | Merchant signing a Success/Error CheckoutReceipt |
| `build_payment_receipt` | `{ ok, jwt }` | MPP signing a Success/Error PaymentReceipt |
| `compute_checkout_hash` | `{ ok, checkoutHash }` | Pre-signing helper or independent hash check |
| `inspect_mandate` | `{ ok, header, payload, disclosures, kbJwt }` | Debug-only decode without verification |

Each tool returns a discriminated `{ ok: true, ... } | { ok: false, code, reason }`
union so the LLM can branch on the outcome without parsing strings.

## Configuration

`ap2Tools(options)` takes:

- `agentPublicJwk`, `merchantPublicJwk`, `rootIssuerPublicJwk` — verification keys
- `merchantPrivateKey`, `mppPrivateKey` — signing keys for receipts
- `defaultIssuer` — `iss` claim for receipts, can be overridden per-call
- `descriptions` — partial map to override agent-facing descriptions

Tools that need a key but don't have one return `{ ok: false, code: "tool_misconfigured" }`
with a helpful reason. Don't catch that — let the LLM see it so it can
explain to the user that the merchant's keys aren't wired up.

## Why this is in a separate subpath

`@ar-agents/ap2/ai-sdk` re-exports `tool()` from `ai`. The `ai` package is
listed as an OPTIONAL peer dependency — install it only if you actually
use the AI SDK integration. Hosts using AP2 directly (e.g. backend
verification middleware) don't pay the bundle cost.
