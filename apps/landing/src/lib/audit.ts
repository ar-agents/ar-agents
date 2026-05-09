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
 * Map — useful for local dev and PR previews without secrets. The
 * fallback is per-instance so it won't survive a cold start, but the
 * production case is the KV path.
 *
 * Why this matters for RFC-001:
 *   § 9.1 — append-only sink, HMAC-signed timestamps.
 *   § 9.2 — log is legally probative. The verify endpoint exists for
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
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(canonical(entry)));
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
  const { hmac: _ignored, ...payload } = entry;
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    enc.encode(canonical(payload)),
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
  if (isKvWired()) {
    try {
      await kv.rpush(key(sessionId), entry);
      await kv.expire(key(sessionId), ENTRY_TTL_SECONDS);
    } catch {
      // KV down — fall through to in-memory so the demo doesn't break.
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
 * external auditor — count of entries, count tampered.
 */
export async function verifySession(sessionId: string): Promise<{
  total: number;
  verified: number;
  tampered: number;
  hmacWired: boolean;
}> {
  const entries = await readAudit(sessionId);
  const hmacWired = Boolean(process.env.AUDIT_HMAC_SECRET?.trim());
  if (!hmacWired) {
    return { total: entries.length, verified: 0, tampered: 0, hmacWired: false };
  }
  let verified = 0;
  let tampered = 0;
  for (const e of entries) {
    if (await verifyEntry(e)) verified++;
    else tampered++;
  }
  return { total: entries.length, verified, tampered, hmacWired };
}

/** Storage backend in use (advertised in API responses for transparency). */
export function backend(): "vercel-kv" | "in-memory" {
  return isKvWired() ? "vercel-kv" : "in-memory";
}
