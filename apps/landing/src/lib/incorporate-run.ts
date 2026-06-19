/**
 * The incorporation pipeline, shared by every transport that constitutes a
 * society. Two entry points over one set of pure generators:
 *  - buildScaffold(input): the pure act of validating + generating the locked
 *    template (no side effects). previewIncorporation exposes it as a dry run.
 *  - runIncorporation(input, opts): the real act, which additionally appends the
 *    signed, durable audit entry (binding the approver attestation) and builds
 *    the full response. POST /api/auto-incorporate and
 *    /api/incorporate-from-prompt call it; /api/incorporate-preview calls the
 *    dry run. Sharing buildScaffold means the preview a human sees and the
 *    scaffold that is actually constituted can never drift.
 *
 * Transport concerns (rate limiting, auth, idempotency) stay in the routes.
 */

import {
  appendAudit,
  type ApproverAttestation,
  backend as auditBackend,
  isSessionIdValid,
} from "./audit";
import {
  envVarsFor,
  type Finding,
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

export interface Scaffold {
  validation: { valid: boolean; findings: Finding[] };
  piezas: string[];
  envVars: { name: string; description: string }[];
  config: Record<string, string>;
  slug: string;
  checklist: string[];
  deployUrl: string;
}

/** Validate + generate the locked-template scaffold. Pure, no side effects. */
export function buildScaffold(input: IncorporateInput): Scaffold {
  const validation = validate(input);
  const piezas = resolvePiezas(input.piezas);
  const envVars = envVarsFor(piezas);
  const config = {
    "package.json": generatePackageJson(input, piezas),
    "lib/agent.ts": generateAgentTs(input, piezas),
    ".env.example": generateEnvExample(envVars),
    "README.md": generateReadme(input),
  };
  const slug = slugFor(input.denominacion);
  const deployUrl = `https://vercel.com/new/clone?repository-url=${encodeURIComponent(
    STARTER_URL,
  )}&project-name=${encodeURIComponent(slug)}&env=${encodeURIComponent(
    envVars.map((v) => v.name).join(","),
  )}`;
  return {
    validation,
    piezas,
    envVars,
    config,
    slug,
    checklist: generateChecklist(input),
    deployUrl,
  };
}

export interface IncorporationPreview {
  validation: { valid: boolean; findings: Finding[] };
  slug: string;
  configFiles: string[];
  envVars: { name: string; description: string }[];
  checklist: string[];
  deployUrl: string;
}

/**
 * A dry run: what WOULD be constituted, with NO audit write, no approver, no
 * sessionId. Safe to expose unauthenticated (it constitutes nothing) so a human
 * can see their society before the gated, irreversible act. Returns file NAMES,
 * not contents, since the preview surface only needs to show the shape.
 */
export function previewIncorporation(input: IncorporateInput): IncorporationPreview {
  const s = buildScaffold(input);
  return {
    validation: s.validation,
    slug: s.slug,
    configFiles: Object.keys(s.config),
    envVars: s.envVars,
    checklist: s.checklist,
    deployUrl: s.deployUrl,
  };
}

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
  const s = buildScaffold(input);
  if (!s.validation.valid) {
    return {
      ok: false,
      status: 422,
      body: {
        ok: false,
        validation: s.validation,
        rfc001: { version: "1.0", url: "https://ar-agents.ar/rfcs/001" },
      },
    };
  }

  const sessionId =
    input.sessionId && isSessionIdValid(input.sessionId)
      ? input.sessionId
      : crypto.randomUUID();

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
        piezas: s.piezas,
      },
      output: { slug: s.slug, valid: s.validation.valid, files: Object.keys(s.config) },
    },
    { durable: true },
  );

  const body = {
    ok: true,
    sociedad: {
      denominacion: input.denominacion,
      tipo: input.tipo,
      capitalSocial: input.capitalSocial,
      slug: s.slug,
    },
    validation: s.validation,
    config: s.config,
    envVars: s.envVars,
    checklist: s.checklist,
    deploy: {
      target: "vercel",
      oneClickUrl: s.deployUrl,
      sourceUrl: STARTER_URL,
      manualSteps: s.checklist,
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
