/**
 * `GET /api/x402` — a paid resource (x402 crypto intake, rail 1 of the bridge).
 *
 * No `X-PAYMENT` header  -> 402 + payment requirements.
 * Valid payment          -> 200 + the resource + the `X-PAYMENT-RESPONSE` header.
 *
 * The settled USDC (`receipt.amountUsdc`) is what you credit to the treasury
 * (@ar-agents/treasury) — persist it via your state store, then convert
 * just-in-time to ARS to pay AFIP. Degrades to 501 when X402_PAY_TO is unset.
 */

import { NextResponse } from "next/server";
import { getX402 } from "@/lib/clients";

/** Price of this resource, in USDC. */
const PRICE_USDC = 0.01;

export async function GET(req: Request) {
  const x = getX402();
  if (!x) {
    return NextResponse.json(
      { error: "x402 intake not configured. Set X402_PAY_TO (and X402_NETWORK)." },
      { status: 501 },
    );
  }

  const resource = new URL(req.url).pathname;
  const price = { usdc: PRICE_USDC, network: x.network, payTo: x.payTo, resource };

  const header = req.headers.get("x-payment");
  if (!header) {
    const { status, body } = x.receiver.paymentRequired(price);
    return NextResponse.json(body, { status });
  }

  const requirements = x.receiver.requirements(price);
  const result = await x.receiver.process(header, requirements);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 402 });
  }

  // Settled. Credit the treasury here: state.usd += result.receipt.amountUsdc
  // (persist via your KV/state store), then fund the ARS buffer just-in-time.
  return NextResponse.json(
    { ok: true, paid: result.receipt, data: "Pago recibido. Gracias." },
    { headers: { [result.headerName]: result.headerValue } },
  );
}
