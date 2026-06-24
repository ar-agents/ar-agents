/**
 * @ar-agents/x402 — crypto intake (rail 1) for a Sociedad Automatizada.
 *
 * Receive USDC on Base via the x402 HTTP-402 protocol. The agent charges for its
 * resources; clients pay with a gasless EIP-3009 authorization; the resource
 * server verifies the signature locally and settles on-chain via a facilitator.
 * The settled USDC feeds @ar-agents/treasury (rail 2/3: off-ramp + AFIP).
 *
 * Typical use (a Next.js route / MCP tool of the society):
 *   const receiver = new X402Receiver({ facilitator: new HostedFacilitatorClient() });
 *   const reqs = receiver.requirements({ usdc: 0.01, network: "base", payTo, resource });
 *   const header = req.headers.get("x-payment");
 *   if (!header) return json(receiver.paymentRequired({...}).body, { status: 402 });
 *   const r = await receiver.process(header, reqs);
 *   if (!r.ok) return json({ error: r.reason }, { status: 402 });
 *   // r.receipt.amountUsdc -> add to treasury; set r.headerName: r.headerValue
 */

export * from "./types";
export * from "./codec";
export * from "./verify";
export * from "./facilitator";
export * from "./receiver";
export * from "./client";
