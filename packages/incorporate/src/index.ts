/**
 * `@ar-agents/incorporate` — zero-dependency TypeScript client for the
 * `/api/auto-incorporate` endpoint at https://ar-agents.ar.
 *
 * Designed to be the canonical surface for an external agent
 * (USA-incorporated LLC, ChatGPT/Claude/Gemini extension, custom
 * orchestrator) to programmatically self-incorporate an Argentine
 * sociedad-IA. One async call returns:
 *   - The four generated source files
 *     (package.json, lib/agent.ts, .env.example, README.md)
 *   - The Vercel one-click deploy URL
 *   - The full env-var manifest required for production
 *   - The legal + operational checklist
 *   - A signed audit-log reference (HMAC-SHA256)
 *
 * The package itself is a thin fetch wrapper — no SDK gymnastics, no
 * runtime adapters. Works in Node 20+, Edge Runtime, Cloudflare Workers,
 * Deno, browsers (with CORS — see the README).
 *
 * Quickstart:
 *
 * ```ts
 * import { incorporate } from "@ar-agents/incorporate";
 *
 * const result = await incorporate({
 *   denominacion: "ACME-AI SAS",
 *   tipo: "SOCIEDAD-IA",
 *   capitalSocial: 1,
 *   objeto: "Operación de servicios digitales y desarrollo de software propio.",
 * });
 *
 * if (!result.ok) {
 *   for (const f of result.validation.findings) {
 *     console.error(`[${f.severity}] ${f.field}: ${f.message}`);
 *   }
 *   process.exit(1);
 * }
 *
 * console.log("Deploy:", result.deploy.oneClickUrl);
 * console.log("Audit:", result.audit.url);
 * ```
 */

const DEFAULT_BASE_URL = "https://ar-agents.ar";

// ─────────────────────────────────────────────────────────────────────────────
// Types — mirror the server contract at /api/auto-incorporate.
// ─────────────────────────────────────────────────────────────────────────────

export type SocietyType = "SAS" | "SRL" | "SA" | "SOCIEDAD-IA";

export type PiezaId =
  | "identity"
  | "identity-attest"
  | "mi-argentina"
  | "firma-digital"
  | "gde-tad"
  | "mercadopago"
  | "mercadolibre"
  | "banking"
  | "facturacion"
  | "igj"
  | "boletin-oficial"
  | "whatsapp"
  | "shipping"
  | "agentic-commerce-bridge"
  | "ap2"
  | "mcp";

export interface IncorporateInput {
  /** Corporate name. 3–200 chars. IGJ rejects reserved words (Nacional, Estatal, etc). */
  denominacion: string;
  /** Corporate form. SOCIEDAD-IA is gated by the AR regime — see RFC-001 § 3.4. */
  tipo: SocietyType;
  /** Capital social in ARS. Minimum varies by `tipo` (SAS/SRL: 100k, SA: 30M, SOCIEDAD-IA: 1). */
  capitalSocial: number;
  /** Objeto social. 20–2000 chars. IGJ rejects generic phrasing. */
  objeto: string;
  /** Optional human representante for the legal-facade layer per RFC-001 § 3.1. */
  representante?: { nombre: string; cuit: string };
  /**
   * ALE (Kargieman): designate a public beneficiary (e.g. a sovereign wealth fund)
   * with a % of net returns to unlock calibrated relief from solidary liability.
   */
  beneficiarioPublico?: { entidad: string; porcentaje: number };
  /** Optional contact email. */
  emailContacto?: string;
  /**
   * Subset of available piezas. Server always merges with required ones
   * (`identity`, `gde-tad`, `mercadopago`, `banking`, `facturacion`).
   */
  piezas?: PiezaId[];
  /**
   * Optional client-supplied audit-log session id. Pass to chain multiple
   * incorporation requests + tool calls under a single forensic timeline.
   * Format: 8–64 chars, [A-Za-z0-9_-]. UUIDs valid.
   */
  sessionId?: string;
}

export interface ValidationFinding {
  code: string;
  severity: "error" | "warning";
  field: string;
  message: string;
}

export interface IncorporateValidationFailure {
  ok: false;
  validation: { valid: false; findings: ValidationFinding[] };
  rfc001: { version: string; url: string };
}

export interface IncorporateAuditEntry {
  id: string;
  sessionId: string;
  ts: string;
  tool: string;
  governance: string;
  input: unknown;
  output?: unknown;
  hmac: string | null;
  durationMs?: number;
}

export interface IncorporateSuccess {
  ok: true;
  sociedad: {
    denominacion: string;
    tipo: SocietyType;
    capitalSocial: number;
    slug: string;
  };
  validation: { valid: true; findings: ValidationFinding[] };
  config: Record<
    | "CHARTER.md"
    | "package.json"
    | "lib/agent.ts"
    | "lib/governance.ts"
    | ".env.example"
    | "README.md",
    string
  >;
  envVars: Array<{ name: string; description: string }>;
  checklist: string[];
  deploy: {
    target: "vercel";
    oneClickUrl: string;
    sourceUrl: string;
    manualSteps: string[];
  };
  audit: {
    sessionId: string;
    backend: "vercel-kv" | "in-memory";
    entry: IncorporateAuditEntry;
    url: string;
    verifyUrl: string;
    dashboardUrl: string;
  };
  rfc001: { version: string; url: string };
  generatedAt: string;
}

export type IncorporateResult = IncorporateSuccess | IncorporateValidationFailure;

export interface IncorporateOptions {
  /** Defaults to https://ar-agents.ar — override for staging or self-hosted mirror. */
  baseUrl?: string;
  /** Pass a custom `fetch` (e.g. for Node 18 polyfill or instrumented fetch). */
  fetchImpl?: typeof fetch;
  /** Optional AbortSignal. */
  signal?: AbortSignal;
  /** Optional extra request headers (e.g. tracing). */
  headers?: Record<string, string>;
}

export class IncorporateError extends Error {
  readonly status: number;
  readonly response: unknown;
  constructor(message: string, status: number, response: unknown) {
    super(message);
    this.name = "IncorporateError";
    this.status = status;
    this.response = response;
  }
}

export class IncorporateValidationError extends Error {
  readonly findings: ValidationFinding[];
  constructor(findings: ValidationFinding[]) {
    super(
      `Validation failed: ${findings
        .filter((f) => f.severity === "error")
        .map((f) => `${f.field}: ${f.message}`)
        .join("; ")}`,
    );
    this.name = "IncorporateValidationError";
    this.findings = findings;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Client functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls `POST /api/auto-incorporate`. Returns the success or validation-failure
 * envelope, depending on whether the input cleared IGJ pre-flight rules.
 *
 * Throws `IncorporateError` for non-200/422 HTTP responses (network errors,
 * 500s, rate-limit). Validation failures (422) are returned as
 * `{ ok: false, validation: { findings } }` — they're a *result*, not an
 * exception, because the agent can fix and retry.
 */
export async function incorporate(
  input: IncorporateInput,
  options: IncorporateOptions = {},
): Promise<IncorporateResult> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new IncorporateError(
      "No `fetch` implementation found. Pass `options.fetchImpl` or run on Node 18+.",
      0,
      null,
    );
  }
  const url = `${baseUrl}/api/auto-incorporate`;
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "@ar-agents/incorporate (https://ar-agents.ar)",
      ...options.headers,
    },
    body: JSON.stringify(input),
    signal: options.signal ?? null,
  });

  // 422 → validation failure (a normal outcome). 200 → success.
  if (response.status === 200 || response.status === 422) {
    const json = (await response.json()) as IncorporateResult;
    return json;
  }

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = await response.text().catch(() => null);
  }
  throw new IncorporateError(
    `auto-incorporate failed with HTTP ${response.status}`,
    response.status,
    payload,
  );
}

/**
 * Fetch the public schema metadata for the endpoint (`GET /api/auto-incorporate`).
 * Useful for capability discovery without sending a request body.
 */
export async function describe(
  options: IncorporateOptions = {},
): Promise<unknown> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new IncorporateError(
      "No `fetch` implementation found. Pass `options.fetchImpl` or run on Node 18+.",
      0,
      null,
    );
  }
  const r = await fetchImpl(`${baseUrl}/api/auto-incorporate`, {
    method: "GET",
    headers: {
      "user-agent": "@ar-agents/incorporate (https://ar-agents.ar)",
      ...options.headers,
    },
    signal: options.signal ?? null,
  });
  if (!r.ok) {
    throw new IncorporateError(
      `describe failed with HTTP ${r.status}`,
      r.status,
      await r.text().catch(() => null),
    );
  }
  return r.json();
}

/**
 * Fetch the audit-log entries for a session (the result of a previous
 * `incorporate` call or any `/api/play` interaction). Pass `verify: true`
 * to also request server-side HMAC verification.
 */
export async function fetchAudit(
  sessionId: string,
  options: IncorporateOptions & { verify?: boolean } = {},
): Promise<unknown> {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (!fetchImpl) {
    throw new IncorporateError(
      "No `fetch` implementation found. Pass `options.fetchImpl` or run on Node 18+.",
      0,
      null,
    );
  }
  const path = `/api/play/audit/${encodeURIComponent(sessionId)}${options.verify ? "?verify=1" : ""}`;
  const r = await fetchImpl(`${baseUrl}${path}`, {
    method: "GET",
    headers: {
      "user-agent": "@ar-agents/incorporate (https://ar-agents.ar)",
      ...options.headers,
    },
    signal: options.signal ?? null,
  });
  if (!r.ok) {
    throw new IncorporateError(
      `fetchAudit failed with HTTP ${r.status}`,
      r.status,
      await r.text().catch(() => null),
    );
  }
  return r.json();
}

/**
 * Convenience wrapper that calls `incorporate()` and throws if validation
 * fails. Useful when the calling agent has already validated client-side
 * and treats a validation failure as an exceptional condition rather than
 * a normal outcome.
 */
export async function incorporateOrThrow(
  input: IncorporateInput,
  options: IncorporateOptions = {},
): Promise<IncorporateSuccess> {
  const result = await incorporate(input, options);
  if (!result.ok) throw new IncorporateValidationError(result.validation.findings);
  return result;
}

export const PIEZA_IDS: ReadonlyArray<PiezaId> = [
  "identity",
  "identity-attest",
  "mi-argentina",
  "firma-digital",
  "gde-tad",
  "mercadopago",
  "mercadolibre",
  "banking",
  "facturacion",
  "igj",
  "boletin-oficial",
  "whatsapp",
  "shipping",
  "agentic-commerce-bridge",
  "ap2",
  "mcp",
];

export const REQUIRED_PIEZAS: ReadonlyArray<PiezaId> = [
  "identity",
  "gde-tad",
  "mercadopago",
  "banking",
  "facturacion",
];
