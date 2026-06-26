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
import { clientIp, guardResponse, rateLimit, requireApiKey } from "@/lib/guard";

const Body = z.object({
  prompt: z.string().min(1).max(8000),
  system: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  // Fail-closed auth: the agent loop wires real @ar-agents/* tools and spends
  // Anthropic tokens, so it must never run for an anonymous caller. Requires
  // AGENT_API_KEY (503 until configured) + a valid key (401 otherwise).
  const auth = requireApiKey(req);
  if (!auth.ok) return guardResponse(auth);

  // Per-IP abuse limit before the expensive model + external API calls.
  if (!rateLimit("agent", clientIp(req), 20, 60_000)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

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
    const agent = await buildAgent();
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
    auth: "Required. Authorization: Bearer <AGENT_API_KEY> (or x-api-key). 503 until AGENT_API_KEY is set.",
    rateLimit: "20 requests / minute / IP",
    body: { prompt: "string (1-8000 chars)", system: "string (optional, ≤4000 chars)" },
    clientStatus: clientStatus(),
  });
}
