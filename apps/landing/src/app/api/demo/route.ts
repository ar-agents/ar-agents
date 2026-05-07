// Live demo endpoint: real Claude streaming via Vercel AI Gateway, real
// Vercel AI SDK tool calls with mocked execute functions. No real Mercado
// Pago calls (the demo is for the LLM behavior, not for charging cards on
// the landing).
//
// Routing: model string "anthropic/claude-sonnet-4-6" goes through Vercel
// AI Gateway. On a Vercel deployment that has the gateway enabled this just
// works — no provider package needed, no ANTHROPIC_API_KEY to manage. The
// gateway also gives us per-route observability and a single billing line
// in the Vercel dashboard.
//
// Rate limiting: 1 chat per IP per 5 minutes — keeps spend bounded and
// prevents abuse without making the demo feel gated.

import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";

export const runtime = "edge";
export const maxDuration = 30;

const SYSTEM = `You are a Mercado Pago payments agent built on top of @ar-agents/mercadopago.
You operate the Mercado Pago API on behalf of a developer evaluating the toolkit.

Voice: Argentine Spanish, conversational, concise. Use vos, not tú. Say "Listo" not "Done".
You can switch to English if the user writes in English.

Behavior:
- For ANY payment/subscription/checkout/cobro/marketplace/cuotas/refund task, USE THE TOOLS.
  Do not describe what you would do — actually call them.
- Stay tight. Keep replies to 2-4 short sentences plus the relevant link or ID.
- If the user asks something completely unrelated to Mercado Pago payments, decline once,
  briefly, and suggest a payments task they could try instead.
- Never invent IDs that didn't come from a tool result.
- If a tool returns status: "rejected", try a recovery path (different card, retry).

Currency in this demo is ARS unless explicitly stated.`;

const tools = {
  find_customer_by_email: tool({
    description:
      "Find an existing Mercado Pago customer by email. Returns { found, id?, email }.",
    inputSchema: z.object({ email: z.string().email() }),
    execute: async ({ email }) => {
      // Deterministically "find" anyone whose local part starts with these.
      const known = ["existing", "test", "old", "naza"];
      const local = email.split("@")[0]?.toLowerCase() ?? "";
      const found = known.some((p) => local.startsWith(p));
      return found
        ? { found: true, id: `cust-${local}-1842`, email }
        : { found: false, email };
    },
  }),

  create_customer: tool({
    description:
      "Create a Mercado Pago customer. Returns { id, email }. Idempotent on email — safe to call after find_customer_by_email returned found:false.",
    inputSchema: z.object({
      email: z.string().email(),
      first_name: z.string().optional(),
      last_name: z.string().optional(),
    }),
    execute: async ({ email }) => ({
      id: `cust-${email.split("@")[0]?.toLowerCase() ?? "anon"}-${Math.floor(
        Math.random() * 9000 + 1000,
      )}`,
      email,
    }),
  }),

  create_subscription: tool({
    description:
      "Create a recurring Mercado Pago subscription (preapproval). Returns { id, init_point }. The init_point is the link the customer must open to authorize the first payment.",
    inputSchema: z.object({
      customer_id: z.string(),
      amount: z.number().positive(),
      frequency: z.enum(["weekly", "monthly", "yearly"]).default("monthly"),
      reason: z.string().optional(),
    }),
    execute: async ({ amount, frequency }) => {
      const id = `preapp-${Math.random().toString(36).slice(2, 10)}`;
      return {
        id,
        amount,
        frequency,
        status: "pending",
        init_point: `https://mercadopago.com.ar/subscriptions/checkout?preapproval_id=${id}`,
      };
    },
  }),

  create_payment: tool({
    description:
      "Create a single Mercado Pago payment (one-shot charge). Returns { id, status, three_ds_url? }.",
    inputSchema: z.object({
      amount: z.number().positive(),
      installments: z.number().int().min(1).max(36).default(1),
      token: z.string().optional(),
      payer_email: z.string().email().optional(),
    }),
    execute: async ({ amount, installments }) => ({
      id: `pay-${Math.floor(Math.random() * 90000 + 10000)}`,
      status: "approved",
      amount,
      installments,
    }),
  }),

  find_applicable_promos: tool({
    description:
      "Find Argentine cuotas / installment promos for a card issuer + amount. Returns { best_installments, rate, label }. Use BEFORE create_payment to pick the right installment count.",
    inputSchema: z.object({
      issuer: z.string(),
      amount: z.number().positive(),
    }),
    execute: async ({ issuer, amount }) => {
      const promos: Record<string, { n: number; label: string }> = {
        galicia: { n: 6, label: "6 cuotas sin interés" },
        bbva: { n: 3, label: "3 cuotas sin interés" },
        santander: { n: 12, label: "12 cuotas sin interés" },
        macro: { n: 6, label: "6 cuotas sin interés" },
      };
      const key = issuer.toLowerCase();
      const match = promos[key];
      if (match) return { best_installments: match.n, rate: 0, label: match.label };
      return {
        best_installments: 1,
        rate: 0,
        label: `1 pago de $${amount.toLocaleString("es-AR")}`,
      };
    },
  }),

  compute_marketplace_fee: tool({
    description:
      "Compute platform fee + seller amount for a marketplace payment. Returns { platform_fee, seller_amount }. Pure math, no network call.",
    inputSchema: z.object({
      amount: z.number().positive(),
      platform_fee_pct: z.number().min(0).max(99),
    }),
    execute: async ({ amount, platform_fee_pct }) => {
      const platform_fee = Math.round(amount * (platform_fee_pct / 100));
      return { platform_fee, seller_amount: amount - platform_fee };
    },
  }),
} as const;

// In-memory rate limit. Per-instance, so the cap is per-Edge-region — that's
// fine for a marketing surface (the demo isn't security-critical).
const RATE_WINDOW_MS = 5 * 60 * 1000; // 5 min
const RATE_MAX = 1;
const buckets = new Map<string, { count: number; resetAt: number }>();

function rateLimit(req: Request): { ok: true } | { ok: false; retryAfter: number } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "anon";
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return { ok: true };
  }
  if (bucket.count >= RATE_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true };
}

export async function POST(req: Request) {
  const limit = rateLimit(req);
  if (!limit.ok) {
    return new Response(
      JSON.stringify({
        error: "rate_limited",
        retryAfter: limit.retryAfter,
        message: `Demo rate-limited. Try again in ${limit.retryAfter}s.`,
      }),
      {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": String(limit.retryAfter),
        },
      },
    );
  }

  let body: { messages?: UIMessage[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad_json" }), { status: 400 });
  }

  const messages = body.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: "messages_required" }), {
      status: 400,
    });
  }

  // Cap conversation length to keep latency + spend bounded.
  const trimmed = messages.slice(-8);

  const modelMessages = await convertToModelMessages(trimmed);

  try {
    const result = streamText({
      model: "anthropic/claude-sonnet-4-6",
      system: SYSTEM,
      messages: modelMessages,
      tools,
      stopWhen: ({ steps }) => steps.length >= 6,
      temperature: 0.4,
    });

    return result.toUIMessageStreamResponse();
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown";
    return new Response(
      JSON.stringify({
        error: "gateway_failed",
        message: msg.toLowerCase().includes("auth")
          ? "Live demo not configured. Set AI_GATEWAY_API_KEY (or link the project to a Vercel AI Gateway-enabled team) on this Vercel project."
          : "Live demo unavailable. Try again in a moment.",
      }),
      { status: 503, headers: { "content-type": "application/json" } },
    );
  }
}
