/**
 * Audit log primitives for /play and /api/auto-incorporate.
 *
 * Each audit entry is HMAC-SHA256-signed at write time using
 * AUDIT_HMAC_SECRET. The signature can be re-computed from the public
 * fields any time, which is what makes the public audit-log endpoint
 * forensically useful: a third party can prove the entry hasn't been
 * tampered with without having access to the signing key.
 *
 * Storage: Vercel KV (Upstash REST under the hood, Edge-safe). When KV
 * isn't provisioned (KV_REST_API_URL absent), falls back to an in-memory
 * Map, useful for local dev and PR previews without secrets. The
 * fallback is per-instance so it won't survive a cold start, but the
 * production case is the KV path.
 *
 * Why this matters for RFC-001:
 *   § 9.1, append-only sink, HMAC-signed timestamps.
 *   § 9.2, log is legally probative. The verify endpoint exists for
 *           anyone to challenge or confirm a sociedad-IA's claimed
 *           operating history.
 */

import { kv } from "@vercel/kv";

// ─────────────────────────────────────────────────────────────────────────────
// HMAC helpers (Web Crypto, Edge-safe, no node:crypto)
// ─────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder();

async function importHmac(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function primarySecret(): string | null {
  return process.env.AUDIT_HMAC_SECRET?.trim() || null;
}

/**
 * Verify-only retired secrets, comma-separated, for ZERO-DOWNTIME ROTATION.
 * Rotate by: AUDIT_HMAC_SECRET=<new>, AUDIT_HMAC_SECRET_PREVIOUS=<old>. New
 * entries sign under the new secret; entries written under the old one still
 * verify (so a public proof link doesn't break mid-rotation). Drop PREVIOUS once
 * every entry signed under the old secret has aged past its TTL. A single
 * AUDIT_HMAC_SECRET with no PREVIOUS was a non-repudiation SPOF — unrotatable
 * without invalidating all history.
 */
function previousSecrets(): string[] {
  const raw = process.env.AUDIT_HMAC_SECRET_PREVIOUS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const cachedSigning: { key: CryptoKey | null; secret: string | null } = {
  key: null,
  secret: null,
};

/** The single key NEW entries are signed with: the primary secret. */
async function getSigningKey(): Promise<CryptoKey | null> {
  const secret = primarySecret();
  if (!secret) return null;
  if (cachedSigning.key && cachedSigning.secret === secret) return cachedSigning.key;
  const key = await importHmac(secret);
  cachedSigning.key = key;
  cachedSigning.secret = secret;
  return key;
}

let cachedVerify: { keys: CryptoKey[]; fingerprint: string } | null = null;

/** Every key an entry MAY have been signed with: primary first, then retired
 *  secrets (verify-only). verifyEntry accepts a match against any of them. */
async function getVerificationKeys(): Promise<CryptoKey[]> {
  const secrets = [primarySecret(), ...previousSecrets()].filter(
    (s): s is string => Boolean(s),
  );
  if (secrets.length === 0) return [];
  const fingerprint = JSON.stringify(secrets);
  if (cachedVerify && cachedVerify.fingerprint === fingerprint) return cachedVerify.keys;
  const keys = await Promise.all(secrets.map(importHmac));
  cachedVerify = { keys, fingerprint };
  return keys;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Thrown when an entry nests deeper than CANONICAL_MAX_DEPTH. Caught at the
 *  call sites so a hostile payload degrades gracefully instead of 500ing. */
export class CanonicalDepthError extends Error {
  constructor() {
    super("canonical: max nesting depth exceeded");
    this.name = "CanonicalDepthError";
  }
}

// Bounds recursion so a deeply-nested payload can't blow the (smaller-on-Edge)
// call stack. 64 is far past any legitimate audit entry; the zod layer in the
// public write paths rejects over-deep input before it ever reaches here.
const CANONICAL_MAX_DEPTH = 64;

/**
 * Canonical-JSON-stringify for stable HMAC inputs (object-key sorted).
 *
 * Mirrors JSON.stringify semantics in two ways that matter for verification:
 *  - `undefined` object values are SKIPPED (JSON drops them, and KV stores the
 *    entry as JSON — so signing over a key that the round-trip drops would make
 *    a legitimate entry verify as "tampered").
 *  - depth is bounded (see CanonicalDepthError).
 * `ed25519.ts` keeps an identical copy; change both together.
 */
function canonical(value: unknown, depth = 0): string {
  if (depth > CANONICAL_MAX_DEPTH) throw new CanonicalDepthError();
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v, depth + 1)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k], depth + 1)}`).join(",")}}`;
}

export async function signEntry(entry: Omit<AuditEntry, "hmac">): Promise<string | null> {
  const key = await getSigningKey();
  if (!key) return null;
  // Strip BOTH `hmac` and `signature` (RFC-005) fields before signing.
  // verify() does the same, so sign + verify operate on the same input
  // space regardless of whether asymmetric upgrade is wired.
  const stripped = { ...entry } as Record<string, unknown>;
  delete stripped.hmac;
  delete stripped.signature;
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonical(stripped)));
  return `sha256:${bytesToHex(sig)}`;
}

export async function verifyEntry(entry: AuditEntry): Promise<boolean> {
  const keys = await getVerificationKeys();
  if (keys.length === 0) return false;
  if (!entry.hmac?.startsWith("sha256:")) return false;
  const hex = entry.hmac.slice("sha256:".length);
  if (!/^[0-9a-f]+$/.test(hex)) return false;
  const sigBytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < sigBytes.length; i++) {
    sigBytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  // Symmetric strip: same as signEntry's strip.
  const stripped = { ...entry } as Record<string, unknown>;
  delete stripped.hmac;
  delete stripped.signature;
  const msg = enc.encode(canonical(stripped));
  // Accept a match under the primary OR any retired secret (rotation window).
  for (const key of keys) {
    try {
      if (await crypto.subtle.verify("HMAC", key, sigBytes, msg)) return true;
    } catch {
      // A poisoned/over-deep stored entry must read as "not verified", never
      // 500 the public read endpoint. Try the next key, then fall through.
    }
  }
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit entry shape
// ─────────────────────────────────────────────────────────────────────────────

export type AuditGovernance =
  | "algorithm-only"
  | "audit-logged"
  | "mocked-upstream"
  | "requires-confirmation";

/** RFC-005 v1 Ed25519 signature on an entry. Additive to `hmac`. */
export interface Ed25519Signature {
  keyId: string;
  alg: "ed25519";
  /** base64url-encoded 64-byte signature */
  value: string;
}

/**
 * Who authorized an approval-level act (e.g. an incorporation). Bound INTO the
 * audit entry, so it is HMAC/Ed25519-signed alongside everything else: the
 * signed record proves not just WHAT was constituted but WHICH credential
 * approved it, tamper-evident. Art. 102 makes a named human administrator
 * responsible for the AI's acts and bars delegating that supervision, so the
 * operating record must carry the approver instead of discarding it at the gate.
 */
export interface ApproverAttestation {
  /** How the approver was established. `shared-key`/`vercel-oidc` for agent
   *  callers (see incorporate-auth.ts); `self-attested` for a human who declared
   *  their administrator identity and accepted art. 102 responsibility in the UI. */
  method: "shared-key" | "vercel-oidc" | "self-attested";
  /** Stable, NON-SECRET identifier of the approving principal. For the shared
   *  key it is a fingerprint of the credential (sha256 prefix), so the log
   *  proves which credential approved without storing the secret; for OIDC it
   *  is the verified subject. */
  principal: string;
  /** What `principal` is, so a reader/verifier interprets it correctly. */
  principalKind: "credential-fingerprint" | "oidc-subject" | "declared-cuit";
  /** Caller-asserted human identifier of the named administrator (art. 102):
   *  the representante's name, or an `x-approver` header. Recorded as-asserted,
   *  NEVER trusted for authentication. */
  declaredBy?: string | undefined;
}

export interface AuditEntry {
  /** Stable across reads. ISO date + monotonic random suffix. */
  id: string;
  /** Session this entry belongs to. */
  sessionId: string;
  /** ISO 8601 UTC timestamp the entry was created. */
  ts: string;
  /** Tool / endpoint that produced the side effect. */
  tool: string;
  /** RFC-001 governance classification. */
  governance: AuditGovernance;
  /** Captured input (canonical-JSON serializable). */
  input: unknown;
  /** Captured output. May be omitted if the tool errored. */
  output?: unknown;
  /** Truthy if the tool errored. */
  errored?: boolean;
  /** Wall-clock duration in ms. */
  durationMs?: number;
  /**
   * Who authorized this act, present on approval-level acts (incorporation).
   * Signed alongside the rest of the entry, so the attestation is tamper-evident
   * and a reader can prove which credential stood behind the legal act.
   */
  approver?: ApproverAttestation;
  /** HMAC-SHA256 over the canonical-JSON of all other fields. */
  hmac: string | null;
  /**
   * RFC-005 v1 Ed25519 signature. Computed alongside `hmac` when
   * AUDIT_ED25519_PRIVATE_KEY is set. Verifiable offline against the
   * public key published at /.well-known/sociedad-ia/keys.
   */
  signature?: Ed25519Signature;
}

// ─────────────────────────────────────────────────────────────────────────────
// Storage (Vercel KV with in-memory fallback)
// ─────────────────────────────────────────────────────────────────────────────

const memStore = new Map<string, AuditEntry[]>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

const KEY_PREFIX = "play:audit:";
const ENTRY_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days
/**
 * Redis SET of sessionIds that must never expire. Demo/play sessions keep the
 * 7-day TTL (noise control); business records — incorporations, paid El
 * Auditor sessions — are durable. A public proof link that 404s after a week
 * is forensically useless, which defeats the whole product.
 */
const DURABLE_SET = "play:audit:durable-sessions";

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

async function isDurable(sessionId: string): Promise<boolean> {
  try {
    return Boolean(await kv.sismember(DURABLE_SET, sessionId));
  } catch {
    return false;
  }
}

/**
 * Mark an existing session as durable: clears any pending TTL and registers
 * it so later non-durable appends can't re-impose one. Idempotent.
 */
export async function pinSession(sessionId: string): Promise<void> {
  if (!isKvWired()) return;
  try {
    await kv.sadd(DURABLE_SET, sessionId);
    await kv.persist(key(sessionId));
  } catch {
    // KV down — nothing to pin; next durable append retries.
  }
}

export async function appendAudit(
  sessionId: string,
  partial: Omit<AuditEntry, "id" | "sessionId" | "ts" | "hmac">,
  opts?: { durable?: boolean },
): Promise<AuditEntry> {
  const id = `${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`;
  const entry: AuditEntry = {
    id,
    sessionId,
    ts: new Date().toISOString(),
    ...partial,
    hmac: null,
  };
  // A hostile/unstringifiable payload (over-deep nesting → CanonicalDepthError,
  // BigInt, circular ref) must degrade to an unsigned entry, never 500 the
  // whole write. The public write paths reject these at the zod layer first;
  // this is the belt-and-suspenders so no caller can crash appendAudit.
  try {
    entry.hmac = await signEntry(entry);
  } catch {
    entry.hmac = null;
  }
  // RFC-005 v1: also compute Ed25519 signature if AUDIT_ED25519_PRIVATE_KEY
  // is set. The signature is verifiable offline by anyone holding the
  // public key from /.well-known/sociedad-ia/keys (RFC-005 § 4). Dynamic
  // import avoids paying the Web Crypto Ed25519 cost on cold paths that
  // never use the asymmetric upgrade.
  if (process.env.AUDIT_ED25519_PRIVATE_KEY?.trim()) {
    try {
      const { signEntryAsymmetric } = await import("./ed25519");
      const keyId = process.env.AUDIT_ED25519_KEY_ID?.trim() || "ar-agents-ref-2026-05";
      const sig = await signEntryAsymmetric(entry, keyId);
      if (sig) entry.signature = sig;
    } catch {
      // Ed25519 failure must not break the v1 HMAC path.
    }
  }
  if (isKvWired()) {
    let pushed = false;
    try {
      await kv.rpush(key(sessionId), entry);
      pushed = true;
      if (opts?.durable) {
        await kv.sadd(DURABLE_SET, sessionId);
        await kv.persist(key(sessionId));
      } else if (!(await isDurable(sessionId))) {
        await kv.expire(key(sessionId), ENTRY_TTL_SECONDS);
      }
    } catch {
      if (!pushed) {
        // rpush itself failed → the write never landed in KV. Use in-memory so
        // the entry isn't lost outright (demo/PR-preview path).
        const arr = memStore.get(sessionId) ?? [];
        arr.push(entry);
        memStore.set(sessionId, arr);
      } else if (opts?.durable) {
        // The entry DID land but durability bookkeeping failed — it may carry a
        // stale TTL from an earlier non-durable append. A paid record must not
        // silently expire, so best-effort re-pin; membership in DURABLE_SET also
        // makes the next append (or pinSession) repair it.
        try {
          await kv.sadd(DURABLE_SET, sessionId);
          await kv.persist(key(sessionId));
        } catch {
          // Leave it; DURABLE_SET membership is the recovery signal.
        }
      }
      // non-durable + pushed + expire-failed: entry persists without a TTL,
      // which is safe (no data loss; it just won't auto-expire).
    }
    // RFC-006: business records also land as links in the global hash chain,
    // so history cannot be truncated or rewritten without breaking the chain
    // or contradicting a published anchor. Best-effort by design: chaining
    // failure must never fail the write. Dynamic import keeps the ledger off
    // cold paths that never log durable entries.
    if (opts?.durable && pushed) {
      try {
        const { appendLink } = await import("./ledger");
        await appendLink({
          societyId: sessionId,
          actor: "ar-agents-hosted",
          action: entry.tool,
          meta: { governance: entry.governance, entryId: entry.id },
          ts: entry.ts,
        });
      } catch {
        // POST /api/audit/anchor or the next durable write repairs coverage.
      }
    }
  } else {
    const arr = memStore.get(sessionId) ?? [];
    arr.push(entry);
    memStore.set(sessionId, arr);
  }
  return entry;
}

export async function readAudit(sessionId: string): Promise<AuditEntry[]> {
  if (isKvWired()) {
    try {
      const raw = await kv.lrange<AuditEntry>(key(sessionId), 0, -1);
      return Array.isArray(raw) ? raw : [];
    } catch {
      // fall through to memory
    }
  }
  return memStore.get(sessionId) ?? [];
}

export function isSessionIdValid(s: string): boolean {
  return typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s);
}

/**
 * Verify every entry in a session. Returns aggregate stats for an
 * external auditor, count of entries, count tampered, plus RFC-005
 * asymmetric verification counts when entries carry `signature` fields.
 */
export async function verifySession(sessionId: string): Promise<{
  total: number;
  verified: number;
  tampered: number;
  hmacWired: boolean;
  /** Number of entries carrying an Ed25519 signature (RFC-005 § 3). */
  signedAsymmetric: number;
  /** Number of those signatures that verified successfully. */
  signedAsymmetricVerified: number;
}> {
  const entries = await readAudit(sessionId);
  const hmacWired = Boolean(process.env.AUDIT_HMAC_SECRET?.trim());

  // Asymmetric verification stats are computed regardless of HMAC config,
  // the two checks are independent.
  let signedAsymmetric = 0;
  let signedAsymmetricVerified = 0;
  const publicKey = process.env.AUDIT_ED25519_PUBLIC_KEY?.trim();
  if (publicKey) {
    try {
      const { verifyEntryAsymmetric } = await import("./ed25519");
      for (const e of entries) {
        if (!e.signature) continue;
        signedAsymmetric++;
        if (await verifyEntryAsymmetric(e, publicKey)) signedAsymmetricVerified++;
      }
    } catch {
      // verify lib failure → leave counts at 0.
    }
  }

  if (!hmacWired) {
    return {
      total: entries.length,
      verified: 0,
      tampered: 0,
      hmacWired: false,
      signedAsymmetric,
      signedAsymmetricVerified,
    };
  }
  let verified = 0;
  let tampered = 0;
  for (const e of entries) {
    if (await verifyEntry(e)) verified++;
    else tampered++;
  }
  return {
    total: entries.length,
    verified,
    tampered,
    hmacWired,
    signedAsymmetric,
    signedAsymmetricVerified,
  };
}

/** Storage backend in use (advertised in API responses for transparency). */
export function backend(): "vercel-kv" | "in-memory" {
  return isKvWired() ? "vercel-kv" : "in-memory";
}
