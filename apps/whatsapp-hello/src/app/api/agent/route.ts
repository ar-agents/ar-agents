import { NextRequest, NextResponse } from "next/server";
import { createCuitAgent } from "@/lib/agent";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  const agent = createCuitAgent();

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
    info: "cuit-hello — Fase 3 of the AR Agents stack",
    usage: {
      method: "POST",
      url: "/api/agent",
      body: { message: "string" },
      example: {
        message: "Validá el CUIT 20-41758101-5",
      },
    },
    direct_validation: {
      method: "GET",
      url: "/api/cuit?value=20-41758101-5",
      note: "Pure-algorithm validation without invoking the LLM. Useful for high-volume validation in form handlers.",
    },
  });
}
