// Demo helper — seed a mock MP payment so `complete` succeeds in the demo.
//
// In production, this route does not exist — real MP payments arrive via
// the MP webhook (which would call `bridgeMpWebhookToAgent` on this side).

import { NextRequest } from "next/server";
import { seedPayment } from "@/lib/mp";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { id = "9001", session_id, amount = 4500, currency = "ARS" } = body;
  if (!session_id) {
    return new Response(
      JSON.stringify({
        error: "session_id is required so we can set external_reference",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  seedPayment({
    id,
    status: "approved",
    currency_id: currency,
    transaction_amount: amount,
    external_reference: session_id,
  });
  return new Response(
    JSON.stringify({
      seeded: { id, session_id, amount, currency },
      next: `POST /api/acp/checkout_sessions/${session_id}/complete with credential.token=${id}`,
    }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}
