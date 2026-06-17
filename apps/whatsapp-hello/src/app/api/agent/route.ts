import { NextRequest, NextResponse } from "next/server";
import { createWhatsAppHelloAgent } from "@/lib/agent";
import { MockWhatsAppClient } from "@/lib/mock-whatsapp-client";
import { bodySizeGuard, rateLimit, withApiHeaders } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 90;

interface AgentTurnMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Demo endpoint — simulates a WhatsApp conversation with the agent.
 * Supports both single-turn (just `message`) and multi-turn (full `messages`
 * array) so the OTP-dictate flow works end-to-end.
 *
 * POST /api/agent
 *  { message: "...", from?: "549..." }                   — single turn
 *  { messages: [{role, content}, ...], from?: "..." }    — multi-turn
 *
 * Response:
 *  - text: agent's final reply
 *  - steps: tool calls + results (reasoning trace)
 *  - whatsappMode: "live" | "mock"
 *  - whatsappSends: messages "sent" via WhatsApp (mock mode only)
 */
export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return withApiHeaders(limited);

  const oversized = bodySizeGuard(req);
  if (oversized) return withApiHeaders(oversized);

  let body: { message?: string; messages?: AgentTurnMessage[]; from?: string };
  try {
    body = await req.json();
  } catch {
    return withApiHeaders(
      NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 }),
    );
  }

  const { agent, whatsappMode, whatsappClient } = createWhatsAppHelloAgent();
  if (whatsappClient instanceof MockWhatsAppClient) {
    whatsappClient.reset();
  }

  const fromPhone = body.from ?? "5491112345678";

  try {
    let result;
    if (body.messages && body.messages.length > 0) {
      // Multi-turn: pass the full conversation. Frame each user turn as a WA message.
      const messages = body.messages.map((m) =>
        m.role === "user"
          ? {
              role: "user" as const,
              content: `[Mensaje entrante de WhatsApp de ${fromPhone}]\n${m.content}`,
            }
          : { role: "assistant" as const, content: m.content },
      );
      result = await agent.generate({ messages: messages as never });
    } else {
      const framedPrompt = `[Mensaje entrante de WhatsApp]
De: ${fromPhone}
Texto: ${body.message ?? ""}

Procesalo según tu workflow.`;
      result = await agent.generate({ prompt: framedPrompt });
    }

    const whatsappSends =
      whatsappClient instanceof MockWhatsAppClient
        ? whatsappClient.getRecordedSends()
        : [];

    return withApiHeaders(
      NextResponse.json({
        text: result.text,
        whatsappMode,
        whatsappSends,
        steps: result.steps.map((s) => ({
          text: s.text,
          toolCalls: s.toolCalls.map((t) => ({
            name: t.toolName,
            input: t.input,
          })),
          toolResults: s.toolResults.map((t) => ({
            name: t.toolName,
            output: t.output,
          })),
          finishReason: s.finishReason,
        })),
        usage: result.usage,
        finishReason: result.finishReason,
      }),
    );
  } catch (err) {
    // Never leak stack traces or internal error messages.
    const isProd = process.env.NODE_ENV === "production";
    const message =
      isProd
        ? "Internal server error"
        : err instanceof Error
          ? err.message
          : String(err);
    if (!isProd) {
      console.error("[api/agent] error:", err);
    }
    return withApiHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
    );
  }
}

export async function GET() {
  return withApiHeaders(
    NextResponse.json({
      info: "whatsapp-hello — combined demo combining all 5 @ar-agents/* packages: identity (CUIT + AFIP), identity-attest (verification with trust levels), mercadopago (Payments + Subscriptions + Cuotas + Saved cards + QR), whatsapp (Business Cloud API).",
      usage: {
        method: "POST",
        url: "/api/agent",
        body: {
          single_turn: { message: "string", from: "5491112345678 (optional)" },
          multi_turn: { messages: [{ role: "user|assistant", content: "string" }], from: "5491112345678" },
        },
        example: {
          message: "Hola, quiero contratar el plan Pro mensual ($25.000). Mi CUIT es 20-12345678-6",
          from: "5491112345678",
        },
      },
      trust_gating: {
        "<5k_ARS": "no verification — direct charge",
        "5k-50k_ARS": "trust >= 0.3 (whatsapp_otp)",
        "50k-500k_ARS": "trust >= 0.5 (email_magic_link or mercadopago_identity)",
        ">500k_ARS": "trust >= 0.7 (auth0 or magic_link_sdk)",
      },
      libs: [
        "@ar-agents/identity@0.4.0",
        "@ar-agents/identity-attest@0.2.0",
        "@ar-agents/mercadopago@0.3.0",
        "@ar-agents/whatsapp@0.1.0",
      ],
    }),
  );
}
