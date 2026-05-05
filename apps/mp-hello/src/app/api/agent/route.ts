import { NextRequest, NextResponse } from "next/server";
import { createMpAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  let body: { message?: string; messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON" },
      { status: 400 },
    );
  }

  const agent = createMpAgent();

  try {
    const result = body.messages
      ? await agent.generate({ messages: body.messages as never })
      : await agent.generate({ prompt: body.message ?? "" });

    return NextResponse.json({
      text: result.text,
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
    info: "ar-agents/mp-hello — Fase 1",
    usage: {
      method: "POST",
      url: "/api/agent",
      body: { message: "string" },
      example: {
        message:
          "Creá una subscription mensual de $100 ARS para test_user@test.com",
      },
    },
  });
}
