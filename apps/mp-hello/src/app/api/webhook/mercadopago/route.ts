import { NextRequest, NextResponse } from "next/server";
import { parseWebhookEvent, verifyWebhookSignature } from "@ar-agents/mercadopago";
import { getMpClient, getMpState } from "@/lib/agent";
import { bodySizeGuard, withApiHeaders } from "@/lib/security";

export const runtime = "nodejs";

/**
 * Production MP webhook with HMAC-SHA256 signature verification.
 *
 * # Setup
 *
 * In MP dev panel → Webhook Notifications:
 * - URL: https://your-deployment.vercel.app/api/webhook/mercadopago
 * - Generate a secret and set it as `MP_WEBHOOK_SECRET` in Vercel env.
 * - Subscribe to `preapproval` (subscription) topic.
 *
 * # Auth model
 *
 * Signature verification IS the auth. MP signs each webhook with HMAC-SHA256
 * using the configured secret. The lib's `verifyWebhookSignature` also
 * enforces a 5-minute replay-tolerance window (rejects ts older than that)
 * and uses constant-time comparison.
 *
 * Without `MP_WEBHOOK_SECRET`, requests are rejected in production. In dev
 * (no secret), the webhook proceeds with a loud console warning so demos
 * still work.
 */
export async function POST(req: NextRequest) {
  // MP webhook payloads are typically <4 KB; 256 KB is generous.
  const oversized = bodySizeGuard(req, 262_144);
  if (oversized) return withApiHeaders(oversized);

  const url = new URL(req.url);
  const rawBody = await req.text();
  let body: unknown;
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return withApiHeaders(
      NextResponse.json({ error: "Invalid JSON" }, { status: 400 }),
    );
  }

  const event = parseWebhookEvent(body, url.searchParams);
  if (!event) {
    return withApiHeaders(
      NextResponse.json({ received: true, ignored: "missing topic or id" }),
    );
  }

  // Verify HMAC signature. The signature manifest needs the dataId, which
  // we extracted via parseWebhookEvent above.
  const secret = process.env.MP_WEBHOOK_SECRET?.trim();
  if (secret) {
    const ok = await verifyWebhookSignature({
      requestId: req.headers.get("x-request-id"),
      dataId: event.dataId,
      signatureHeader: req.headers.get("x-signature"),
      secret,
    });
    if (!ok) {
      return withApiHeaders(
        new NextResponse("Invalid signature", { status: 401 }),
      );
    }
  } else {
    if (process.env.NODE_ENV === "production") {
      // Don't disclose which env var is missing in prod responses.
      return withApiHeaders(
        new NextResponse("Service misconfigured", { status: 500 }),
      );
    }
    console.warn(
      "[MP webhook] MP_WEBHOOK_SECRET not set — accepting webhook WITHOUT signature verification (NOT safe for production)",
    );
  }

  console.log("[MP webhook]", {
    topic: event.topic,
    dataId: event.dataId,
    action: event.action,
  });

  if (event.topic === "preapproval") {
    try {
      const mp = getMpClient();
      const state = getMpState();
      const sub = await mp.getPreapproval(event.dataId);
      await state.set(sub.id, {
        status: sub.status,
        lastWebhookStatus: sub.status,
        lastWebhookAt: new Date().toISOString(),
      });
      console.log("[MP webhook] subscription updated", {
        id: sub.id,
        status: sub.status,
      });
    } catch (err) {
      // Log err.message only — never the full err object (could include
      // request bodies, tokens, etc).
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[MP webhook] failed to fetch preapproval:", msg);
    }
  }

  return withApiHeaders(
    NextResponse.json({
      received: true,
      topic: event.topic,
      dataId: event.dataId,
    }),
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  return withApiHeaders(
    NextResponse.json({
      ok: true,
      note: "MP webhook endpoint. Configure this URL in your MP dev panel webhook settings, set MP_WEBHOOK_SECRET to enable signature verification.",
      example_url: `${url.origin}/api/webhook/mercadopago`,
    }),
  );
}
