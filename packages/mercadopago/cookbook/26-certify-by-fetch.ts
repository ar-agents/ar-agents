/**
 * Recipe 26 — Certify any sociedad-IA by fetching its public endpoints.
 *
 * # Pattern
 *
 * Reusable TypeScript function that takes a target base URL, fetches the
 * sociedad-IA's public endpoints (well-known + audit + verify + CSV +
 * OpenAPI), runs ~9 checks against them, and returns a deterministic
 * Certification object with a 0-100 score + per-check breakdown.
 *
 * This is the function backing the /certifier web flow + the /api/certifier
 * HTTP endpoint at ar-agents.ar. It's also useful as:
 *
 *   - A CI guard. Run every commit; fail the build if score drops below a
 *     threshold.
 *   - A monitoring check. Run hourly; alert if a known-good sociedad-IA
 *     starts failing checks.
 *   - A reverse-due-diligence tool. Before transacting with a counterpart,
 *     run certify(counterpartUrl) to confirm they advertise + serve the
 *     RFC endpoints.
 *
 * # When to use
 *
 * - Pre-merge gate in a sociedad-IA's own GitHub Actions workflow.
 * - Cron job that re-certifies every sociedad in the public registry
 *   (regulator's "show me who's actually live" dashboard).
 * - Integration test in CI for the @ar-agents/* libs themselves —
 *   prove that the demo deployments stay conformant.
 *
 * # Edge Runtime
 *
 * Pure fetch + JSON shaping. Runs in Edge, Node 18+, browser, deno.
 * No filesystem. No state.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Types — match the /api/certifier output shape
// ─────────────────────────────────────────────────────────────────────────────

export interface Check {
  id: string;
  label: string;
  weight: number;
  status: "pass" | "fail" | "skip" | "warn";
  detail: string;
  source?: string;
  httpStatus?: number;
}

export interface Certification {
  $schema: string;
  generatedAt: string;
  target: { baseUrl: string; sessionId: string | null };
  score: number;
  rating: "A" | "B" | "C" | "D" | "F" | "N/A";
  rfcConformance: {
    "rfc-002-v1": "pass" | "partial" | "fail" | "skip";
    "rfc-004-draft": "pass" | "partial" | "fail" | "skip";
  };
  checks: Check[];
  notes: string[];
}

export interface CertifyOptions {
  /** SessionId to use for the audit-read + verify checks. */
  sessionId?: string;
  /** Override fetch impl (for testing). */
  fetchImpl?: typeof fetch;
  /** Per-fetch timeout in ms (default 8000). */
  timeoutMs?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Default constants
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_SESSION_ID = "demo-public-ar-001";

// ─────────────────────────────────────────────────────────────────────────────
// Fetch helper with timeout
// ─────────────────────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "ar-agents-recipe-26-certify (https://ar-agents.ar/certifier)",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scoring helpers
// ─────────────────────────────────────────────────────────────────────────────

function ratingFromScore(score: number): Certification["rating"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function summarizeRfcConformance(checks: Check[]): Certification["rfcConformance"] {
  function status(arr: Check[]): "pass" | "partial" | "fail" | "skip" {
    if (arr.length === 0) return "skip";
    const counts = { pass: 0, fail: 0, warn: 0, skip: 0 };
    for (const c of arr) counts[c.status]++;
    if (counts.fail === 0 && counts.warn === 0 && counts.pass > 0) return "pass";
    if (counts.pass > 0) return "partial";
    if (counts.fail > 0) return "fail";
    return "skip";
  }
  return {
    "rfc-002-v1": status(checks.filter((c) => c.id.startsWith("rfc-002"))),
    "rfc-004-draft": status(checks.filter((c) => c.id.startsWith("rfc-004"))),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function certifySociedad(
  baseUrl: string,
  options: CertifyOptions = {},
): Promise<Certification> {
  const parsed = new URL(baseUrl);
  const base = parsed.origin;
  const sessionId = options.sessionId ?? null;
  const targetSession = sessionId ?? DEFAULT_SESSION_ID;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  const checks: Check[] = [];
  const notes: string[] = [];

  // ── 1. Well-known manifest exists + parses ─────────────────────────────────
  const wellKnownUrl = `${base}/.well-known/agents.json`;
  let manifest: Record<string, unknown> | null = null;
  try {
    const r = await fetchWithTimeout(wellKnownUrl, undefined, timeoutMs, fetchImpl);
    if (r.ok) {
      try {
        manifest = await r.json();
        checks.push({
          id: "rfc-002-well-known-exists",
          label: "RFC-002 · /.well-known/agents.json returns 200 + valid JSON",
          weight: 15,
          status: "pass",
          detail: "Manifest fetched + parsed.",
          source: wellKnownUrl,
          httpStatus: r.status,
        });
      } catch {
        checks.push({
          id: "rfc-002-well-known-exists",
          label: "RFC-002 · /.well-known/agents.json returns 200 + valid JSON",
          weight: 15,
          status: "fail",
          detail: "Body is not valid JSON.",
          source: wellKnownUrl,
          httpStatus: r.status,
        });
      }
    } else {
      checks.push({
        id: "rfc-002-well-known-exists",
        label: "RFC-002 · /.well-known/agents.json returns 200 + valid JSON",
        weight: 15,
        status: "fail",
        detail: `HTTP ${r.status}.`,
        source: wellKnownUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-002-well-known-exists",
      label: "RFC-002 · /.well-known/agents.json returns 200 + valid JSON",
      weight: 15,
      status: "fail",
      detail: `Network error: ${(e as Error).message}`,
      source: wellKnownUrl,
    });
  }

  // ── 2. Manifest required fields ───────────────────────────────────────────
  if (manifest) {
    const issuer = manifest.issuer as Record<string, unknown> | undefined;
    const endpoints = manifest.endpoints as Record<string, unknown> | unknown[] | undefined;
    const auditEndpoints = manifest.auditEndpoints as Record<string, unknown> | undefined;
    const hasIssuerJurisdiction = issuer && typeof issuer.jurisdiction === "string";
    const hasAuditRead =
      (endpoints && !Array.isArray(endpoints) && typeof (endpoints as Record<string, unknown>).auditRead === "string") ||
      (auditEndpoints && typeof auditEndpoints.auditRead === "string");
    const ok = hasIssuerJurisdiction && hasAuditRead;
    checks.push({
      id: "rfc-002-manifest-required-fields",
      label: "RFC-002 · Manifest has issuer.jurisdiction + auditRead endpoint",
      weight: 10,
      status: ok ? "pass" : "fail",
      detail: ok
        ? `jurisdiction=${issuer!.jurisdiction}; auditRead present.`
        : "Missing issuer.jurisdiction or auditRead endpoint.",
    });

    const rfcConformance = manifest.rfcConformance;
    checks.push({
      id: "rfc-002-manifest-rfc-conformance",
      label: "RFC-002 · Manifest advertises rfcConformance",
      weight: 5,
      status: Array.isArray(rfcConformance) && rfcConformance.length > 0 ? "pass" : "warn",
      detail: Array.isArray(rfcConformance) && rfcConformance.length > 0
        ? `Claims: ${(rfcConformance as string[]).join(", ")}.`
        : "No rfcConformance array (recommended).",
    });
  } else {
    checks.push({
      id: "rfc-002-manifest-required-fields",
      label: "RFC-002 · Manifest has issuer.jurisdiction + endpoints.auditRead",
      weight: 10,
      status: "skip",
      detail: "Skipped (manifest fetch failed).",
    });
    checks.push({
      id: "rfc-002-manifest-rfc-conformance",
      label: "RFC-002 · Manifest advertises rfcConformance",
      weight: 5,
      status: "skip",
      detail: "Skipped (manifest fetch failed).",
    });
  }

  // ── 3. Audit-read endpoint ────────────────────────────────────────────────
  let auditUrl: string;
  const endpointsForRead = manifest?.endpoints as Record<string, unknown> | unknown[] | undefined;
  const auditEndpointsForRead = manifest?.auditEndpoints as Record<string, unknown> | undefined;
  const readTemplate =
    (endpointsForRead && !Array.isArray(endpointsForRead)
      ? (endpointsForRead as Record<string, unknown>).auditRead
      : undefined) ??
    auditEndpointsForRead?.auditRead;
  if (typeof readTemplate === "string") {
    auditUrl = readTemplate.replace(
      "{sessionId}",
      encodeURIComponent(targetSession),
    );
  } else {
    auditUrl = `${base}/api/play/audit/${encodeURIComponent(targetSession)}`;
  }
  try {
    const r = await fetchWithTimeout(auditUrl, undefined, timeoutMs, fetchImpl);
    if (r.ok) {
      const payload = (await r.json()) as Record<string, unknown>;
      checks.push({
        id: "rfc-004-audit-read",
        label: "RFC-004 · Audit-read endpoint returns 200 + valid AuditPayload",
        weight: 15,
        status: "pass",
        detail: `entries: ${Array.isArray(payload.entries) ? (payload.entries as unknown[]).length : "n/a"}.`,
        source: auditUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "rfc-004-audit-read",
        label: "RFC-004 · Audit-read endpoint returns 200 + valid AuditPayload",
        weight: 15,
        status: "fail",
        detail: `HTTP ${r.status}.`,
        source: auditUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-004-audit-read",
      label: "RFC-004 · Audit-read endpoint returns 200 + valid AuditPayload",
      weight: 15,
      status: "fail",
      detail: `Network error: ${(e as Error).message}`,
      source: auditUrl,
    });
  }

  // ── 4. Audit verify=1 endpoint ────────────────────────────────────────────
  const verifyUrl = `${auditUrl}${auditUrl.includes("?") ? "&" : "?"}verify=1`;
  try {
    const r = await fetchWithTimeout(verifyUrl, undefined, timeoutMs, fetchImpl);
    if (r.ok) {
      const data = (await r.json()) as Record<string, unknown>;
      const verificationBlock = (data.verification ?? data) as Record<string, unknown>;
      const hasCounts =
        typeof verificationBlock.verified === "number" &&
        typeof verificationBlock.tampered === "number" &&
        typeof verificationBlock.hmacWired === "boolean";
      if (hasCounts) {
        const tampered = verificationBlock.tampered as number;
        const verified = verificationBlock.verified as number;
        const hmacWired = verificationBlock.hmacWired as boolean;
        const total = verified + tampered;
        checks.push({
          id: "rfc-004-audit-verify",
          label: "RFC-004 · Audit-verify endpoint returns verification counts",
          weight: 20,
          status: tampered === 0 && hmacWired ? "pass" : "warn",
          detail: hmacWired
            ? `verified=${verified}/${total}, tampered=${tampered}.`
            : "hmacWired=false (dev mode).",
          source: verifyUrl,
          httpStatus: r.status,
        });
        if (tampered > 0) notes.push(`⚠ ${tampered} tampered entries on session ${targetSession}.`);
        if (!hmacWired) notes.push(`⚠ HMAC secret not wired (production must wire AUDIT_HMAC_SECRET).`);
      } else {
        checks.push({
          id: "rfc-004-audit-verify",
          label: "RFC-004 · Audit-verify endpoint returns verification counts",
          weight: 20,
          status: "warn",
          detail: "Response missing verified/tampered/hmacWired counts.",
          source: verifyUrl,
          httpStatus: r.status,
        });
      }
    } else {
      checks.push({
        id: "rfc-004-audit-verify",
        label: "RFC-004 · Audit-verify endpoint returns verification counts",
        weight: 20,
        status: "fail",
        detail: `HTTP ${r.status}.`,
        source: verifyUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-004-audit-verify",
      label: "RFC-004 · Audit-verify endpoint returns verification counts",
      weight: 20,
      status: "fail",
      detail: `Network error: ${(e as Error).message}`,
      source: verifyUrl,
    });
  }

  // ── 5. CSV export ─────────────────────────────────────────────────────────
  const csvUrl = `${auditUrl}/csv`;
  try {
    const r = await fetchWithTimeout(csvUrl, undefined, timeoutMs, fetchImpl);
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      checks.push({
        id: "rfc-004-audit-csv",
        label: "RFC-004 · CSV export returns text/csv",
        weight: 10,
        status: ct.includes("text/csv") ? "pass" : "warn",
        detail: `Content-Type: ${ct}.`,
        source: csvUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "rfc-004-audit-csv",
        label: "RFC-004 · CSV export returns text/csv",
        weight: 10,
        status: "fail",
        detail: `HTTP ${r.status}.`,
        source: csvUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-004-audit-csv",
      label: "RFC-004 · CSV export returns text/csv",
      weight: 10,
      status: "fail",
      detail: `Network error: ${(e as Error).message}`,
      source: csvUrl,
    });
  }

  // ── 6. OpenAPI ────────────────────────────────────────────────────────────
  const openApiUrl = `${base}/api/openapi`;
  try {
    const r = await fetchWithTimeout(openApiUrl, undefined, timeoutMs, fetchImpl);
    if (r.ok) {
      const data = (await r.json()) as Record<string, unknown>;
      const isOpenApi =
        typeof data.openapi === "string" && (data.openapi as string).startsWith("3.");
      checks.push({
        id: "tooling-openapi",
        label: "Tooling · /api/openapi returns OpenAPI 3.x",
        weight: 10,
        status: isOpenApi ? "pass" : "warn",
        detail: isOpenApi ? `OpenAPI ${data.openapi}.` : "Not an OpenAPI 3.x doc.",
        source: openApiUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "tooling-openapi",
        label: "Tooling · /api/openapi returns OpenAPI 3.x",
        weight: 10,
        status: "skip",
        detail: `Not advertised (HTTP ${r.status}).`,
        source: openApiUrl,
        httpStatus: r.status,
      });
    }
  } catch {
    checks.push({
      id: "tooling-openapi",
      label: "Tooling · /api/openapi returns OpenAPI 3.x",
      weight: 10,
      status: "skip",
      detail: "Not advertised.",
      source: openApiUrl,
    });
  }

  // ── 7. RFC-005 keys endpoint (asymmetric upgrade path) ──────────────────
  const keysUrl = `${base}/.well-known/sociedad-ia/keys`;
  try {
    const r = await fetchWithTimeout(keysUrl, undefined, timeoutMs, fetchImpl);
    if (r.ok) {
      const data = (await r.json()) as Record<string, unknown>;
      const keys = data.keys as unknown[] | undefined;
      const hasKeys = Array.isArray(keys) && keys.length > 0;
      checks.push({
        id: "rfc-005-keys-endpoint",
        label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
        weight: 5,
        status: hasKeys ? "pass" : "warn",
        detail: hasKeys
          ? `${keys.length} key(s) advertised.`
          : "Endpoint responds but no keys advertised.",
        source: keysUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "rfc-005-keys-endpoint",
        label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
        weight: 5,
        status: "skip",
        detail: `Not advertised (HTTP ${r.status}).`,
        source: keysUrl,
        httpStatus: r.status,
      });
    }
  } catch {
    checks.push({
      id: "rfc-005-keys-endpoint",
      label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
      weight: 5,
      status: "skip",
      detail: "Not advertised.",
      source: keysUrl,
    });
  }

  // Score + finalize.
  let earned = 0;
  let possible = 0;
  for (const c of checks) {
    if (c.status === "skip") continue;
    possible += c.weight;
    if (c.status === "pass") earned += c.weight;
    else if (c.status === "warn") earned += c.weight * 0.5;
  }
  const score = possible > 0 ? Math.round((earned / possible) * 100) : 0;
  const rating: Certification["rating"] = possible === 0 ? "N/A" : ratingFromScore(score);

  return {
    $schema: "https://ar-agents.ar/schemas/certification.v1.json",
    generatedAt: new Date().toISOString(),
    target: { baseUrl: base, sessionId },
    score,
    rating,
    rfcConformance: summarizeRfcConformance(checks),
    checks,
    notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: `tsx 26-certify-by-fetch.ts <baseUrl> [sessionId]`
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { argv: string[] } | undefined;

async function main() {
  if (typeof process === "undefined") return;
  const baseUrl = process.argv[2];
  const sessionId = process.argv[3];
  if (!baseUrl) {
    console.error("usage: tsx 26-certify-by-fetch.ts <baseUrl> [sessionId]");
    return;
  }
  const cert = await certifySociedad(baseUrl, { sessionId });
  console.log(JSON.stringify(cert, null, 2));
  // Exit non-zero if score < 60 — useful as a CI gate.
  if (typeof process !== "undefined" && "exit" in process) {
    (process as unknown as { exit: (code: number) => void }).exit(
      cert.score >= 60 ? 0 : 1,
    );
  }
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    if (typeof process !== "undefined" && "exit" in process) {
      (process as unknown as { exit: (code: number) => void }).exit(1);
    }
  });
}
