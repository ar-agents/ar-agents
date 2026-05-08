// ACP idempotency mechanics.
//
// Spec (2026-04-17): the `Idempotency-Key` header is REQUIRED on POSTs
// (create, update, complete, cancel). It's NOT required on GET. Scoped to
// `(authenticated identity, endpoint)` — different endpoints can reuse the
// same key.
//
// On replay with the same body: return the cached 2xx response with header
// `Idempotent-Replayed: "true"`.
// On the same key being processed concurrently: return 409
// `idempotency_in_flight` + `Retry-After`.
// On the same key with a *different* body: return 422 `idempotency_conflict`.
//
// The merchant implementation chooses the TTL window. We default to 24h to
// match Stripe's published behavior.

import type { AcpError } from "./schemas/error";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const IDEMPOTENT_REPLAYED_HEADER = "Idempotent-Replayed";
export const RETRY_AFTER_HEADER = "Retry-After";
export const DEFAULT_IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60; // 24h
export const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

/**
 * State of an idempotency record at the time of `tryClaim`.
 *
 *  - `claimed`: caller is the first owner of `(scope, key)` — proceed.
 *  - `replay`: same `(scope, key)` previously completed with the same
 *    request body — return the cached `response` with `Idempotent-Replayed`.
 *  - `in_flight`: same `(scope, key)` is currently being processed by
 *    another caller — return 409 with `Retry-After`.
 *  - `conflict`: same `(scope, key)` was previously used with a *different*
 *    request body — return 422 `idempotency_conflict`.
 */
export type IdempotencyOutcome =
  | { kind: "claimed" }
  | { kind: "replay"; status: number; body: unknown; headers?: Record<string, string> }
  | { kind: "in_flight"; retryAfterSeconds: number }
  | { kind: "conflict" };

export interface IdempotencyRecord {
  scope: string; // e.g. `POST /checkout_sessions`
  key: string;
  /** Hex SHA-256 of the canonical request body. */
  bodyHash: string;
  /** "in_flight" | "complete". */
  state: "in_flight" | "complete";
  /** Unix seconds. */
  createdAt: number;
  /** Unix seconds; absent until state="complete". */
  completedAt?: number;
  /** Cached response (only when state="complete"). */
  response?: {
    status: number;
    body: unknown;
    headers?: Record<string, string>;
  };
}

/**
 * Pluggable adapter for idempotency state. The default in-memory adapter
 * lives in `state.ts` (`InMemoryStateAdapter`); production deployments
 * should use the Vercel KV adapter or roll their own (Postgres, Redis).
 *
 * Implementations MUST guarantee atomicity on `tryClaim` — racing claims
 * must result in exactly one `claimed` and one or more `in_flight`.
 */
export interface IdempotencyStore {
  /** Atomically claim `(scope, key)` for `bodyHash`, OR return existing state. */
  tryClaim(
    scope: string,
    key: string,
    bodyHash: string,
    options?: { ttlSeconds?: number; retryAfterSeconds?: number },
  ): Promise<IdempotencyOutcome>;

  /** Persist the response after the operation completes. */
  complete(
    scope: string,
    key: string,
    response: NonNullable<IdempotencyRecord["response"]>,
  ): Promise<void>;

  /** Release a claim (e.g. on uncaught error) so a retry can proceed. */
  release(scope: string, key: string): Promise<void>;
}

export interface ValidatedIdempotencyKey {
  key: string;
  bodyHash: string;
}

/**
 * Validate the `Idempotency-Key` header. Returns the validated key (and the
 * computed body hash) or an `AcpError` you can return as 400.
 */
export async function validateIdempotencyKey(
  header: string | null | undefined,
  rawBody: string,
): Promise<ValidatedIdempotencyKey | AcpError> {
  if (!header || header.length === 0) {
    return {
      type: "invalid_request",
      code: "idempotency_key_required",
      message: "Idempotency-Key header is required.",
    };
  }
  if (header.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    return {
      type: "invalid_request",
      code: "idempotency_key_required",
      message: `Idempotency-Key exceeds ${MAX_IDEMPOTENCY_KEY_LENGTH} chars.`,
    };
  }
  const bodyHash = await sha256Hex(rawBody);
  return { key: header, bodyHash };
}

/**
 * Compute a stable hash of any JSON-serializable body. Deterministic across
 * platforms — uses sorted keys.
 */
export async function hashBody(body: unknown): Promise<string> {
  const canonical = canonicalize(body);
  return sha256Hex(canonical);
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

/**
 * Canonical JSON serialization with sorted keys for stable hashing.
 * Recursive, handles arrays, objects, primitives. Drops `undefined` values
 * (matching JSON.stringify behavior).
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const entries: string[] = [];
  for (const k of keys) {
    const v = obj[k];
    if (v === undefined) continue;
    entries.push(`${JSON.stringify(k)}:${canonicalize(v)}`);
  }
  return `{${entries.join(",")}}`;
}

async function sha256Hex(data: string): Promise<string> {
  const subtle = getSubtleCrypto();
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(data));
  return bytesToHex(new Uint8Array(buf));
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += (bytes[i] as number).toString(16).padStart(2, "0");
  }
  return out;
}

function getSubtleCrypto(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error(
      "WebCrypto API is required (globalThis.crypto.subtle). " +
        "Available in Node 20+, browsers, Vercel Edge, Cloudflare Workers, Deno, Bun.",
    );
  }
  return c.subtle;
}
