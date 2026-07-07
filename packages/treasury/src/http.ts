/**
 * Shared HTTP-migration glue for the treasury off-ramp adapters.
 *
 * The off-ramp providers (Manteca / Bitso / Ripio / Mural) all moved off their
 * hand-rolled `fetch` transport (with a `Promise.race` timeout at best, and no
 * timeout at all in Mural's case) onto the shared, schema-validating
 * `HttpClient` from @ar-agents/core. That client gives every provider — for free
 * — a real per-request timeout, 429/Retry-After backoff, idempotency-aware retry
 * (money POSTs are NEVER auto-retried), and typed `ArAgents*` errors. This file
 * holds the two pieces those adapters share:
 *
 *   1. `ResponseSchema` validators built WITHOUT zod. `@ar-agents/treasury`'s
 *      main entry is deliberately zod-free (zod is an optional peer, pulled only
 *      by `/tools`), so we cannot `import { z }` here. Instead we implement the
 *      tiny structural `safeParse` contract `parseOrThrow` needs. A malformed
 *      balance / quote / order body therefore fails LOUD
 *      (`ArAgentsResponseValidationError`) instead of being blind-cast into a
 *      fabricated zero-balance, false-success order, or bogus quote.
 *   2. `mapOffRampError` — maps a core transport error back into each provider's
 *      existing `*ApiError` / `*AuthError` / `*RateLimitError` taxonomy, so every
 *      error code the tests assert is preserved. A network/timeout
 *      (`ArAgentsProtocolError.status === null`) maps to the provider's
 *      transport-error path (status 0), NOT an API error.
 */

import {
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  type ResponseSchema,
} from "@ar-agents/core";

// ─────────────────────────────────────────────────────────────────────────────
// zod-free structural validators (satisfy core's `ResponseSchema<T>` duck type)
// ─────────────────────────────────────────────────────────────────────────────

type Issue = { path?: ReadonlyArray<PropertyKey>; message: string };

/** Build a `ResponseSchema<T>` from a predicate + a describing message. */
function schema<T>(
  check: (value: unknown) => { ok: true } | { ok: false; issue: Issue },
): ResponseSchema<T> {
  return {
    safeParse(value: unknown) {
      const r = check(value);
      if (r.ok) return { success: true, data: value as T };
      return { success: false, error: { issues: [r.issue] } };
    },
  };
}

/** The value is a non-null, non-array object. */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A schema asserting only that the body is a JSON OBJECT (not null, not an array,
 * not a bare string/number). This is the minimum a provider response must be
 * before we index into it — it rejects an HTML error page, a bare `"error"`
 * string, or a `null` that would otherwise be indexed as `{}` and fabricate a
 * missing-field result. Field-level shape is then read defensively by the
 * adapter's existing parsers (which normalize provider-specific string/number
 * quirks), so this guards the fabrication footgun without over-pinning a
 * provider shape we only partially control.
 */
export function objectSchema<T = Record<string, unknown>>(context: string): ResponseSchema<T> {
  return schema<T>((value) =>
    isObject(value)
      ? { ok: true }
      : {
          ok: false,
          issue: { message: `${context}: expected a JSON object, got ${describe(value)}` },
        },
  );
}

/** A schema asserting the body is a JSON ARRAY (e.g. Bitso's withdrawal list). */
export function arraySchema<T = unknown[]>(context: string): ResponseSchema<T> {
  return schema<T>((value) =>
    Array.isArray(value)
      ? { ok: true }
      : {
          ok: false,
          issue: { message: `${context}: expected a JSON array, got ${describe(value)}` },
        },
  );
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

// ─────────────────────────────────────────────────────────────────────────────
// error mapping back to each provider's taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/** The subset of a provider `*ApiError`/`*AuthError`/`*RateLimitError` ctor set. */
export interface OffRampErrorCtors {
  api: new (message: string, status: number, body?: unknown) => Error;
  auth: new (message: string, status: number, body?: unknown) => Error;
  rateLimit: new (message: string, status: number, body?: unknown) => Error;
}

/**
 * Map a core `HttpClient` error into a provider's error taxonomy.
 *
 * - `ArAgentsResponseValidationError` → surface LOUD as the provider's ApiError
 *   at status 502 (a malformed money/state body must never be swallowed into a
 *   fabricated success). Never mapped to a clean result.
 * - `ArAgentsAuthError` (401/403) → provider AuthError.
 * - `ArAgentsRateLimitError` (429) → provider RateLimitError.
 * - `ArAgentsProtocolError` with a numeric `.status` → provider ApiError(status).
 * - `ArAgentsProtocolError` with `.status === null` (network/timeout) → provider
 *   ApiError at status 0 (the pre-migration transport-error code these adapters
 *   already used for a caught `fetch` throw).
 *
 * Anything else is returned unchanged so a programming bug still throws as-is.
 */
export function mapOffRampError(
  err: unknown,
  where: string,
  ctors: OffRampErrorCtors,
): unknown {
  if (err instanceof ArAgentsResponseValidationError) {
    return new ctors.api(`${where}: ${err.message}`, 502, err.context);
  }
  if (err instanceof ArAgentsAuthError) {
    const status = statusOf(err.context) ?? 401;
    return new ctors.auth(`${where} -> ${status}`, status, bodyOf(err.context));
  }
  if (err instanceof ArAgentsRateLimitError) {
    return new ctors.rateLimit(`${where} -> 429`, 429, bodyOf(err.context));
  }
  if (err instanceof ArAgentsProtocolError) {
    if (err.status === null) {
      // Network / timeout: keep the pre-migration transport-error code (0).
      return new ctors.api(`${where} transport error: ${err.message}`, 0, bodyOf(err.context));
    }
    return new ctors.api(`${where} -> ${err.status}`, err.status, bodyOf(err.context));
  }
  return err;
}

function statusOf(context: Record<string, unknown>): number | undefined {
  const s = context["status"];
  return typeof s === "number" ? s : undefined;
}

function bodyOf(context: Record<string, unknown>): unknown {
  return context["body"];
}
