# @ar-agents/x402

HTTP 402 agent payments protocol ([x402](https://www.x402.org)) client + seller helpers + Vercel AI SDK tools. Edge Runtime compatible, zero heavy deps. Implements the x402 v1 spec (PaymentRequirements, X-PAYMENT / X-PAYMENT-RESPONSE headers, facilitator /verify + /settle).

Wallets stay outside this package: you wire a `signer` callback (viem, the Coinbase CDP SDK, anything that can produce a signed `PaymentPayload`). Without one the package can probe prices but never spend.

## Install

```bash
pnpm add @ar-agents/x402 ai zod
```

## Buyer: pay-on-402 fetch

```ts
import { x402Fetch } from "@ar-agents/x402";

const { response, paid, settlement } = await x402Fetch(
  "https://api.example.com/premium-data",
  { method: "GET" },
  {
    // Your wallet. Receives the selected PaymentRequirements, returns a
    // signed PaymentPayload (for the "exact" scheme: EIP-3009 signature).
    signer: async (requirements) => myViemSigner.sign(requirements),
    // Optional human gate BEFORE money moves.
    onPayment: async (req) =>
      confirm(`Pay ${req.maxAmountRequired} atomic units of ${req.asset}?`),
  },
);

console.log(paid, settlement?.transaction); // true, "0x1234..."
```

Probe without paying:

```ts
import { probePaymentRequirements } from "@ar-agents/x402";
const body = await probePaymentRequirements("https://api.example.com/premium-data");
// null when free; otherwise { x402Version, error, accepts: [...] }
```

## Seller: charge for a route (Web API, Edge ready)

```ts
import {
  FacilitatorClient,
  paymentRequiredResponse,
  verifyPayment,
  settleAndRespond,
} from "@ar-agents/x402";

const facilitator = new FacilitatorClient({ baseUrl: "https://x402.org/facilitator" });

const requirements = {
  scheme: "exact",
  network: "base",
  maxAmountRequired: "10000", // atomic units (USDC has 6 decimals)
  asset: "0x...usdc",
  payTo: "0x...you",
  resource: "https://api.example.com/premium-data",
  description: "Access to premium market data",
  maxTimeoutSeconds: 60,
};

export async function GET(request: Request) {
  const result = await verifyPayment(request, requirements, facilitator);
  if (!result.verified) return result.response; // ready-made 402

  const work = Response.json({ data: "premium" });
  return settleAndRespond(result.payload, requirements, facilitator, work);
}
```

## Agent tools (Vercel AI SDK 6)

```ts
import { x402Tools, FacilitatorClient } from "@ar-agents/x402";

const tools = x402Tools({
  signer: myViemSigner,
  onPayment: async (req) => askOperator(req), // programmatic HITL gate
  facilitator: new FacilitatorClient({ baseUrl: "https://x402.org/facilitator" }),
});
// x402_get_payment_requirements, x402_paid_fetch, x402_verify_payment
```

Without a signer, `x402_paid_fetch` returns `{ ok: false, code: "unconfigured" }` instead of throwing, so the agent can explain the situation.

## Scope

- v1 of the protocol only (`x402Version: 1`).
- Scheme-agnostic: the inner `payload` of `PaymentPayload` and the `extra` of `PaymentRequirements` are passed through opaquely; the signer owns scheme knowledge ("exact" on EVM uses EIP-3009 / EIP-712).
- No wallet, no chain RPC, no key material. Ever.

See [AGENTS.md](./AGENTS.md) for tool selection guidance and landmines.

## License

MIT
