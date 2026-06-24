# @ar-agents/x402

Crypto **intake** (rail 1 of the bridge) for an Argentine **Sociedad Automatizada**: receive USDC on Base via the [x402](https://x402.org) HTTP-402 protocol. The agent charges for its resources; clients pay with a gasless EIP-3009 authorization; the resource server verifies the signature locally and settles on-chain through a facilitator. The settled USDC feeds [`@ar-agents/treasury`](../treasury) (rail 2/3: off-ramp + AFIP).

## What it does

- **402 requirements** — `buildPaymentRequirements` / `build402Body` emit the x402 v1 `accepts` payload for a price (USDC amount → atomic units, the right USDC asset + EIP-712 domain per network).
- **Local verification** — `verifyPayment` recovers the EIP-712 signer (viem) and checks every parameter (scheme, network, asset, recipient, value, time window, signature, optional on-chain balance), each mapped to an x402 `ErrorReason`. You can verify without trusting a facilitator for the signature.
- **Facilitator settlement** — `HostedFacilitatorClient` (default = the free `x402.org` testnet facilitator on Base Sepolia; pass the CDP URL + auth for mainnet) and an `InMemoryFacilitator` (real local verify + deterministic synthetic settle with nonce replay protection) for tests/dev.
- **Receiver** — `X402Receiver` ties it together: `paymentRequired(price)` → 402, `process(header, requirements)` → decode → verify → settle → a normalized `X402Receipt` (`amountUsdc`, `payer`, `txId`) ready to credit the treasury, plus the `X-PAYMENT-RESPONSE` header to return.
- **Client signer** — `signExactPayment` (and `randomNonce`) to pay x402 resources (and to drive the receiver in tests with real signatures).

## Wire format

Models x402 **v1** (`X-PAYMENT` request header, `accepts` body, string `network` enum). The `exact` EVM scheme = EIP-3009 `transferWithAuthorization` on USDC. v2 (`@x402/*`, CAIP-2 networks + renamed headers) differs only in the envelope; the EIP-712 core in `verify.ts` is identical and reusable.

## Networks

`base` (8453, USDC `0x8335…2913`) and `base-sepolia` (84532, USDC `0x036C…CF7e`). USDC = 6 decimals.

## Example (a society's Next.js route)

```ts
import { X402Receiver, HostedFacilitatorClient } from "@ar-agents/x402";

const receiver = new X402Receiver({ facilitator: new HostedFacilitatorClient() }); // testnet
const reqs = receiver.requirements({ usdc: 0.01, network: "base-sepolia", payTo, resource: req.url });

const header = req.headers.get("x-payment");
if (!header) return Response.json(receiver.paymentRequired({ usdc: 0.01, network: "base-sepolia", payTo, resource: req.url }).body, { status: 402 });

const r = await receiver.process(header, reqs);
if (!r.ok) return Response.json({ error: r.reason }, { status: 402 });
// credit treasury: state.usd += r.receipt.amountUsdc
return new Response(payload, { headers: { [r.headerName]: r.headerValue } });
```

## Status

`0.1.0` — v1 intake: requirements, codec, local EIP-712 verification, hosted + in-memory facilitators, receiver, client signer. Unit-tested with **real** viem signatures (signer recovery proven) + every error branch + a mock facilitator. Live testnet run (Base Sepolia + Circle faucet) is the opt-in next step. Mainnet needs a CDP facilitator key. Pairs with `@ar-agents/treasury` for the full crypto→pesos→AFIP loop.
