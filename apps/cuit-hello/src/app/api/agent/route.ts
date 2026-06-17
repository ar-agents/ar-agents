import { NextRequest, NextResponse } from "next/server";
import { createCuitAgent } from "@/lib/agent";
import { bodySizeGuard, rateLimit, withApiHeaders } from "@/lib/security";

export const runtime = "nodejs";
export const maxDuration = 30;

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

  const agent = createCuitAgent();

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
    // Never leak stack traces or internal error messages — DeepSec checks
    // for generic 500 responses without server-internal info.
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
      info: "cuit-hello — Fase 3 of the AR Agents stack",
      usage: {
        method: "POST",
        url: "/api/agent",
        body: { message: "string" },
        example: {
          message: "Validá el CUIT 20-12345678-6",
        },
      },
      direct_validation: {
        method: "GET",
        url: "/api/cuit?value=20-12345678-6",
        note: "Pure-algorithm validation without invoking the LLM. Useful for high-volume validation in form handlers.",
      },
    }),
  );
}
