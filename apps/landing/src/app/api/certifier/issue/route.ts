/**
 * POST /api/certifier/issue
 *
 * Mint a SIGNED, listed, revocable Certificate for a registry-listed URL.
 *
 * Body (JSON): { url, registryId, sessionId?, operator?, jurisdiction?, ttlDays? }
 * Auth: the registry-owner capability token (kind "registry-owner", prefix "rgo")
 *       for `registryId`, presented in `x-registry-token`. So ONLY the listed
 *       operator can mint a cert for their own entry — this gates cert spam and
 *       keeps the registry's good-standing signal trustworthy (the whole moat).
 *
 * Flow:
 *   1. rateLimit + kvRateLimit(failClosed) — this mints a durable KV record +
 *      fans out the certifier's ~11 server-side fetches, so it's abuse-attractive.
 *   2. safeExternalUrl(url) — SSRF guard before any server-side fetch.
 *   3. verifyCapabilityToken("registry-owner", registryId, x-registry-token).
 *   4. Run the certifier server-side against the URL; refuse below MIN_RATING (C).
 *   5. issueCertificate → returns the signed cert + its dereferenceable public URL.
 *
 * nodejs runtime (headroom for token mint/verify + multi-fetch, like
 * conformance-history + the auditor money loop).
 */

import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit, kvRateLimit } from "@/lib/ratelimit";
import { safeExternalUrl } from "@/lib/ssrf";
import { verifyCapabilityToken } from "@/lib/capability-token";
import { getRecord, urlOrigin } from "@/lib/registry-store";
import {
  issueCertificate,
  type CertReportSummary,
  type CertRating,
} from "@/lib/certificate";

export const runtime = "nodejs";

const SITE = "https://ar-agents.ar";

/** The registry-owner capability-token kind/prefix (the registry agent MINTS it;
 * here we only VERIFY it). */
const REGISTRY_OWNER_KIND = "registry-owner";

interface CertifierResult {
  score?: number;
  rating?: CertRating;
  rfcConformance?: CertReportSummary["rfcConformance"];
}

async function runCertifier(origin: string): Promise<CertReportSummary | null> {
  try {
    const r = await fetch(`${SITE}/api/certifier?url=${encodeURIComponent(origin)}`, {
      signal: AbortSignal.timeout(11000),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as CertifierResult;
    if (typeof data.score !== "number" || !data.rating || !data.rfcConformance) return null;
    return { score: data.score, rating: data.rating, rfcConformance: data.rfcConformance };
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  // In-memory damp first (zero KV cost), then a durable cross-isolate quota that
  // FAILS CLOSED — a KV outage must not wave through an unbounded flood of signed,
  // permanent certs.
  if (!rateLimit("certifier-issue", ip, 6, 60_000)) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("certifier-issue", ip, 12, 3600, { failClosed: true }))) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }

  let body: {
    url?: unknown;
    registryId?: unknown;
    ttlDays?: unknown;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 });
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const registryId = typeof body.registryId === "string" ? body.registryId.trim() : "";
  const ttlDays =
    typeof body.ttlDays === "number" && Number.isFinite(body.ttlDays) ? body.ttlDays : undefined;
  // NOTE: operator/jurisdiction/baseUrl are deliberately NOT read from the body.
  // They are sourced from the OWNED registry record (see below) so a caller can
  // never stamp a cert with a subject identity they don't own.

  if (!url) return jsonCors({ error: "missing_url" }, { status: 400 });
  if (!registryId) return jsonCors({ error: "missing_registryId" }, { status: 400 });

  const parsed = safeExternalUrl(url);
  if (!parsed) {
    return jsonCors({ error: "invalid_url", note: "Must be a public http(s) URL." }, { status: 400 });
  }

  // Owner auth: the registry-owner token for THIS registry entry. Knowing the
  // registryId is not enough — possession of the write-once token is required.
  const token = req.headers.get("x-registry-token")?.trim() ?? "";
  if (!token) return jsonCors({ error: "missing_token" }, { status: 401 });
  const authed = await verifyCapabilityToken(REGISTRY_OWNER_KIND, registryId, token);
  if (!authed) return jsonCors({ error: "unauthorized" }, { status: 403 });

  // URL-OWNERSHIP BIND (the whole moat): a valid owner token for registryId X
  // must NOT let the holder mint a signed cert for an arbitrary URL. The cert's
  // URL must be the URL of the OWNED entry. We load the record, require it to
  // have a real publicUrl, and require url's origin to equal the record's origin.
  // Then we source every subject identity field FROM THE RECORD, never the body.
  const rec = await getRecord(registryId);
  if (!rec) return jsonCors({ error: "registry_not_found" }, { status: 404 });
  const recordOrigin = rec.publicUrl && rec.publicUrl !== "-" ? urlOrigin(rec.publicUrl) : null;
  if (!recordOrigin) {
    return jsonCors(
      { error: "url_not_owned", note: "registry entry has no certifiable public URL" },
      { status: 403 },
    );
  }
  if (recordOrigin !== parsed.origin) {
    return jsonCors(
      {
        error: "url_not_owned",
        note: "url must match the registry entry's own publicUrl origin",
      },
      { status: 403 },
    );
  }

  // Certify the OWNED origin (recordOrigin === parsed.origin here).
  const report = await runCertifier(recordOrigin);
  if (!report) {
    return jsonCors(
      { error: "certifier_failed", note: "Could not score the target URL." },
      { status: 502 },
    );
  }

  const result = await issueCertificate({
    baseUrl: recordOrigin,
    report,
    registryId,
    // Subject identity is taken from the OWNED record, not caller-supplied body.
    operator: rec.operator && rec.operator !== "-" ? rec.operator : undefined,
    jurisdiction: rec.jurisdiction || undefined,
    ttlDays,
  });

  if (!result.ok) {
    if (result.error === "below_min_rating") {
      return jsonCors(
        { error: "below_min_rating", detail: result.detail, report },
        { status: 422 },
      );
    }
    if (result.error === "signing_unavailable") {
      return jsonCors({ error: "signing_unavailable" }, { status: 503 });
    }
    return jsonCors({ error: result.error, detail: result.detail }, { status: 503 });
  }

  return jsonCors(
    { certificate: result.certificate, url: result.url },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

export async function OPTIONS() {
  return preflight();
}
