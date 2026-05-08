/**
 * `POST /api/webhooks/mercadopago` — Mercado Pago webhook receiver.
 *
 * Verifies HMAC-SHA256 signature with constant-time comparison + 5-min
 * replay window via `verifyWebhookSignature` from
 * `@ar-agents/mercadopago`. Returns 401 on invalid signature, 400 on
 * malformed body, 200 on accepted.
 *
 * The handler intentionally does NOT trigger downstream side effects
 * synchronously — it dispatches via the agent loop or your queue of
 * choice. Webhook handlers must return fast (<5s) or MP retries.
 */

import { NextResponse } from "next/server";
import {
  parseWebhookEvent,
  verifyWebhookSignature,
} from "@ar-agents/mercadopago";

export async function POST(req: Request) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { error: "Webhook secret not configured." },
      { status: 503 },
    );
  }

  const xSignature = req.headers.get("x-signature") ?? "";
  const xRequestId = req.headers.get("x-request-id") ?? "";
  const url = new URL(req.url);
  const dataId = url.searchParams.get("data.id") ?? "";

  let raw: string;
  try {
    raw = await req.text();
  } catch {
    return NextResponse.json({ error: "Cannot read body." }, { status: 400 });
  }

  const valid = await verifyWebhookSignature({
    secret,
    signatureHeader: xSignature,
    requestId: xRequestId,
    dataId,
  });

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid signature." },
      { status: 401 },
    );
  }

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Body is not JSON." }, { status: 400 });
  }

  const event = parseWebhookEvent(parsedBody, url.searchParams);
  if (!event) {
    return NextResponse.json({ error: "Cannot parse event." }, { status: 400 });
  }

  // TODO: dispatch `event` to your business logic. Common patterns:
  //   - Push to a queue (Vercel Queue, SQS, etc.) and return 200 immediately.
  //   - Run the agent loop with `prompt: "Procesá este webhook: ..."`
  //     and audit the decision.

  return NextResponse.json({ ok: true, topic: event.topic, dataId: event.dataId });
}
