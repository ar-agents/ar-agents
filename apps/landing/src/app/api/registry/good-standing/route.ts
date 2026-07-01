/**
 * GET /api/registry/good-standing?url={baseUrl} | ?id={slug} | ?cuit={cuit}
 *
 * THE Sprint-2 deliverable: the PUBLIC, trust-minimized good-standing ORACLE a
 * counterparty (bank, PSP, marketplace, agent framework) calls BEFORE
 * transacting with an Argentine automated company.
 *
 * Returns a SMALL, cacheable, Ed25519-signed answer. The signed `body` is
 * offline-verifiable with the SAME `arg-verify attestation` verb that already
 * exists (it verifies any `{ body, sig, publicKey }` document where
 * sig = Ed25519(canonical(body)), publicKey = standard-base64 SPKI) — we mirror
 * lib/attestation.ts's primitives exactly so no new verifier code is needed.
 *
 * HONEST SCOPE (CAPTURE-TRANSFORMATION tesis #2): the ar-agents Ed25519
 * signature on this answer is CONVENIENCE — it proves the answer came from this
 * registry unmodified, nothing more. The LOAD-BEARING trust-minimization is the
 * TARGET's OWN publicly-anchored attestation + the witness anchor chain, which
 * this oracle FORWARDS as pointers (anchor.ots over Bitcoin, no ar-agents key in
 * that path). A caller who refuses to trust an AR key follows the forwarded
 * pointers and verifies the public anchor independently.
 *
 * Default: serves the STORED goodStanding (cacheable). `?fresh=1` re-runs the
 * certifier (harder rate-limit) and persists the new verdict before answering.
 *
 * Edge runtime. CORS-open so any browser-context agent / cross-origin dashboard
 * can read it.
 */

import { preflight, CORS_HEADERS } from "@/lib/cors";
import { clientIp, rateLimit, kvRateLimit } from "@/lib/ratelimit";
import { recordShadow } from "@/lib/shadow";
import { safeExternalUrl } from "@/lib/ssrf";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import { verifyCapabilityToken } from "@/lib/capability-token";
import {
  getRecord,
  getRecordByUrl,
  listRecords,
  setGoodStanding,
  urlOrigin,
  hasAuthoritativeCuit,
  type RegistryRecord,
  type Rating,
  type GoodStandingState,
} from "@/lib/registry-store";
import { scoreEntry, type ScoreResult } from "@/lib/good-standing-score";
import { incidentSummary } from "@/lib/registry-incidents";
import { recordHistoryPoint } from "@/lib/registry-history";
import { getUboStatus } from "@/lib/ubo";

export const runtime = "edge";

const SITE = "https://ar-agents.ar";
const PUBLIC_KEY_URL = `${SITE}/.well-known/sociedad-ia/keys`;
const KEY_ID = "ar-agents-ref-2026-05";
const OWNER_KIND = "registry-owner";

/** The honest scope of the good-standing verdict, carried INSIDE the signed body
 * so the caveat travels with the offline-verifiable artifact (no overclaim). */
const GOOD_STANDING_BASIS =
  "automated conformance of self-declared endpoints; not a solvency, identity, or fraud judgement";

/**
 * NON-ATTESTING basis for a registry entry that exists but is NOT good-standing:
 *  - `forming`: a stub minted at the entity's birth; the entity is not yet
 *    operative, so the oracle must NOT present it as good-standing.
 *  - `stale`: a `forming` entry the garbage collector flipped after a long stall.
 * The oracle still answers found:true (the entity IS in the registry), but the
 * goodStanding block is explicitly non-attesting and its `state` is NEVER "active".
 */
const FORMING_BASIS =
  "registry stub created at incorporation; entity in formation, not yet operative — NOT a good-standing attestation";
const STALE_BASIS =
  "stalled formation (no formation progress past the staleness threshold); not operative — NOT a good-standing attestation";

/** Whether a record's registry status is non-attesting (in/abandoned formation). */
function isNonAttestingStatus(status: string): boolean {
  return status === "forming" || status === "stale";
}

/** Don't re-run the certifier if it ran within this window (coalesce ?fresh=1). */
const FRESH_COALESCE_MS = 5 * 60 * 1000;

/**
 * Owner/admin gate for the PERSISTING re-certify. Anonymous callers may compute
 * a fresh verdict but must NOT persist it. Returns true when the request proves
 * either the per-entry owner token OR the global REGISTRY_ADMIN_TOKEN (constant
 * -time; fail-closed when the admin env is unset).
 */
async function mayPersistFresh(req: Request, rec: RegistryRecord | null): Promise<boolean> {
  // Global admin override.
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (configured) {
    const presented =
      req.headers.get("x-admin-token")?.trim() ||
      (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (presented && (await constantTimeEqual(presented, configured))) return true;
  }
  // Per-entry owner token.
  if (rec) {
    const ownerToken = req.headers.get("x-registry-token")?.trim() ?? "";
    if (ownerToken && (await verifyCapabilityToken(OWNER_KIND, rec.id, ownerToken))) return true;
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Canonical JSON + Ed25519 — byte-identical to lib/attestation.ts (canonical006)
// and the `attestation` verb in public/arg-verify.mjs: keys sorted at every
// level, sig over canonical(body) as STANDARD base64, publicKey STANDARD base64
// SPKI. Inlined (not imported) so this edge route stays self-contained and the
// signed material exactly matches what the offline verifier recomputes.
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

function canonical(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) {
      throw new TypeError(`canonical: non-finite number out of domain: ${value}`);
    }
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") {
    throw new TypeError(`canonical: ${t} is out of domain: not a JSON value`);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonical(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

function b64urlToBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 ? 4 - (b64.length % 4) : 0;
  const bin = atob(b64 + "=".repeat(pad));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  return buf;
}

const privCache: { key: CryptoKey | null; pkcs8: string | null } = { key: null, pkcs8: null };

async function privateKey(): Promise<CryptoKey | null> {
  const pkcs8 = process.env.AUDIT_ED25519_PRIVATE_KEY?.trim();
  if (!pkcs8) return null;
  if (privCache.key && privCache.pkcs8 === pkcs8) return privCache.key;
  try {
    const key = await crypto.subtle.importKey(
      "pkcs8",
      toArrayBuffer(b64urlToBytes(pkcs8)),
      { name: "Ed25519" } as unknown as AlgorithmIdentifier,
      false,
      ["sign"],
    );
    privCache.key = key;
    privCache.pkcs8 = pkcs8;
    return key;
  } catch {
    return null;
  }
}

/** SPKI public key as STANDARD base64 (arg-verify reads it with base64). */
function publicKeyB64(): string | null {
  const spki = process.env.AUDIT_ED25519_PUBLIC_KEY?.trim();
  if (!spki) return null;
  try {
    return bytesToB64(b64urlToBytes(spki));
  } catch {
    return null;
  }
}

/** Sign a body with the audit key. Returns null when no key is configured. */
async function signBody(
  body: unknown,
): Promise<{ sig: string; publicKey: string; alg: "Ed25519" } | null> {
  const key = await privateKey();
  const pub = publicKeyB64();
  if (!key || !pub) return null;
  const sigBytes = await crypto.subtle.sign(
    { name: "Ed25519" } as unknown as AlgorithmIdentifier,
    key,
    enc.encode(canonical(body)),
  );
  return { sig: bytesToB64(new Uint8Array(sigBytes)), publicKey: pub, alg: "Ed25519" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Certifier (re-run on ?fresh=1)
// ─────────────────────────────────────────────────────────────────────────────

async function runCertifier(
  origin: string,
): Promise<{ score: number; rating: Rating } | null> {
  try {
    const r = await fetch(`${SITE}/api/certifier?url=${encodeURIComponent(origin)}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) return null;
    const d = (await r.json()) as { score?: number; rating?: Rating };
    if (typeof d.score !== "number" || !d.rating) return null;
    return { score: d.score, rating: d.rating };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CUIT normalization (digits only)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeCuit(c: string): string {
  return c.replace(/\D/g, "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Answer assembly
// ─────────────────────────────────────────────────────────────────────────────

interface OracleQuery {
  url?: string;
  id?: string;
  cuit?: string;
  fresh: boolean;
}

/**
 * The signed body. Trust-minimized: it carries the verdict + FORWARDS the
 * target's own attestation/anchor pointers so the caller can verify the public
 * anchor without trusting ar-agents. Kept SMALL + sorted-key-stable for caching.
 */
interface AnswerBody {
  kind: "ar-agents.registry.good-standing";
  version: 1;
  issuedAt: string;
  query: { by: "url" | "id" | "cuit"; value: string };
  found: boolean;
  record: {
    id: string;
    name: string;
    jurisdiction: string;
    operator: string;
    /** AUTHORITATIVE CUIT — present ONLY for seed/verified entries (the trust
     * claim). A self-declared CUIT is NEVER here; it lives in selfDeclaredCuit. */
    operatorCuit?: string;
    /** SELF-DECLARED, UNPROVEN CUIT for a self-listed entry. OUTSIDE the trust
     * claim: a counterparty must treat it as a hint, not an identity assertion. */
    selfDeclaredCuit?: string;
    publicUrl: string;
    type: string;
    status: string;
  } | null;
  goodStanding: {
    state: string;
    asOf: string | null;
    score: number | null;
    rating: Rating | null;
    /** The honest scope of this verdict — travels with the signed artifact. */
    basis: string;
    /**
     * ADDITIVE (forming/stale): false when the entry exists but is NOT a
     * good-standing attestation (in formation / stalled). Present only on
     * non-attesting answers, so existing answers' canonical bytes are unchanged.
     * A counterparty MUST treat `attesting:false` as "not bankable".
     */
    attesting?: boolean;
    reason?: string;
    /**
     * ADDITIVE (Registry hardening): the dimensional breakdown of the verdict
     * (conformance / freshness / liveness / incidents) + the weighted composite.
     * Present ONLY for an ATTESTING found entry; omitted for not-found / non-
     * attesting answers so their canonical bytes are unchanged. The flat `score`
     * above stays the endpoint-conformance HEADLINE (backward compat);
     * `dimensionalScore` is the richer composite a sophisticated counterparty reads.
     */
    dimensions?: ScoreResult["dimensions"];
    dimensionalScore?: number | null;
    dimensionalRating?: Rating | null;
  } | null;
  /**
   * ADDITIVE (UBO): PII-FREE ultimate-beneficial-owner status a bank/PSP reads
   * before transacting. Presence + trust level + method + whether the entity is
   * `bankable`. NEVER carries the controller's name or gov id (those live only on
   * authenticated surfaces). Present only when the entity has a UBO on file.
   */
  ubo?: {
    present: boolean;
    level: number | null;
    method: string | null;
    verifiedAt: string | null;
    bankable: boolean;
  };
  /**
   * ADDITIVE (rail posture): the entity's PII-FREE USD-rail posture (which USD
   * rail it settles in + OUSD/yield enablement). Present only when set, so existing
   * answers' canonical bytes are unchanged. NEVER carries amounts or addresses.
   */
  railPosture?: {
    usdRail?: "ousd" | "usdc" | "other" | null;
    ousdEnabled?: boolean;
    yieldEnabled?: boolean;
    asOf?: string;
  };
  /**
   * ADDITIVE (key posture): the entity's PII-FREE key-control posture (custodial vs
   * ubo_controlled). Present only when set, so existing answers' canonical bytes are
   * unchanged. NEVER carries key material.
   */
  keyPosture?: {
    mode?: "custodial" | "ubo_controlled";
    asOf?: string;
  };
  /**
   * Forwarded trust-minimized anchors. These point at the TARGET's own publicly
   * -anchored attestation + the witness chain — the load-bearing trust, NOT this
   * registry's signature. When the target advertises no anchor, these resolve
   * to the reference implementation's anchor surface.
   */
  attestation: {
    note: string;
    targetAttestation: string | null;
    publicAnchor: string;
    publicAnchorOts: string;
    publicKeyUrl: string;
    keyId: string;
  };
}

function buildRecordSummary(rec: RegistryRecord): AnswerBody["record"] {
  const out: NonNullable<AnswerBody["record"]> = {
    id: rec.id,
    name: rec.name,
    jurisdiction: rec.jurisdiction,
    operator: rec.operator,
    publicUrl: rec.publicUrl,
    type: rec.type,
    status: rec.status,
  };
  // CUIT impersonation guard: a self-declared CUIT (self-listed entry) is NEVER
  // presented as authoritative in the signed answer. Only a seed/verified CUIT
  // goes in operatorCuit (the trust claim); a self-declared one is surfaced in
  // selfDeclaredCuit, clearly OUTSIDE the trust claim.
  if (rec.operatorCuit) {
    if (hasAuthoritativeCuit(rec)) out.operatorCuit = rec.operatorCuit;
    else out.selfDeclaredCuit = rec.operatorCuit;
  }
  return out;
}

function buildAttestationPointers(
  rec: RegistryRecord | null,
  targetAdvertisesAnchor: boolean,
): AnswerBody["attestation"] {
  // FIX 9: only FORWARD a target-owned anchor pointer when the target's OWN
  // /.well-known/agents.json actually advertises an audit/anchor endpoint. If it
  // does NOT, we must NOT fabricate `<origin>/api/audit/anchor` — that origin may
  // 404, and presenting ar-agents' OWN anchor as the subject's trust-minimized
  // root would be a misrepresentation. In that case targetAttestation is null and
  // we say so explicitly; the ar-agents signature is then the only thing on offer
  // (a convenience signature, NOT a trust-minimized subject anchor).
  const origin = rec ? urlOrigin(rec.publicUrl) : null;
  const targetBase = origin && origin !== "null" ? origin : null;
  const haveTargetAnchor = Boolean(targetBase) && targetAdvertisesAnchor;
  const note = haveTargetAnchor
    ? "The ar-agents Ed25519 signature on this answer is convenience (it proves this registry returned this body unmodified). The load-bearing trust-minimization is the target's OWN publicly-anchored attestation + the witness anchor chain below: fetch the raw .ots and run `ots verify` against Bitcoin — no ar-agents key is in that trust path."
    : "The target advertises no independent audit/anchor endpoint; only the ar-agents convenience signature applies (it proves this registry returned this body unmodified — it is NOT a trust-minimized subject anchor). The publicAnchor below is ar-agents' OWN witness chain, not the subject's; do not treat it as the subject's independent root.";
  return {
    note,
    targetAttestation: haveTargetAnchor ? `${targetBase}/api/audit/anchor` : null,
    publicAnchor: `${SITE}/api/audit/anchor`,
    publicAnchorOts: `${SITE}/api/audit/anchor/{seq}/ots`,
    publicKeyUrl: PUBLIC_KEY_URL,
    keyId: KEY_ID,
  };
}

/**
 * Best-effort probe of the target's /.well-known/agents.json for an advertised
 * audit/anchor endpoint (FIX 9). SSRF-guarded, short timeout, fails to `false`
 * on any error. Mirrors the certifier's manifest-shape detection (endpoints.
 * auditRead | auditEndpoints.auditRead | an explicit anchor/attestation field).
 */
async function targetAdvertisesAnchor(origin: string): Promise<boolean> {
  const safe = safeExternalUrl(origin);
  if (!safe) return false;
  try {
    const r = await fetch(`${safe.origin}/.well-known/agents.json`, {
      headers: { "user-agent": "ar-agents-good-standing-oracle (https://ar-agents.ar)" },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) return false;
    const m = (await r.json()) as Record<string, unknown>;
    const endpoints = m.endpoints as Record<string, unknown> | undefined;
    const auditEndpoints = m.auditEndpoints as Record<string, unknown> | undefined;
    const hasAuditRead =
      (endpoints && !Array.isArray(endpoints) && typeof endpoints.auditRead === "string") ||
      (auditEndpoints && typeof auditEndpoints.auditRead === "string");
    const hasAnchor =
      typeof (m.anchor ?? (auditEndpoints && auditEndpoints.anchor)) === "string" ||
      typeof (m.attestation ?? (auditEndpoints && auditEndpoints.attestation)) === "string";
    return Boolean(hasAuditRead || hasAnchor);
  } catch {
    return false;
  }
}

function jsonWithCors(data: unknown, init: ResponseInit & { cacheControl: string }): Response {
  const headers = new Headers(CORS_HEADERS);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", init.cacheControl);
  return new Response(JSON.stringify(data), { status: init.status ?? 200, headers });
}

async function resolveRecord(q: OracleQuery): Promise<{
  by: "url" | "id" | "cuit";
  value: string;
  rec: RegistryRecord | null;
} | { error: string }> {
  if (q.url) {
    const safe = safeExternalUrl(q.url);
    if (!safe) return { error: "invalid url (must be public http(s))" };
    return { by: "url", value: safe.origin, rec: await getRecordByUrl(safe.origin) };
  }
  if (q.id) {
    return { by: "id", value: q.id, rec: await getRecord(q.id) };
  }
  if (q.cuit) {
    const want = normalizeCuit(q.cuit);
    if (!want) return { error: "invalid cuit" };
    const all = await listRecords();
    // CUIT impersonation guard (FIX 3b): the ?cuit= oracle resolves ONLY entries
    // whose CUIT is AUTHORITATIVE (seed or independently-verified). A self-listed
    // entry's self-declared CUIT is unproven, so it is NOT resolvable here — an
    // attacker self-listing a victim's CUIT can never make the oracle return a
    // signed "active" answer keyed on that CUIT.
    const rec =
      all.find(
        (r) => hasAuthoritativeCuit(r) && normalizeCuit(r.operatorCuit!) === want,
      ) ?? null;
    return { by: "cuit", value: want, rec };
  }
  return { error: "missing query: provide ?url=, ?id=, or ?cuit=" };
}

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const fresh = searchParams.get("fresh") === "1";
  const q: OracleQuery = {
    url: (searchParams.get("url") || "").trim() || undefined,
    id: (searchParams.get("id") || "").trim() || undefined,
    cuit: (searchParams.get("cuit") || "").trim() || undefined,
    fresh,
  };

  const ip = clientIp(req);

  // Baseline read rate-limit (cheap, in-memory).
  if (!rateLimit("good-standing", ip, 60, 60_000)) {
    // Request analytics (best-effort, no PII): count the throttled hit. It only
    // bumps private aggregate counters and adds NOTHING to this public response.
    void recordShadow({ ip, reqType: "rate_limited", found: false });
    return jsonWithCors({ error: "rate_limited" }, { status: 429, cacheControl: "no-store" });
  }

  const resolved = await resolveRecord(q);
  if ("error" in resolved) {
    // Distinguish a missing query from a malformed one for the analytics
    // breakdown (still no PII; only the request TYPE is counted).
    const reqType = resolved.error.startsWith("missing query") ? "missing_query" : "malformed";
    void recordShadow({ ip, reqType, found: false });
    return jsonWithCors({ error: resolved.error }, { status: 400, cacheControl: "no-store" });
  }

  let { rec } = resolved;
  const { by, value } = resolved;

  // Analytics: a well-formed query for an entity we do NOT yet list is counted
  // privately (aggregate only); the public answer is unchanged (found:false).
  if (!rec) {
    void recordShadow({ ip, reqType: "not_found", found: false });
  }

  // ── ?fresh=1 handling (FIX 5) ──────────────────────────────────────────────
  // ?fresh=1 fans out the ~11-fetch certifier (amplifier) and, in the old code,
  // an ANONYMOUS caller could DURABLY write good-standing — a denial-of-good
  // -standing primitive (flip a victim to "unverified") AND an unauthenticated
  // write. Now:
  //   - a DURABLE, FAIL-CLOSED kvRateLimit gates ANY fan-out (small budget/hour),
  //   - the in-memory damp stays as a backstop,
  //   - we COALESCE: skip the re-run if it certified < 5 min ago,
  //   - and we PERSIST the new verdict ONLY for an owner/admin caller. An
  //     anonymous ?fresh=1 may COMPUTE + RETURN a fresh verdict but never writes.
  let freshComputed: { score: number; rating: Rating; state: string } | null = null;
  if (fresh && rec && rec.publicUrl && rec.publicUrl !== "-") {
    if (!rateLimit("good-standing-fresh", ip, 6, 60_000)) {
      return jsonWithCors(
        { error: "rate_limited", note: "?fresh=1 is limited; the stored answer is cacheable" },
        { status: 429, cacheControl: "no-store" },
      );
    }
    // Durable, cross-isolate, FAIL-CLOSED budget BEFORE any certifier fan-out.
    if (!(await kvRateLimit("good-standing-fresh", ip, 20, 3600, { failClosed: true }))) {
      return jsonWithCors(
        { error: "rate_limited", note: "?fresh=1 hourly budget exhausted" },
        { status: 429, cacheControl: "no-store" },
      );
    }

    const origin = urlOrigin(rec.publicUrl);
    const lastMs = rec.goodStanding.lastCheckedAt
      ? Date.parse(rec.goodStanding.lastCheckedAt)
      : 0;
    const coalesced = lastMs > 0 && Date.now() - lastMs < FRESH_COALESCE_MS;
    if (origin && !coalesced) {
      const verdict = await runCertifier(origin);
      if (verdict) {
        const passes = verdict.rating !== "N/A" && verdict.score >= 60;
        const sanctioned =
          rec.goodStanding.state === "suspended" || rec.goodStanding.state === "revoked";
        const nextState = sanctioned
          ? rec.goodStanding.state // never auto-clear a manual sanction
          : passes
            ? "active"
            : "unverified";
        const persist = await mayPersistFresh(req, rec);
        if (persist) {
          const updated = await setGoodStanding(rec.id, {
            state: nextState,
            lastCheckedAt: new Date().toISOString(),
            lastScore: verdict.score,
            lastRating: verdict.rating,
          });
          if (updated) {
            rec = updated;
            // Historize the persisted verdict (best-effort; owner/admin path only,
            // so anonymous fresh computes never pollute the trend).
            const hsc = scoreEntry({
              status: updated.status,
              state: updated.goodStanding.state,
              conformanceScore: updated.goodStanding.lastScore,
              lastCheckedAt: updated.goodStanding.lastCheckedAt,
            });
            void recordHistoryPoint(updated.id, {
              status: updated.status,
              state: updated.goodStanding.state,
              score: hsc.overall,
              rating: hsc.rating,
            });
          }
        } else {
          // Anonymous: compute + return, but DO NOT persist (no setGoodStanding).
          freshComputed = { score: verdict.score, rating: verdict.rating, state: nextState };
        }
      }
    }
  }

  // FIX 9: probe whether the target advertises its OWN independent anchor before
  // we forward a target anchor pointer. Only on a real URL'd record.
  let targetAnchor = false;
  if (rec && rec.publicUrl && rec.publicUrl !== "-") {
    const origin = urlOrigin(rec.publicUrl);
    if (origin) targetAnchor = await targetAdvertisesAnchor(origin);
  }

  // For an anonymous fresh compute we reflect the freshly-computed (unpersisted)
  // verdict in the ANSWER without having mutated storage.
  const gsState = freshComputed ? freshComputed.state : rec?.goodStanding.state ?? null;
  const gsScore = freshComputed ? freshComputed.score : rec?.goodStanding.lastScore ?? null;
  const gsRating = freshComputed ? freshComputed.rating : rec?.goodStanding.lastRating ?? null;
  const gsAsOf = freshComputed
    ? new Date().toISOString()
    : rec?.goodStanding.lastCheckedAt ?? null;

  // ── NON-ATTESTING guard (forming/stale) ─────────────────────────────────────
  // A `forming`/`stale` registry entry IS found, but it is NOT good-standing: the
  // entity is in (or abandoned) formation, not operative. The signed answer must
  // (1) carry a non-attesting basis, (2) set attesting:false, and (3) NEVER report
  // state "active" (defence-in-depth — a forming stub's stored state is already
  // "unverified", but we force it so no recompute can ever leak an "active").
  const nonAttesting = Boolean(rec) && isNonAttestingStatus(rec!.status);
  const gsStateFinal =
    nonAttesting && gsState === "active" ? "unverified" : (gsState as string | null);
  const gsBasis = nonAttesting
    ? rec!.status === "stale"
      ? STALE_BASIS
      : FORMING_BASIS
    : GOOD_STANDING_BASIS;

  // Dimensional breakdown (ADDITIVE). Computed only for an ATTESTING found entry:
  // a non-attesting (forming/stale) answer is already flagged attesting:false, so a
  // dimensional score there would be noise. Best-effort: an incident-store read
  // failure degrades to "no open incidents".
  let dimensions: ScoreResult["dimensions"] | null = null;
  let dimensionalScore: number | null = null;
  let dimensionalRating: Rating | null = null;
  if (rec && !nonAttesting) {
    let incs: { openCritical: number; openWarning: number; openInfo: number } | undefined;
    try {
      const s = await incidentSummary(rec.id);
      incs = { openCritical: s.openCritical, openWarning: s.openWarning, openInfo: s.openInfo };
    } catch {
      incs = undefined;
    }
    const sc = scoreEntry({
      status: rec.status,
      state: (gsStateFinal as GoodStandingState | null) ?? rec.goodStanding.state,
      conformanceScore: gsScore,
      lastCheckedAt: gsAsOf,
      ...(incs ? { incidents: incs } : {}),
    });
    dimensions = sc.dimensions;
    dimensionalScore = sc.overall;
    dimensionalRating = sc.rating;
  }

  // UBO status (PII-FREE). Additive; present only when the entity has a UBO on
  // file. Best-effort: a store failure degrades to no ubo block.
  let ubo: Awaited<ReturnType<typeof getUboStatus>> = null;
  if (rec) {
    try {
      ubo = await getUboStatus(rec.id);
    } catch {
      ubo = null;
    }
  }

  // Rail posture (PII-FREE) is stored directly on the record — no extra read.
  const railPosture = rec?.railPosture ?? null;
  // Key posture (PII-FREE) is likewise stored on the record.
  const keyPosture = rec?.keyPosture ?? null;

  const body: AnswerBody = {
    kind: "ar-agents.registry.good-standing",
    version: 1,
    issuedAt: new Date().toISOString(),
    query: { by, value },
    found: Boolean(rec),
    record: rec ? buildRecordSummary(rec) : null,
    goodStanding: rec
      ? {
          state: gsStateFinal as string,
          asOf: gsAsOf,
          score: gsScore,
          rating: gsRating as Rating | null,
          basis: gsBasis,
          // Additive: only emitted for the non-attesting case, so attesting
          // answers' canonical bytes (and their already-issued signatures) are
          // unchanged. Key-sorted canonical() places it deterministically.
          ...(nonAttesting ? { attesting: false } : {}),
          ...(rec.goodStanding.reason ? { reason: rec.goodStanding.reason } : {}),
          ...(dimensions ? { dimensions, dimensionalScore, dimensionalRating } : {}),
        }
      : null,
    ...(ubo ? { ubo } : {}),
    ...(railPosture ? { railPosture } : {}),
    ...(keyPosture ? { keyPosture } : {}),
    attestation: buildAttestationPointers(rec, targetAnchor),
  };

  const signed = await signBody(body);
  const answer = {
    $schema: `${SITE}/schemas/good-standing.v1.json`,
    ...(signed ? { body, sig: signed.sig, publicKey: signed.publicKey, alg: signed.alg } : { body }),
    keyId: KEY_ID,
    verify: {
      offline: "curl -s <this-url> | jq '{body,sig,publicKey}' > gs.json && node arg-verify.mjs attestation gs.json",
      publicKeyUrl: PUBLIC_KEY_URL,
      note: signed
        ? "Ed25519 over canonical(body), standard base64. Convenience signature; see body.attestation.note for the trust-minimized path (the target's own public anchor when it advertises one)."
        : "Signing key not configured on this deployment; see body.attestation.note for the trust-minimized path.",
    },
  };

  // Stored answers are cacheable; fresh re-runs are not.
  return jsonWithCors(answer, {
    status: 200,
    cacheControl: fresh
      ? "no-store, no-cache"
      : "public, max-age=60, stale-while-revalidate=300",
  });
}

export async function OPTIONS(): Promise<Response> {
  return preflight();
}
