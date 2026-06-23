/**
 * `POST /api/agent` — agent loop.
 *
 * Request body: `{ prompt: string, system?: string }`.
 * Response: a JSON envelope with the final text + the tool-call trace.
 *
 * Uses the @ar-agents/* toolkit composed in `lib/agent.ts`. Available
 * tools depend on which env vars are configured — see `clientStatus()`
 * for the inventory.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { buildAgent } from "@/lib/agent";
import { clientStatus } from "@/lib/clients";

// The agent loop makes up to 20 model + tool round-trips. Fluid Compute (on by
// default for new Vercel projects) bills active CPU, not idle wall-clock, so
// this headroom is cheap. Raise to 300 on Pro for long incorporations.
export const maxDuration = 60;

const Body = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body.", details: parsed.error.format() },
      { status: 400 },
    );
  }

  try {
    const agent = buildAgent();
    const result = await agent.generate({
      prompt: parsed.data.prompt,
    });
    return NextResponse.json({
      text: result.text,
      steps: result.steps?.length ?? 0,
      toolCalls: result.steps?.flatMap((s) => s.toolCalls ?? []) ?? [],
      clientStatus: clientStatus(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      {
        error: "Agent loop failed.",
        message,
        clientStatus: clientStatus(),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/agent",
    method: "POST",
    body: { prompt: "string (1-8000 chars)" },
    clientStatus: clientStatus(),
  });
}
