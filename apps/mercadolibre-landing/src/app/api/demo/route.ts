// Live demo API route. Spins up a real LLM agent with the meliTools toolset
// against a mocked MELI backend, streams the response (text + tool calls) to
// the client.
//
// The demo uses Vercel AI Gateway (no separate Anthropic key needed) — set
// AI_GATEWAY_API_KEY in production. Falls back to ANTHROPIC_API_KEY if set.

import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";
import { streamText, convertToModelMessages, type UIMessage } from "ai";
import { buildDemoMeliClient } from "@/lib/demo-mock";

export const runtime = "nodejs";
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a Mercado Libre seller assistant for Argentine sellers.

Speak Argentine Spanish (vos, no tú). Be brief and specific. Use the tools whenever real data is needed — never make up numbers.

You're operating against a DEMO backend with realistic but synthetic data. Treat it as if it's real:
- Seller id 12345
- Site MLA (Argentina, ARS)
- ~7 paid orders today, 3 unanswered questions, 2 open claims (one due in 18h), reputation YELLOW

Available tool families: items, categories, questions (incl. spam classifier), orders, claims, shipments, reputation, promotions.

When you call a tool, briefly explain what you're checking before the call. After the tool returns, summarize the result for the user in Spanish.`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const client = buildDemoMeliClient();
  const tools = meliTools(client, { siteId: "MLA", sellerId: 12345 });

  const result = streamText({
    model: "anthropic/claude-sonnet-4-6",
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: ({ steps }) => steps.length >= 8,
  });

  return result.toUIMessageStreamResponse();
}
