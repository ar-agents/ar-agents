/**
 * The incorporation pipeline, shared by every transport that constitutes a
 * society: validate -> generate the locked-template scaffold -> append the
 * signed, durable audit entry (carrying the approver attestation) -> build the
 * response. Transport concerns (rate limiting, auth, idempotency caching) stay
 * in the route handlers; this is the pure act of incorporating a validated
 * input. Both POST /api/auto-incorporate (structured body) and
 * POST /api/incorporate-from-prompt (LLM-extracted body) call it, so the rails
 * and the audit shape can never drift between the two surfaces.
 */

import {
  appendAudit,
  type ApproverAttestation,
  backend as auditBackend,
  isSessionIdValid,
} from "./audit";
import {
  envVarsFor,
  generateAgentTs,
  generateChecklist,
  generateEnvExample,
  generatePackageJson,
  generateReadme,
  type IncorporateInput,
  resolvePiezas,
  slugFor,
  validate,
} from "./incorporate";

const STARTER_URL =
  "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter";

export type RunIncorporationResult =
  | { ok: false; status: 422; body: Record<string, unknown> }
  | { ok: true; status: 200; sessionId: string; body: Record<string, unknown> };

/**
 * Run the incorporation pipeline for an already-parsed, already-authorized
 * input. `opts.approver` is the attestation the route built from the credential
 * + declared human; it is bound into the signed audit entry. `opts.tool` is the
 * audit-log label for the surface that produced the act.
 */
export async function runIncorporation(
  input: IncorporateInput,
  opts: { approver: ApproverAttestation; tool: string },
): Promise<RunIncorporationResult> {
  const validation = validate(input);
  if (!validation.valid) {
    return {
      ok: false,
      status: 422,
      body: {
        ok: false,
        validation,
        rfc001: { version: "1.0", url: "https://ar-agents.ar/rfcs/001" },
      },
    };
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
    STARTER_URL,
  )}&project-name=${encodeURIComponent(slug)}&env=${encodeURIComponent(
    envVars.map((v) => v.name).join(","),
  )}`;

  // Incorporation acts are business records, not demo noise: durable, so the
  // public proof link survives past the 7-day demo TTL. The approver attestation
  // is signed with the entry (tamper-evident).
  const auditEntry = await appendAudit(
    sessionId,
    {
      tool: opts.tool,
      governance: "audit-logged",
      approver: opts.approver,
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

  const body = {
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
      sourceUrl: STARTER_URL,
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
  };

  return { ok: true, status: 200, sessionId, body };
}
