import { NextRequest, NextResponse } from "next/server";
import {
  parseWebhookEvent,
  verifyWebhookSignature,
  verifyWebhookSubscription,
} from "@ar-agents/whatsapp";
import { createWhatsAppHelloAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Production WhatsApp webhook for whatsapp-hello.
 *
 * # Setup
 *
 * In Meta Business Suite → WhatsApp → Configuration → Webhooks:
 * - Callback URL: https://your-deployment.vercel.app/api/whatsapp/webhook
 * - Verify Token: same value as env var WA_WEBHOOK_VERIFY_TOKEN
 * - Subscribe to the `messages` field
 *
 * # GET handshake
 *
 * Meta sends GET with `?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y`
 * once when you subscribe. We echo `hub.challenge` if the token matches.
 *
 * # POST events
 *
 * Inbound messages, status updates, etc. We verify the X-Hub-Signature-256
 * header (HMAC-SHA256 of raw body with META_APP_SECRET), then dispatch:
 * - text/interactive messages → run the agent, agent decides what to send back
 * - status updates → log only (could persist to DB for analytics)
 */
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    return new NextResponse("WA_WEBHOOK_VERIFY_TOKEN not configured", { status: 500 });
  }
  const challenge = verifyWebhookSubscription(params, verifyToken);
  if (challenge !== null) {
    return new NextResponse(challenge);
  }
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  const rawBody = await req.text();

  if (appSecret) {
    try {
      verifyWebhookSignature(
        rawBody,
        req.headers.get("x-hub-signature-256") ?? "",
        appSecret,
      );
    } catch {
      return new NextResponse("Invalid signature", { status: 401 });
    }
  } else {
    console.warn(
      "[wa-webhook] META_APP_SECRET not set — accepting webhook WITHOUT signature verification (NOT safe for production)",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  const event = parseWebhookEvent(payload);

  if (event.kind === "status") {
    // Just log status updates for now. Production: persist to DB for analytics.
    console.log("[wa-webhook] status:", event.status, event.messageId);
    return new NextResponse("OK");
  }

  if (event.kind !== "message") {
    return new NextResponse("OK");
  }

  // Inbound message — dispatch to the agent
  const text =
    event.message.type === "text"
      ? event.message.text
      : event.message.type === "interactive"
        ? `[user picked option: ${event.message.title}]`
        : `[user sent ${event.message.type}]`;

  const { agent } = createWhatsAppHelloAgent();
  // Fire-and-forget — let the agent process and (in live mode) send a reply
  // via send_whatsapp_text. Webhook responds 200 immediately so Meta doesn't
  // retry. Production: queue this to a worker for reliability.
  agent
    .generate({
      prompt: `[Mensaje entrante de WhatsApp]
De: ${event.from} (${event.fromName ?? "sin nombre"})
Texto: ${text}
wamid: ${event.messageId}

Procesalo según tu workflow. Acordate de marcar como leído (mark_whatsapp_read) y responder con send_whatsapp_text.`,
    })
    .catch((err) => {
      console.error("[wa-webhook] agent error:", err);
    });

  return new NextResponse("OK");
}
