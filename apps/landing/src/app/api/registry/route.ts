/**
 * /api/registry — authenticated WRITE + machine-readable list for the registry.
 *
 * POST  = self-listing (an ADDITIONAL path alongside the existing "open a PR"
 *         flow on /registro). Mints a write-once owner capability token, then
 *         programmatically enforces the SAME "honest claims" guarantee the PR
 *         review enforced: a self-listed entry is created status:"draft",
 *         goodStanding.state:"unverified", and AUTO-FLIPS to live/active ONLY
 *         when the server-side certifier scores its declared URL ≥ "C" (60).
 *         Bogus entries stay draft/unverified — they never pollute the oracle.
 *
 * PATCH = owner-authenticated update (x-registry-token, verified against the
 *         entry id via the "registry-owner" capability kind). Can update
 *         disclosure / publicUrl / status. A publicUrl change re-runs the
 *         certifier.
 *
 * GET   = no-auth machine-readable mirror of the registry page, with
 *         ?jurisdiction= ?type= ?status= filters. Cacheable.
 *
 * nodejs runtime (mints a token + writes multiple KV keys + runs the certifier;
 * matches api/conformance-history's choice for headroom). Reuses the shared
 * SSRF + rate-limit + capability-token + registry-store primitives.
 */

import { z } from "zod";
import { safeExternalUrl } from "@/lib/ssrf";
import { clientIp, rateLimit, kvRateLimit } from "@/lib/ratelimit";
import { jsonCors, preflight } from "@/lib/cors";
import { mintCapabilityToken, verifyCapabilityToken } from "@/lib/capability-token";
import { constantTimeEqual } from "@/lib/incorporate-auth";
import {
  getRecord,
  listRecords,
  upsertRecord,
  setGoodStanding,
  urlOrigin,
  ID_RE,
  UrlTakenError,
  CuitTakenError,
  RevokedTerminalError,
  type RegistryRecord,
  type RegistryType,
  type RegistryStatus,
  type Rating,
} from "@/lib/registry-store";

export const runtime = "nodejs";

const SITE = "https://ar-agents.ar";
const OWNER_KIND = "registry-owner";
const OWNER_PREFIX = "rgo";
/** Min rating that auto-flips a self-listed entry to live/active. */
const MIN_PASS_SCORE = 60; // "C"

/**
 * The GLOBAL ar-agents operator override. Possession of this single env secret
 * (REGISTRY_ADMIN_TOKEN) authorizes regulator-grade suspend/revoke across the
 * whole registry — the "teeth" — without the per-entry owner token.
 *
 * FAIL-CLOSED: if the env is UNSET the override is UNAVAILABLE (every admin
 * attempt is rejected). We never treat "no admin secret configured" as "anyone
 * is admin". Compared in constant time (Edge-safe HMAC) so the secret never
 * leaks through timing.
 */
async function isRegistryAdmin(req: Request): Promise<boolean> {
  const configured = process.env.REGISTRY_ADMIN_TOKEN?.trim();
  if (!configured) return false; // fail-closed: override disabled when unset
  const presented =
    req.headers.get("x-admin-token")?.trim() ||
    (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!presented) return false;
  return constantTimeEqual(presented, configured);
}

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

const TYPES: [RegistryType, ...RegistryType[]] = [
  "reference-implementation",
  "demo",
  "productive-sociedad-ia",
  "library-only",
];

const postSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(TYPES),
  jurisdiction: z.string().min(2).max(8),
  operator: z.string().min(2).max(120),
  operatorCuit: z.string().min(8).max(20).optional(),
  publicUrl: z.string().url().max(300),
  rfcConformance: z.array(z.string().max(40)).max(20).default([]),
  disclosure: z.object({
    es: z.string().min(1).max(2000),
    en: z.string().min(1).max(2000),
  }),
});

const patchSchema = z.object({
  id: z.string().regex(ID_RE),
  disclosure: z
    .object({ es: z.string().min(1).max(2000), en: z.string().min(1).max(2000) })
    .optional(),
  publicUrl: z.string().url().max(300).optional(),
  status: z.enum(["live", "draft", "deprecated"]).optional(),
  /**
   * ADMIN-ONLY good-standing override (suspend/revoke teeth). Honored only when
   * the request carries a valid REGISTRY_ADMIN_TOKEN; ignored for owner-only
   * requests. `reason` travels into the signed oracle answer.
   */
  goodStanding: z
    .object({
      state: z.enum(["suspended", "revoked", "active"]),
      reason: z.string().min(1).max(500).optional(),
    })
    .optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return base.length >= 2 ? base : `entry-${base}`;
}

/**
 * Derive a free slug id from a name, suffixing -2, -3, ... on collision.
 * Idempotency-safe: existence is checked against the merged record set.
 */
async function deriveId(name: string): Promise<string | null> {
  const root = slugify(name);
  if (!ID_RE.test(root)) {
    // Fall back to a random id if the name produced nothing usable.
    const rand = `entry-${crypto.randomUUID().slice(0, 8)}`;
    return ID_RE.test(rand) ? rand : null;
  }
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}-${i + 1}`.slice(0, 63);
    if (!ID_RE.test(candidate)) continue;
    const existing = await getRecord(candidate);
    if (!existing) return candidate;
  }
  return null;
}

async function runCertifier(origin: string): Promise<{ score: number; rating: Rating } | null> {
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

/** Best-effort: record the score on the existing conformance trend store. */
async function recordTrend(origin: string): Promise<void> {
  try {
    await fetch(`${SITE}/api/conformance-history?url=${encodeURIComponent(origin)}`, {
      method: "POST",
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // non-fatal
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — machine-readable filtered list
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const fJur = (searchParams.get("jurisdiction") || "").trim().toUpperCase();
  const fType = (searchParams.get("type") || "").trim();
  const fStatus = (searchParams.get("status") || "").trim();

  const all = await listRecords();
  const filtered = all.filter((r) => {
    if (fJur && r.jurisdiction.toUpperCase() !== fJur) return false;
    if (fType && r.type !== fType) return false;
    if (fStatus && r.status !== fStatus) return false;
    return true;
  });

  // Strip the owner-token hash AND the formation block from the public mirror:
  // formation.sidecar carries the representante's SELF-DECLARED name + CUIT (PII)
  // and the rest is internal operational detail. The Formation Pack is served only
  // via the admin-gated /api/formation/pack; the public list stays PII-free.
  const records = filtered.map((r) => {
    const { ownerTokenHash: _omit, formation: _formation, ...pub } = r;
    void _omit;
    void _formation;
    return pub;
  });

  return jsonCors(
    {
      $schema: `${SITE}/schemas/registry-list.v1.json`,
      generatedAt: new Date().toISOString(),
      count: records.length,
      filters: {
        jurisdiction: fJur || null,
        type: fType || null,
        status: fStatus || null,
      },
      records,
    },
    {
      headers: {
        "cache-control": "public, max-age=60, stale-while-revalidate=300",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — self-list
// ─────────────────────────────────────────────────────────────────────────────

export async function POST(req: Request): Promise<Response> {
  const ip = clientIp(req);
  // In-memory damp + durable fail-CLOSED quota (this mints permanent KV records).
  if (!rateLimit("registry-post", ip, 10, 60_000)) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("registry-post", ip, 20, 3600, { failClosed: true }))) {
    return jsonCors({ error: "rate_limited", note: "max 20/hora por IP" }, { status: 429 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return jsonCors({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;

  const safe = safeExternalUrl(input.publicUrl);
  if (!safe) {
    return jsonCors(
      { error: "invalid_url", note: "publicUrl must be a public http(s) URL" },
      { status: 400 },
    );
  }
  const origin = safe.origin;

  const id = await deriveId(input.name);
  if (!id) {
    return jsonCors({ error: "could_not_derive_id" }, { status: 409 });
  }

  // Mint the write-once owner token BEFORE creating the record. The token is
  // returned exactly once and stored only as a hash. If a concurrent self-list
  // already claimed this id's token, mint returns null → 409 (idempotency).
  const ownerToken = await mintCapabilityToken(OWNER_KIND, OWNER_PREFIX, id);
  if (!ownerToken) {
    return jsonCors({ error: "id_taken", note: "retry with a different name" }, { status: 409 });
  }

  // Programmatic honest-claims gate: certify the declared URL. A self-listed
  // entry is born draft/unverified and ONLY flips to live/active on score ≥ C.
  const verdict = await runCertifier(origin);
  const passes = verdict !== null && verdict.rating !== "N/A" && verdict.score >= MIN_PASS_SCORE;
  const now = new Date().toISOString();

  const record: RegistryRecord = {
    id,
    name: input.name,
    type: input.type,
    jurisdiction: input.jurisdiction.toUpperCase(),
    operator: input.operator,
    ...(input.operatorCuit ? { operatorCuit: input.operatorCuit } : {}),
    publicUrl: origin,
    rfcConformance: input.rfcConformance,
    disclosure: input.disclosure,
    status: passes ? "live" : "draft",
    listedSince: now.slice(0, 10),
    goodStanding: {
      state: passes ? "active" : "unverified",
      lastCheckedAt: verdict ? now : null,
      lastScore: verdict ? verdict.score : null,
      lastRating: verdict ? verdict.rating : null,
      ...(passes ? {} : { reason: "awaiting certifier ≥ C on the declared URL" }),
    },
    // We store only the hash via the capability-token module; mirror its presence.
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
  };

  let stored: RegistryRecord | null;
  try {
    stored = await upsertRecord(record);
  } catch (e) {
    if (e instanceof UrlTakenError) {
      return jsonCors(
        {
          error: "url_taken",
          note: "esa URL ya está reclamada por otra entrada (o pertenece al registro de referencia)",
        },
        { status: 409 },
      );
    }
    if (e instanceof CuitTakenError) {
      return jsonCors(
        { error: "cuit_taken", note: "ese CUIT ya está declarado en otra entrada" },
        { status: 409 },
      );
    }
    throw e;
  }
  if (!stored) {
    return jsonCors(
      { error: "registry_full_or_unwritable", note: "id-set at capacity or KV unavailable" },
      { status: 503 },
    );
  }

  // Best-effort: seed the conformance trend.
  if (verdict) await recordTrend(origin);

  return jsonCors(
    {
      ok: true,
      id,
      // Returned ONCE. Store it: it authorizes PATCH /api/registry + cert issuance.
      ownerToken,
      certified: verdict
        ? { score: verdict.score, rating: verdict.rating, passed: passes }
        : { score: null, rating: null, passed: false, note: "certifier did not respond; entry is draft/unverified" },
      record: stored,
      next: passes
        ? "Your entry is live. Re-certify anytime via GET /api/registry/good-standing?url=<origin>&fresh=1"
        : `Your entry is draft/unverified. Fix the declared endpoints, then PATCH or call GET /api/registry/good-standing?url=${origin}&fresh=1 to re-certify and auto-flip to live at score ≥ C.`,
    },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PATCH — owner update, OR ar-agents admin good-standing override (teeth)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(req: Request): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit("registry-patch", ip, 20, 60_000)) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }
  // Durable, cross-isolate, FAIL-CLOSED quota: a PATCH can move status + re-run
  // the certifier (a fan-out), so a KV outage must not wave through a flood.
  if (!(await kvRateLimit("registry-patch", ip, 40, 3600, { failClosed: true }))) {
    return jsonCors({ error: "rate_limited", note: "max 40/hora por IP" }, { status: 429 });
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonCors({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(bodyJson);
  if (!parsed.success) {
    return jsonCors({ error: "invalid_body", details: parsed.error.flatten() }, { status: 400 });
  }
  const { id, disclosure, publicUrl, status, goodStanding } = parsed.data;

  // ── ADMIN good-standing override (the teeth) ──────────────────────────────
  // A global ar-agents admin (REGISTRY_ADMIN_TOKEN) can suspend/revoke/restore
  // ANY entry's good-standing WITHOUT the per-entry owner token. This works on
  // seed AND self-listed entries (a fraudulent seed-shadowing self-list, or a
  // lapsed operator). It is the ONLY way `goodStanding` in the body is honored.
  if (goodStanding) {
    const admin = await isRegistryAdmin(req);
    if (!admin) {
      return jsonCors(
        { error: "unauthorized", note: "good-standing override requires the ar-agents admin token" },
        { status: 403 },
      );
    }
    const target = await getRecord(id);
    if (!target) return jsonCors({ error: "not_found" }, { status: 404 });
    let updated: RegistryRecord | null;
    try {
      updated = await setGoodStanding(id, {
        state: goodStanding.state,
        ...(goodStanding.reason ? { reason: goodStanding.reason } : {}),
      });
    } catch (e) {
      // The entity is `revoked` (terminal kill-state) and this override tried to
      // move it elsewhere. Refuse loudly — a killed entity is not quietly restored.
      if (e instanceof RevokedTerminalError) {
        return jsonCors(
          { error: "revoked_terminal", note: "this entity is revoked; the kill-state is terminal and cannot be reverted via override" },
          { status: 409 },
        );
      }
      throw e;
    }
    if (!updated) return jsonCors({ error: "unwritable" }, { status: 503 });
    return jsonCors(
      { ok: true, id, by: "admin", record: updated },
      { headers: { "cache-control": "no-store" } },
    );
  }

  const token = req.headers.get("x-registry-token") || "";
  const ok = await verifyCapabilityToken(OWNER_KIND, id, token);
  if (!ok) {
    return jsonCors({ error: "unauthorized", note: "missing or invalid x-registry-token" }, { status: 401 });
  }

  const current = await getRecord(id);
  if (!current) {
    return jsonCors({ error: "not_found" }, { status: 404 });
  }
  // Only self-listed entries are owner-mutable (seed entries are code-owned).
  if (current.source !== "self-listed") {
    return jsonCors(
      { error: "immutable_seed", note: "seed entries are edited via PR, not the API" },
      { status: 403 },
    );
  }

  let origin = urlOrigin(current.publicUrl);
  let urlChanged = false;
  if (publicUrl) {
    const safe = safeExternalUrl(publicUrl);
    if (!safe) {
      return jsonCors({ error: "invalid_url" }, { status: 400 });
    }
    urlChanged = safe.origin !== current.publicUrl;
    origin = safe.origin;
  }

  // FIX 7: do NOT honor a direct status:"live" unless the entry has actually
  // certified at or above the floor (lastScore >= C). Otherwise an owner could
  // flip their own entry "live" by hand and bypass the certifier — exactly the
  // dishonest-claim the auto-flip gate exists to prevent. A live request that
  // isn't backed by a passing score is downgraded to "draft" (and, when the URL
  // is unchanged so no re-cert runs below, that is the final status).
  let effectiveStatus = status;
  if (status === "live") {
    const certifiedScore = current.goodStanding.lastScore;
    const passedRecently =
      typeof certifiedScore === "number" &&
      certifiedScore >= MIN_PASS_SCORE &&
      current.goodStanding.state === "active";
    // If the URL is changing, the re-cert below decides; keep "draft" for now.
    if (!passedRecently || urlChanged) effectiveStatus = "draft";
  }

  const next: RegistryRecord = {
    ...current,
    ...(disclosure ? { disclosure } : {}),
    ...(publicUrl ? { publicUrl: origin! } : {}),
    ...(effectiveStatus ? { status: effectiveStatus } : {}),
    updatedAt: new Date().toISOString(),
  };

  const stored = await upsertRecord(next);
  if (!stored) {
    return jsonCors({ error: "unwritable" }, { status: 503 });
  }

  // A publicUrl change re-runs the certifier + refreshes good-standing.
  let recertified: { score: number; rating: Rating; passed: boolean } | null = null;
  if (urlChanged && origin) {
    const verdict = await runCertifier(origin);
    if (verdict) {
      const passes = verdict.rating !== "N/A" && verdict.score >= MIN_PASS_SCORE;
      const sanctioned =
        stored.goodStanding.state === "suspended" || stored.goodStanding.state === "revoked";
      const updated = await setGoodStanding(id, {
        // NEVER auto-clear a manual suspended/revoked sanction.
        state: sanctioned ? stored.goodStanding.state : passes ? "active" : "unverified",
        lastCheckedAt: new Date().toISOString(),
        lastScore: verdict.score,
        lastRating: verdict.rating,
      });
      // A passing re-cert may now flip status to live (matches POST auto-flip);
      // a manual sanction or a fail keeps it draft. The owner can never go live
      // by hand — only a passing certifier score does it.
      let finalRecord = updated ?? stored;
      const shouldGoLive = passes && !sanctioned;
      if (finalRecord.status !== (shouldGoLive ? "live" : "draft")) {
        const restatused = await upsertRecord({
          ...finalRecord,
          status: shouldGoLive ? "live" : "draft",
          updatedAt: new Date().toISOString(),
        });
        if (restatused) finalRecord = restatused;
      }
      recertified = { score: verdict.score, rating: verdict.rating, passed: passes };
      await recordTrend(origin);
      return jsonCors(
        { ok: true, id, record: finalRecord, recertified },
        { headers: { "cache-control": "no-store" } },
      );
    }
  }

  return jsonCors(
    { ok: true, id, record: stored, recertified },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return preflight();
}
