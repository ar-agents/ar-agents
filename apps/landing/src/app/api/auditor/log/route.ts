import { NextResponse } from "next/server";
import { z } from "zod";
import { kv } from "@vercel/kv";
import { appendAudit, backend as auditBackend } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/ratelimit";

/**
 * POST /api/auditor/log — the thing El Auditor customers actually pay for.
 *
 * Authenticated (x-api-key issued by /api/auditor/activate) write endpoint:
 * each call appends an HMAC-SHA256 + Ed25519-signed entry to the customer's
 * DURABLE audit session (no TTL — business records don't evaporate). The
 * session stays publicly readable/verifiable at /api/play/audit/{sessionId}
 * and /dashboard/{sessionId}, which is the point: art. 102 of the
 * anteproyecto makes the administrator's AI-supervision duty non-delegable,
 * and a signed, third-party-verifiable decision log is the evidence of an
 * adequate decision procedure (art. 101 business-judgment rule).
 *
 * v1 scope: one audit session per API key (the one provisioned at subscribe/
 * activate time). Writes are key-scoped — a customer can't write into another
 * customer's session because the sessionId comes from the entitlement, never
 * from the request body.
 */

export const runtime = "edge";

const SITE = "https://ar-agents.ar";
const KEY_KEY_PREFIX = "auditor:key:";
const MAX_FIELD_BYTES = 8 * 1024;

const Body = z.object({
  tool: z.string().min(1).max(80),
  governance: z
    .enum(["algorithm-only", "audit-logged", "mocked-upstream", "requires-confirmation"])
    .default("audit-logged"),
  input: z.unknown(),
  output: z.unknown().optional(),
  errored: z.boolean().optional(),
  durationMs: z.number().int().nonnegative().max(86_400_000).optional(),
});

interface Entitlement {
  preapprovalId: string;
  payerEmail: string | null;
  plan: string | null;
  sessionId: string;
  createdAt: string;
  status: "active";
}

function tooBig(value: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(value) ?? "").length > MAX_FIELD_BYTES;
  } catch {
    return true;
  }
}

export async function POST(req: Request) {
  const apiKey = req.headers.get("x-api-key")?.trim();
  if (!apiKey || !/^arag_live_[0-9a-f]{48}$/.test(apiKey)) {
    return NextResponse.json(
      { ok: false, error: "unauthorized", note: "Header x-api-key requerido (emitida por /api/auditor/activate)." },
      { status: 401 },
    );
  }

  // Rate limit per key, not per IP — the key is the customer.
  if (!rateLimit("auditor-log", apiKey, 120, 60_000)) {
    return NextResponse.json({ ok: false, error: "rate_limited", note: "máx 120/min por key" }, { status: 429 });
  }

  const ent = await kv.get<Entitlement>(`${KEY_KEY_PREFIX}${apiKey}`);
  if (!ent || ent.status !== "active") {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_input", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const body = parsed.data;
  if (tooBig(body.input) || tooBig(body.output)) {
    return NextResponse.json(
      { ok: false, error: "payload_too_large", note: `input/output ≤ ${MAX_FIELD_BYTES} bytes c/u` },
      { status: 413 },
    );
  }

  const entry = await appendAudit(
    ent.sessionId,
    {
      tool: body.tool,
      governance: body.governance,
      input: body.input ?? null,
      ...(body.output !== undefined ? { output: body.output } : {}),
      ...(body.errored !== undefined ? { errored: body.errored } : {}),
      ...(body.durationMs !== undefined ? { durationMs: body.durationMs } : {}),
    },
    { durable: true },
  );

  return NextResponse.json(
    {
      ok: true,
      entry,
      audit: {
        backend: auditBackend(),
        sessionId: ent.sessionId,
        verifyUrl: `${SITE}/api/play/audit/${ent.sessionId}?verify=1`,
        dashboardUrl: `${SITE}/dashboard/${ent.sessionId}`,
      },
    },
    { headers: { "x-play-session": ent.sessionId, "x-audit-backend": auditBackend() } },
  );
}

// Machine-readable self-description (agents.md ergonomics).
export async function GET() {
  return NextResponse.json(
    {
      endpoint: "/api/auditor/log",
      method: "POST",
      auth: "header x-api-key (emitida por POST /api/auditor/activate)",
      purpose:
        "Escribir entradas firmadas (HMAC-SHA256 + Ed25519) y DURABLES en tu sesión de auditoría de El Auditor. RFC-004 wire format.",
      request: {
        tool: "string 1-80 — la acción que tu agente ejecutó",
        governance: "audit-logged (default) | requires-confirmation | algorithm-only | mocked-upstream",
        input: "JSON ≤ 8KB",
        output: "JSON ≤ 8KB (opcional)",
        errored: "boolean (opcional)",
        durationMs: "number (opcional)",
      },
      reads: {
        public: "GET /api/play/audit/{sessionId} — cualquiera puede leer y verificar",
        verify: "GET /api/play/audit/{sessionId}?verify=1",
        dashboard: "GET /dashboard/{sessionId}",
      },
      limits: { rate: "120/min por key", fieldSize: "8KB por campo" },
      legalHook:
        "art. 102 (deber no delegable de configuración y supervisión de la IA) + art. 101 (business judgment rule: procedimiento de decisión adecuado).",
    },
    { headers: { Allow: "GET, POST, OPTIONS", "Cache-Control": "public, max-age=300" } },
  );
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      Allow: "POST, GET, OPTIONS",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    },
  });
}
