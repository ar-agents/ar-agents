import { NextRequest, NextResponse } from "next/server";
import { createMpAgent } from "@/lib/agent";
import { bodySizeGuard, rateLimit, withApiHeaders } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const limited = rateLimit(req);
  if (limited) return withApiHeaders(limited);

  const oversized = bodySizeGuard(req);
  if (oversized) return withApiHeaders(oversized);

  let body: { message?: string; messages?: { role: string; content: string }[] };
  try {
    body = await req.json();
  } catch {
    return withApiHeaders(
      NextResponse.json(
        { error: "Body must be valid JSON" },
        { status: 400 },
      ),
    );
  }

  const agent = createMpAgent();

  try {
    const result = body.messages
      ? await agent.generate({ messages: body.messages as never })
      : await agent.generate({ prompt: body.message ?? "" });

    return withApiHeaders(
      NextResponse.json({
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
      }),
    );
  } catch (err) {
    // Never leak stack traces or internal error messages — closes mp-hello
    // /api/agent info-disclosure finding from the security audit.
    const isProd = process.env.NODE_ENV === "production";
    const message =
      isProd
        ? "Internal server error"
        : err instanceof Error
          ? err.message
          : String(err);
    if (!isProd) {
      console.error("[mp-hello/api/agent]", err);
    }
    return withApiHeaders(
      NextResponse.json({ error: message }, { status: 500 }),
    );
  }
}

export async function GET() {
  return withApiHeaders(
    NextResponse.json({
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
    }),
  );
}
