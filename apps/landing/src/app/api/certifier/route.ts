/**
 * GET /api/certifier?url={baseUrl}&sessionId={optional}
 *
 * Fetches a target sociedad-IA's public endpoints and scores its
 * conformance to RFC-002 (discovery) + RFC-004 (operational log).
 *
 * Returns a JSON report with per-check pass/fail/skip + an aggregate
 * 0-100 score. Designed for journalists, regulators, or developers to
 * paste any URL and get back "yes this is real / no this is bogus" in
 * one HTTP call.
 *
 * Edge runtime. No state. Cached briefly for repeat queries.
 */

import { NextResponse } from "next/server";

export const runtime = "edge";

interface Check {
  id: string;
  label: string;
  weight: number;            // contribution to score, 0-100
  status: "pass" | "fail" | "skip" | "warn";
  detail: string;
  source?: string;           // URL that was fetched
  httpStatus?: number;
}

interface Certification {
  $schema: string;
  generatedAt: string;
  target: { baseUrl: string; sessionId: string | null };
  score: number;             // 0-100
  rating: "A" | "B" | "C" | "D" | "F" | "N/A";
  rfcConformance: {
    "rfc-002-v1": "pass" | "partial" | "fail" | "skip";
    "rfc-004-draft": "pass" | "partial" | "fail" | "skip";
  };
  checks: Check[];
  notes: string[];
}

const SAMPLE_SESSION_ID_FOR_VERIFY = "demo-public-ar-001";
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": "ar-agents-certifier (https://ar-agents.ar/certifier)",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(t);
  }
}

function isValidUrl(u: string): URL | null {
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed;
  } catch {
    return null;
  }
}

function ratingFromScore(score: number): Certification["rating"] {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

async function runChecks(
  baseUrl: string,
  sessionId: string | null,
): Promise<{ checks: Check[]; notes: string[] }> {
  const checks: Check[] = [];
  const notes: string[] = [];
  const base = baseUrl.replace(/\/+$/, "");

  // ── Check 1: /.well-known/agents.json exists + parses ────────────────────
  const wellKnownUrl = `${base}/.well-known/agents.json`;
  let manifest: Record<string, unknown> | null = null;
  try {
    const r = await fetchWithTimeout(wellKnownUrl);
    if (r.ok) {
      const text = await r.text();
      try {
        manifest = JSON.parse(text);
        checks.push({
          id: "rfc-002-well-known-exists",
          label: "RFC-002 · /.well-known/agents.json returns 200 + valid JSON",
          weight: 15,
          status: "pass",
          detail: `Manifest fetched + parsed (${text.length} bytes).`,
          source: wellKnownUrl,
          httpStatus: r.status,
        });
      } catch {
        checks.push({
          id: "rfc-002-well-known-exists",
          label: "RFC-002 · /.well-known/agents.json returns 200 + valid JSON",
          weight: 15,
          status: "fail",
          detail: "Endpoint returned 200 but body is not valid JSON.",
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

  // ── Check 2: manifest has required RFC-002 fields ────────────────────────
  if (manifest) {
    const issuer = manifest.issuer as Record<string, unknown> | undefined;
    const hasIssuerJurisdiction = issuer && typeof issuer.jurisdiction === "string";
    // Support both `endpoints.auditRead` (RFC-002 v1 strict map shape)
    // AND `auditEndpoints.auditRead` (companion-with-agents.md-v1 shape).
    const endpoints = manifest.endpoints as Record<string, unknown> | unknown[] | undefined;
    const auditEndpoints = manifest.auditEndpoints as Record<string, unknown> | undefined;
    const hasAuditReadMap =
      (endpoints && !Array.isArray(endpoints) && typeof (endpoints as Record<string, unknown>).auditRead === "string") ||
      (auditEndpoints && typeof auditEndpoints.auditRead === "string");
    // The auditRead endpoint is only REQUIRED when the manifest claims
    // RFC-004 conformance. A single-library demo that only conforms to
    // RFC-001 + RFC-002 has no audit-log surface to advertise.
    const conformanceArr =
      (manifest.rfcConformance as unknown[] | undefined) ?? [];
    const claimsAuditPath = conformanceArr.some(
      (x) => typeof x === "string" && x.startsWith("rfc-004"),
    );
    if (hasIssuerJurisdiction && (hasAuditReadMap || !claimsAuditPath)) {
      checks.push({
        id: "rfc-002-manifest-required-fields",
        label: "RFC-002 · Manifest has issuer.jurisdiction + auditRead endpoint",
        weight: 10,
        status: "pass",
        detail: hasAuditReadMap
          ? `jurisdiction=${issuer!.jurisdiction}; auditRead present.`
          : `jurisdiction=${issuer!.jurisdiction}; auditRead omitted (manifest doesn't claim RFC-004, so endpoint is optional).`,
      });
    } else {
      checks.push({
        id: "rfc-002-manifest-required-fields",
        label: "RFC-002 · Manifest has issuer.jurisdiction + auditRead endpoint",
        weight: 10,
        status: "fail",
        detail: !hasIssuerJurisdiction
          ? "Missing issuer.jurisdiction."
          : "Missing endpoints.auditRead or auditEndpoints.auditRead (manifest claims RFC-004, so this is required).",
      });
    }

    const rfcConformance = manifest.rfcConformance;
    if (Array.isArray(rfcConformance) && rfcConformance.length > 0) {
      checks.push({
        id: "rfc-002-manifest-rfc-conformance",
        label: "RFC-002 · Manifest advertises rfcConformance",
        weight: 5,
        status: "pass",
        detail: `Claims: ${rfcConformance.join(", ")}.`,
      });
    } else {
      checks.push({
        id: "rfc-002-manifest-rfc-conformance",
        label: "RFC-002 · Manifest advertises rfcConformance",
        weight: 5,
        status: "warn",
        detail: "No rfcConformance array in manifest (recommended).",
      });
    }
  } else {
    checks.push({
      id: "rfc-002-manifest-required-fields",
      label: "RFC-002 · Manifest has issuer.jurisdiction + endpoints.auditRead",
      weight: 10,
      status: "skip",
      detail: "Skipped because manifest fetch failed.",
    });
    checks.push({
      id: "rfc-002-manifest-rfc-conformance",
      label: "RFC-002 · Manifest advertises rfcConformance",
      weight: 5,
      status: "skip",
      detail: "Skipped because manifest fetch failed.",
    });
  }

  // Determine which RFCs the manifest claims conformance to.
  // If the manifest doesn't claim an RFC, the related checks SKIP
  // instead of FAIL, we don't penalize an operator for not claiming
  // something they didn't claim.
  const rfcConformanceArr = (manifest?.rfcConformance as unknown[] | undefined) ?? [];
  const claimsRfc = (prefix: string): boolean =>
    rfcConformanceArr.some(
      (x) => typeof x === "string" && x.startsWith(prefix),
    );
  const claimsRfc004 = claimsRfc("rfc-004");
  const claimsRfc005 = claimsRfc("rfc-005");
  // RFC-002 is implicit: the manifest itself is the RFC-002 product, so
  // any successful manifest fetch counts as a RFC-002 claim.

  // ── Check 3: audit endpoint responds for the sample sessionId ────────────
  const targetSession = sessionId ?? SAMPLE_SESSION_ID_FOR_VERIFY;
  // Prefer manifest-advertised URL; fall back to default /api/play/audit/{id}.
  // Accept either endpoints.auditRead (RFC-002 v1 map) or auditEndpoints.auditRead.
  let auditUrl: string;
  const endpointsForRead = manifest?.endpoints as Record<string, unknown> | unknown[] | undefined;
  const auditEndpointsForRead = manifest?.auditEndpoints as Record<string, unknown> | undefined;
  const auditReadTemplate =
    (endpointsForRead && !Array.isArray(endpointsForRead)
      ? (endpointsForRead as Record<string, unknown>).auditRead
      : undefined) ??
    auditEndpointsForRead?.auditRead;
  if (typeof auditReadTemplate === "string") {
    auditUrl = auditReadTemplate.replace("{sessionId}", encodeURIComponent(targetSession));
  } else {
    auditUrl = `${base}/api/play/audit/${encodeURIComponent(targetSession)}`;
  }
  let auditPayload: Record<string, unknown> | null = null;
  try {
    const r = await fetchWithTimeout(auditUrl);
    if (r.ok) {
      auditPayload = await r.json();
      checks.push({
        id: "rfc-004-audit-read",
        label: "RFC-004 · Audit-read endpoint returns 200 + valid AuditPayload",
        weight: 15,
        status: "pass",
        detail: `entries: ${Array.isArray(auditPayload?.entries) ? (auditPayload!.entries as unknown[]).length : "n/a"}.`,
        source: auditUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "rfc-004-audit-read",
        label: "RFC-004 · Audit-read endpoint returns 200 + valid AuditPayload",
        weight: 15,
        status: claimsRfc004 ? "fail" : "skip",
        detail: claimsRfc004
          ? `HTTP ${r.status}.`
          : `HTTP ${r.status}, manifest does not claim RFC-004 conformance, so this check is skipped.`,
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

  // ── Check 4: audit verify=1 endpoint returns verification counts ─────────
  const verifyUrl = `${auditUrl}${auditUrl.includes("?") ? "&" : "?"}verify=1`;
  try {
    const r = await fetchWithTimeout(verifyUrl);
    if (r.ok) {
      const data = (await r.json()) as Record<string, unknown>;
      // Counts may be at top level OR nested under `verification`.
      const verificationBlock = (data.verification ?? data) as Record<string, unknown>;
      const hasCounts =
        typeof verificationBlock.verified === "number" &&
        typeof verificationBlock.tampered === "number" &&
        typeof verificationBlock.hmacWired === "boolean";
      if (hasCounts) {
        const tampered = verificationBlock.tampered as number;
        const verified = verificationBlock.verified as number;
        const hmacWired = verificationBlock.hmacWired as boolean;
        const total = verified + tampered || 0;
        checks.push({
          id: "rfc-004-audit-verify",
          label: "RFC-004 · Audit-verify endpoint returns verification counts",
          weight: 20,
          status: tampered === 0 && hmacWired ? "pass" : (hmacWired ? "warn" : "warn"),
          detail: hmacWired
            ? `verified=${verified}/${total}, tampered=${tampered}.`
            : `hmacWired=false (dev mode; production must wire AUDIT_HMAC_SECRET).`,
          source: verifyUrl,
          httpStatus: r.status,
        });
        if (tampered > 0) notes.push(`⚠ ${tampered} tampered entries detected on session ${targetSession}.`);
        if (!hmacWired) notes.push(`⚠ HMAC secret not wired on target (production sociedades must have AUDIT_HMAC_SECRET).`);
      } else {
        checks.push({
          id: "rfc-004-audit-verify",
          label: "RFC-004 · Audit-verify endpoint returns verification counts",
          weight: 20,
          status: "warn",
          detail: "Endpoint responded but didn't include verified/tampered/hmacWired counts.",
          source: verifyUrl,
          httpStatus: r.status,
        });
      }
    } else {
      checks.push({
        id: "rfc-004-audit-verify",
        label: "RFC-004 · Audit-verify endpoint returns verification counts",
        weight: 20,
        status: claimsRfc004 ? "fail" : "skip",
        detail: claimsRfc004
          ? `HTTP ${r.status}.`
          : `HTTP ${r.status}, manifest does not claim RFC-004 conformance, so this check is skipped.`,
        source: verifyUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-004-audit-verify",
      label: "RFC-004 · Audit-verify endpoint returns verification counts",
      weight: 20,
      status: claimsRfc004 ? "fail" : "skip",
      detail: claimsRfc004
        ? `Network error: ${(e as Error).message}`
        : `Network error, manifest does not claim RFC-004 conformance, so this check is skipped.`,
      source: verifyUrl,
    });
  }

  // ── Check 5: CSV export endpoint ────────────────────────────────────────
  const csvUrl = `${auditUrl}/csv`;
  try {
    const r = await fetchWithTimeout(csvUrl);
    if (r.ok) {
      const ct = r.headers.get("content-type") || "";
      const isCSV = ct.includes("text/csv");
      checks.push({
        id: "rfc-004-audit-csv",
        label: "RFC-004 · CSV export endpoint returns text/csv",
        weight: 10,
        status: isCSV ? "pass" : "warn",
        detail: isCSV ? `Content-Type: ${ct}.` : `Endpoint returned 200 but Content-Type is ${ct} (expected text/csv).`,
        source: csvUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "rfc-004-audit-csv",
        label: "RFC-004 · CSV export endpoint returns text/csv",
        weight: 10,
        status: claimsRfc004 ? "fail" : "skip",
        detail: claimsRfc004
          ? `HTTP ${r.status}.`
          : `HTTP ${r.status}, manifest does not claim RFC-004 conformance, so this check is skipped.`,
        source: csvUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-004-audit-csv",
      label: "RFC-004 · CSV export endpoint returns text/csv",
      weight: 10,
      status: claimsRfc004 ? "fail" : "skip",
      detail: claimsRfc004
        ? `Network error: ${(e as Error).message}`
        : `Network error, manifest does not claim RFC-004 conformance, so this check is skipped.`,
      source: csvUrl,
    });
  }

  // ── Check 6: OpenAPI discoverability ─────────────────────────────────────
  const openApiUrl = `${base}/api/openapi`;
  try {
    const r = await fetchWithTimeout(openApiUrl);
    if (r.ok) {
      const data = await r.json() as Record<string, unknown>;
      const isOpenApi = typeof data.openapi === "string" && (data.openapi as string).startsWith("3.");
      checks.push({
        id: "tooling-openapi",
        label: "Tooling · /api/openapi returns OpenAPI 3.x spec",
        weight: 10,
        status: isOpenApi ? "pass" : "warn",
        detail: isOpenApi ? `OpenAPI ${data.openapi}.` : "Endpoint returned 200 but doesn't look like an OpenAPI 3.x doc.",
        source: openApiUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "tooling-openapi",
        label: "Tooling · /api/openapi returns OpenAPI 3.x spec",
        weight: 10,
        status: "skip",
        detail: `Not advertised (HTTP ${r.status}). Recommended for tooling.`,
        source: openApiUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "tooling-openapi",
      label: "Tooling · /api/openapi returns OpenAPI 3.x spec",
      weight: 10,
      status: "skip",
      detail: `Not advertised: ${(e as Error).message}.`,
      source: openApiUrl,
    });
  }

  // ── Check 7a: RFC-005 keys endpoint (asymmetric upgrade path) ─────────────
  // Try /keys (route handler, RFC-005 § 4 canonical path) THEN /keys.json
  // (static-file fallback for sites serving via Vercel public/).
  const keysCanonical = `${base}/.well-known/sociedad-ia/keys`;
  const keysStatic = `${keysCanonical}.json`;
  let keysCheckDone = false;
  for (const url of [keysCanonical, keysStatic]) {
    if (keysCheckDone) break;
    try {
      const r = await fetchWithTimeout(url);
      if (!r.ok) {
        if (url === keysStatic) {
          // Both tried, both failed, emit a single skip.
          checks.push({
            id: "rfc-005-keys-endpoint",
            label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
            weight: 5,
            status: "skip",
            detail: `Not advertised (HTTP ${r.status} on both /keys and /keys.json). v1 HMAC-only is OK; v2 asymmetric is the migration path per RFC-005.`,
            source: keysCanonical,
            httpStatus: r.status,
          });
          keysCheckDone = true;
        }
        continue;
      }
      try {
        const data = (await r.json()) as Record<string, unknown>;
        const keys = data.keys as unknown[] | undefined;
        const hasKeys = Array.isArray(keys) && keys.length > 0;
        checks.push({
          id: "rfc-005-keys-endpoint",
          label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
          weight: 5,
          status: hasKeys ? "pass" : "warn",
          detail: hasKeys
            ? `${keys.length} key(s) advertised (asymmetric upgrade path ready).`
            : "Endpoint responds but no keys advertised.",
          source: url,
          httpStatus: r.status,
        });
        keysCheckDone = true;
      } catch {
        // Body wasn't JSON; treat as warn.
        checks.push({
          id: "rfc-005-keys-endpoint",
          label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
          weight: 5,
          status: "warn",
          detail: "Endpoint responds but body is not valid JSON.",
          source: url,
          httpStatus: r.status,
        });
        keysCheckDone = true;
      }
    } catch (e) {
      if (url === keysStatic) {
        checks.push({
          id: "rfc-005-keys-endpoint",
          label: "RFC-005 · /.well-known/sociedad-ia/keys advertises Ed25519 public keys",
          weight: 5,
          status: "skip",
          detail: `Not advertised: ${(e as Error).message}.`,
          source: keysCanonical,
        });
        keysCheckDone = true;
      }
    }
  }

  // ── Check 7: Discovery endpoint (RFC-002 alt path) ──────────────────────
  const discoveryUrl = `${base}/api/discovery`;
  try {
    const r = await fetchWithTimeout(discoveryUrl);
    if (r.ok) {
      checks.push({
        id: "rfc-002-discovery-api",
        label: "RFC-002 · /api/discovery responds (alt discovery path)",
        weight: 5,
        status: "pass",
        detail: "Discovery API responds.",
        source: discoveryUrl,
        httpStatus: r.status,
      });
    } else {
      checks.push({
        id: "rfc-002-discovery-api",
        label: "RFC-002 · /api/discovery responds (alt discovery path)",
        weight: 5,
        status: "skip",
        detail: `Not advertised (HTTP ${r.status}). Optional; manifest is primary.`,
        source: discoveryUrl,
        httpStatus: r.status,
      });
    }
  } catch (e) {
    checks.push({
      id: "rfc-002-discovery-api",
      label: "RFC-002 · /api/discovery responds (alt discovery path)",
      weight: 5,
      status: "skip",
      detail: `Not advertised: ${(e as Error).message}.`,
      source: discoveryUrl,
    });
  }

  // ── Check 8: Security headers ────────────────────────────────────────────
  try {
    const r = await fetchWithTimeout(base);
    const hsts = r.headers.get("strict-transport-security");
    const xcto = r.headers.get("x-content-type-options");
    const hasHsts = hsts !== null;
    const hasXcto = xcto !== null;
    checks.push({
      id: "security-headers",
      label: "Security · HSTS + X-Content-Type-Options present on root response",
      weight: 5,
      status: hasHsts && hasXcto ? "pass" : (hasHsts || hasXcto ? "warn" : "fail"),
      detail: `HSTS: ${hasHsts ? "✓" : "✗"} · X-Content-Type-Options: ${hasXcto ? "✓" : "✗"}.`,
      source: base,
    });
  } catch (e) {
    checks.push({
      id: "security-headers",
      label: "Security · HSTS + X-Content-Type-Options present on root response",
      weight: 5,
      status: "fail",
      detail: `Could not fetch root: ${(e as Error).message}`,
      source: base,
    });
  }

  // ── Check 9: Sitemap ────────────────────────────────────────────────────
  const sitemapUrl = `${base}/sitemap.xml`;
  try {
    const r = await fetchWithTimeout(sitemapUrl);
    checks.push({
      id: "tooling-sitemap",
      label: "Tooling · sitemap.xml present",
      weight: 5,
      status: r.ok ? "pass" : "skip",
      detail: r.ok ? "Sitemap present." : `Not advertised (HTTP ${r.status}).`,
      source: sitemapUrl,
      httpStatus: r.status,
    });
  } catch {
    checks.push({
      id: "tooling-sitemap",
      label: "Tooling · sitemap.xml present",
      weight: 5,
      status: "skip",
      detail: "Sitemap not advertised.",
      source: sitemapUrl,
    });
  }

  return { checks, notes };
}

function summarizeRfcConformance(
  checks: Check[],
): Certification["rfcConformance"] {
  const rfc002Checks = checks.filter((c) => c.id.startsWith("rfc-002"));
  const rfc004Checks = checks.filter((c) => c.id.startsWith("rfc-004"));

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
    "rfc-002-v1": status(rfc002Checks),
    "rfc-004-draft": status(rfc004Checks),
  };
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const url = (searchParams.get("url") || "").trim();
  const sessionId = (searchParams.get("sessionId") || "").trim() || null;

  if (!url) {
    return NextResponse.json(
      { error: "Missing required query parameter: url" },
      { status: 400 },
    );
  }

  const parsed = isValidUrl(url);
  if (!parsed) {
    return NextResponse.json(
      { error: "Invalid URL. Must be http:// or https://." },
      { status: 400 },
    );
  }

  const { checks, notes } = await runChecks(parsed.origin, sessionId);

  // Score = sum of weight where status == pass, half-weight for warn.
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

  const cert: Certification = {
    $schema: "https://ar-agents.ar/schemas/certification.v1.json",
    generatedAt: new Date().toISOString(),
    target: { baseUrl: parsed.origin, sessionId },
    score,
    rating,
    rfcConformance: summarizeRfcConformance(checks),
    checks,
    notes,
  };

  return NextResponse.json(cert, {
    headers: {
      "cache-control": "public, max-age=60, stale-while-revalidate=300",
      "content-type": "application/json; charset=utf-8",
    },
  });
}
