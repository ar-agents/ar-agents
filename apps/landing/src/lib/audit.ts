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

const cachedKey: { key: CryptoKey | null; secret: string | null } = {
  key: null,
  secret: null,
};

async function getHmacKey(): Promise<CryptoKey | null> {
  const secret = process.env.AUDIT_HMAC_SECRET?.trim();
  if (!secret) return null;
  if (cachedKey.key && cachedKey.secret === secret) return cachedKey.key;
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
  cachedKey.key = key;
  cachedKey.secret = secret;
  return key;
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Canonical-JSON-stringify for stable HMAC inputs (object-key sorted). */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

export async function signEntry(entry: Omit<AuditEntry, "hmac">): Promise<string | null> {
  const key = await getHmacKey();
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
  const key = await getHmacKey();
  if (!key) return false;
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
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(canonical(stripped)),
  );
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

function key(sessionId: string): string {
  return `${KEY_PREFIX}${sessionId}`;
}

export async function appendAudit(
  sessionId: string,
  partial: Omit<AuditEntry, "id" | "sessionId" | "ts" | "hmac">,
): Promise<AuditEntry> {
  const id = `${new Date().toISOString()}-${crypto.randomUUID().slice(0, 8)}`;
  const entry: AuditEntry = {
    id,
    sessionId,
    ts: new Date().toISOString(),
    ...partial,
    hmac: null,
  };
  entry.hmac = await signEntry(entry);
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
    try {
      await kv.rpush(key(sessionId), entry);
      await kv.expire(key(sessionId), ENTRY_TTL_SECONDS);
    } catch {
      // KV down, fall through to in-memory so the demo doesn't break.
      const arr = memStore.get(sessionId) ?? [];
      arr.push(entry);
      memStore.set(sessionId, arr);
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
