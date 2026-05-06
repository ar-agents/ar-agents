import { NextRequest, NextResponse } from "next/server";
import {
  parseWebhookEvent,
  verifyWebhookSignature,
  verifyWebhookSubscription,
} from "@ar-agents/whatsapp";
import { createWhatsAppHelloAgent } from "@/lib/agent";
import { bodySizeGuard, withApiHeaders } from "@/lib/security";

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
 *
 * Auth model: signature verification IS the auth. Meta is the only legitimate
 * caller; rate-limiting at the IP layer makes no sense here (Meta calls from
 * a rotating pool). The signature check rejects everyone else.
 */
export async function GET(req: NextRequest) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const verifyToken = process.env.WA_WEBHOOK_VERIFY_TOKEN;
  if (!verifyToken) {
    // Don't disclose which env var is missing in prod responses.
    if (process.env.NODE_ENV !== "production") {
      console.error("[wa-webhook] WA_WEBHOOK_VERIFY_TOKEN not configured");
    }
    return withApiHeaders(
      new NextResponse("Service misconfigured", { status: 500 }),
    );
  }
  const challenge = verifyWebhookSubscription(params, verifyToken);
  if (challenge !== null) {
    return withApiHeaders(new NextResponse(challenge));
  }
  return withApiHeaders(new NextResponse("Forbidden", { status: 403 }));
}

export async function POST(req: NextRequest) {
  // Meta payloads are typically <16 KB; 256 KB is generous and bounds DoS risk.
  const oversized = bodySizeGuard(req, 262_144);
  if (oversized) return withApiHeaders(oversized);

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
      return withApiHeaders(
        new NextResponse("Invalid signature", { status: 401 }),
      );
    }
  } else {
    // In production, refuse to process unsigned webhooks. In dev/staging
    // (no secret), proceed but log loudly.
    if (process.env.NODE_ENV === "production") {
      return withApiHeaders(
        new NextResponse("Webhook unsigned and signing not configured", {
          status: 500,
        }),
      );
    }
    console.warn(
      "[wa-webhook] META_APP_SECRET not set — accepting webhook WITHOUT signature verification (NOT safe for production)",
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return withApiHeaders(new NextResponse("Invalid JSON", { status: 400 }));
  }

  const event = parseWebhookEvent(payload);

  if (event.kind === "status") {
    // Just log status updates for now. Production: persist to DB for analytics.
    console.log("[wa-webhook] status:", event.status, event.messageId);
    return withApiHeaders(new NextResponse("OK"));
  }

  if (event.kind !== "message") {
    return withApiHeaders(new NextResponse("OK"));
  }

  // Inbound message — dispatch to the agent
  const text =
    event.message.type === "text"
      ? event.message.text
      : event.message.type === "interactive"
        ? `[user picked option: ${event.message.title}]`
        : `[user sent ${event.message.type}]`;

  // Scope WhatsApp tools to the inbound sender so the agent CANNOT message a
  // different number even if the user attempts to inject "send to X" prompts.
  // Closes /cso security audit finding F5.
  const { agent } = createWhatsAppHelloAgent({ scopedTo: event.from });
  // Fire-and-forget — let the agent process and (in live mode) send a reply
  // via send_whatsapp_text. Webhook responds 200 immediately so Meta doesn't
  // retry. Production: queue this to a worker for reliability.
  agent
    .generate({
      prompt: `[Mensaje entrante de WhatsApp]
De: ${event.from} (${event.fromName ?? "sin nombre"})
Texto: ${text}
wamid: ${event.messageId}

Procesalo según tu workflow. Acordate de marcar como leído (mark_whatsapp_read) y responder con send_whatsapp_text — los tools ya están bound al número del sender, no podés mensajear a otro.`,
    })
    .catch((err) => {
      console.error("[wa-webhook] agent error:", err);
    });

  return withApiHeaders(new NextResponse("OK"));
}
