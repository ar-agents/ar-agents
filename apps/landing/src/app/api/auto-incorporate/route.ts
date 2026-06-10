/**
 * `POST /api/auto-incorporate`, machine-readable incorporation
 * surface for an external agent.
 *
 * The /incorporar wizard is for humans clicking through a form; this
 * endpoint is the same flow exposed as a single JSON-RPC-style call,
 * so a USA-LLC agent (or any external orchestrator) can self-incorporate
 * an Argentine sociedad-IA programmatically.
 *
 * Pure logic (validation, generation) lives in src/lib/incorporate.ts
 * and is unit-tested. This route is just HTTP plumbing + audit log.
 */

import { jsonCors, preflight } from "@/lib/cors";
import {
  appendAudit,
  backend as auditBackend,
  isSessionIdValid,
} from "@/lib/audit";
import {
  Body,
  generateAgentTs,
  generateChecklist,
  generateEnvExample,
  generatePackageJson,
  generateReadme,
  envVarsFor,
  PIEZA_IDS,
  REQUIRED_PIEZAS,
  resolvePiezas,
  slugFor,
  validate,
} from "@/lib/incorporate";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const runtime = "edge";

export async function POST(req: Request) {
  // Incorporation entries are durable KV writes — damp per-IP amplification.
  if (!rateLimit("auto-incorporate", clientIp(req), 10, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ error: "bad_json" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return jsonCors(
      { error: "invalid_input", details: parsed.error.format() },
      { status: 400 },
    );
  }
  const input = parsed.data;

  const validation = validate(input);
  if (!validation.valid) {
    return jsonCors(
      {
        ok: false,
        validation,
        rfc001: { version: "1.0", url: "https://ar-agents.ar/rfcs/001" },
      },
      { status: 422 },
    );
  }

  const piezas = resolvePiezas(input.piezas);
  const envVars = envVarsFor(piezas);
  const config = {
    "package.json": generatePackageJson(input, piezas),
    "lib/agent.ts": generateAgentTs(input, piezas),
    ".env.example": generateEnvExample(envVars),
    "README.md": generateReadme(input),
  };

  const sessionId =
    input.sessionId && isSessionIdValid(input.sessionId)
      ? input.sessionId
      : crypto.randomUUID();

  const slug = slugFor(input.denominacion);
  const deployUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
    "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter",
  )}&project-name=${encodeURIComponent(slug)}&env=${encodeURIComponent(
    envVars.map((v) => v.name).join(","),
  )}`;

  // Incorporation acts are business records, not demo noise: durable, so the
  // public proof link survives past the 7-day demo TTL.
  const auditEntry = await appendAudit(
    sessionId,
    {
      tool: "auto_incorporate",
      governance: "audit-logged",
      input: {
        denominacion: input.denominacion,
        tipo: input.tipo,
        capitalSocial: input.capitalSocial,
        objeto: input.objeto.slice(0, 200),
        piezas,
      },
      output: { slug, valid: validation.valid, files: Object.keys(config) },
    },
    { durable: true },
  );

  return jsonCors(
    {
      ok: true,
      sociedad: {
        denominacion: input.denominacion,
        tipo: input.tipo,
        capitalSocial: input.capitalSocial,
        slug,
      },
      validation,
      config,
      envVars,
      checklist: generateChecklist(input),
      deploy: {
        target: "vercel",
        oneClickUrl: deployUrl,
        sourceUrl:
          "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter",
        manualSteps: generateChecklist(input),
      },
      audit: {
        sessionId,
        backend: auditBackend(),
        entry: auditEntry,
        url: `https://ar-agents.ar/api/play/audit/${sessionId}`,
        verifyUrl: `https://ar-agents.ar/api/play/audit/${sessionId}?verify=1`,
        dashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
      },
      rfc001: { version: "1.0", url: "https://ar-agents.ar/rfcs/001" },
      generatedAt: new Date().toISOString(),
    },
    {
      headers: {
        "x-play-session": sessionId,
        "x-audit-backend": auditBackend(),
      },
    },
  );
}

export async function GET() {
  // GET returns the endpoint's self-description (machine-readable docs).
  // The real call is POST; we surface this via Allow header so HTTP-aware
  // clients + conformance scanners read it correctly. Cache aggressively
  // because the doc body is stable.
  return jsonCors(
    {
      endpoint: "/api/auto-incorporate",
      method: "POST",
      description:
        "Machine-readable wizard for self-incorporating an Argentine sociedad-IA. POST a body with the schema below; receive package.json + agent.ts + .env.example + README.md + Vercel deploy URL + checklist + signed audit-log reference.",
      inputSchema: {
        denominacion: "string (3-200 chars)",
        tipo: "SAS | SRL | SA | SOCIEDAD-IA",
        capitalSocial: "number > 0 (ARS)",
        objeto: "string (20-2000 chars)",
        representante: "{ nombre: string, cuit: string }? (optional)",
        emailContacto: "string? (email)",
        piezas: `string[]?, subset of [${PIEZA_IDS.join(", ")}]; required pieces auto-added`,
        sessionId: "string?, for audit log continuity across calls",
      },
      requiredPiezas: REQUIRED_PIEZAS,
      rfc001: "https://ar-agents.ar/rfcs/001",
      auditLogReadEndpoint: "/api/play/audit/{sessionId}",
      dashboardEndpoint: "/dashboard/{sessionId}",
    },
    {
      headers: {
        Allow: "POST, OPTIONS",
        "Cache-Control": "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

export async function OPTIONS() {
  return preflight();
}
