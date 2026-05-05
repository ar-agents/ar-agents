import { NextRequest, NextResponse } from "next/server";
import { createWhatsAppHelloAgent } from "@/lib/agent";
import { MockWhatsAppClient } from "@/lib/mock-whatsapp-client";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Demo endpoint — simulates a WhatsApp inbound message and runs the agent.
 *
 * POST /api/agent
 * { message: "...", from?: "549..." }
 *
 * Response includes:
 * - text: agent's final reply
 * - steps: tool calls + results (the agent's reasoning trace)
 * - whatsappMode: "live" (real Meta) or "mock" (creds missing — demo mode)
 * - whatsappSends: array of "messages we would have sent" if mock mode
 */
export async function POST(req: NextRequest) {
  let body: { message?: string; from?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be valid JSON" }, { status: 400 });
  }

  const { agent, whatsappMode, whatsappClient } = createWhatsAppHelloAgent();
  if (whatsappClient instanceof MockWhatsAppClient) {
    whatsappClient.reset();
  }

  // Frame the prompt so the agent treats it as an inbound WhatsApp message.
  const fromPhone = body.from ?? "5491112345678";
  const framedPrompt = `[Mensaje entrante de WhatsApp]
De: ${fromPhone}
Texto: ${body.message ?? ""}

Procesalo según tu workflow.`;

  try {
    const result = await agent.generate({ prompt: framedPrompt });

    const whatsappSends =
      whatsappClient instanceof MockWhatsAppClient
        ? whatsappClient.getRecordedSends()
        : [];

    return NextResponse.json({
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
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: message, type: err instanceof Error ? err.name : "Unknown" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    info: "whatsapp-hello — combined demo for the AR Agents stack (identity + mercadopago + whatsapp).",
    usage: {
      method: "POST",
      url: "/api/agent",
      body: { message: "string", from: "5491112345678 (optional)" },
      example: {
        message: "Hola, quiero contratar el plan Pro. Mi CUIT es 20-41758101-5",
        from: "5491112345678",
      },
    },
    libs: [
      "@ar-agents/identity (CUIT validation + AFIP padron lookup)",
      "@ar-agents/mercadopago (Mercado Pago Subscriptions)",
      "@ar-agents/whatsapp (WhatsApp Business Cloud API)",
    ],
    setup: "See /api/whatsapp/webhook for the production WhatsApp webhook handler. Without WA_ACCESS_TOKEN + WA_PHONE_NUMBER_ID env vars, the WhatsApp tools run in mock mode (recorded but not sent).",
  });
}
