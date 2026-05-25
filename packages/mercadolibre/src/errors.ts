// Typed errors for `@ar-agents/mercadolibre`. All client failures funnel
// through one of these so consumers can `if (err instanceof MeliApiError)`
// without parsing strings.
//
// `MeliError` extends `ArAgentsError` from `@ar-agents/core` so the
// family contract (code / retryable / context) is uniform across every
// `@ar-agents/*` integration.

import { ArAgentsError } from "@ar-agents/core";

/** Common base. */
export abstract class MeliError extends ArAgentsError {
  abstract override readonly code: string;
  constructor(message: string, init: { retryable?: boolean; context?: Record<string, unknown>; cause?: unknown } = {}) {
    super(message, {
      code: "meli_error",
      retryable: init.retryable ?? false,
      context: init.context ?? {},
      cause: init.cause,
    });
    this.name = this.constructor.name;
  }
}

/** Shape of MELI's typical error envelope. The fields are not guaranteed —
 *  legacy endpoints sometimes use `{ status, message }` only, and some
 *  post-purchase routes return `{ error_code, description }`. We extract
 *  both shapes opportunistically. */
export interface MeliErrorBody {
  /** MELI's machine-readable error slug (e.g., "rate_limited",
   *  "forbidden", "validation_error"). */
  error?: string;
  /** Human-readable message MELI returns alongside `error`. */
  message?: string;
  /** Echoed status code (some MELI endpoints duplicate it in the body). */
  status?: number;
  /** Multi-issue causes — typically array of `{ code, message }` for
   *  validation failures on `createItem` / `updateItem`. */
  cause?: Array<{ code?: string | number; message?: string; [k: string]: unknown }>;
}

/** A MELI API call returned a non-2xx after retries are exhausted. */
export class MeliApiError extends MeliError {
  readonly code = "meli_api_error";
  /** MELI's error slug if present (`error` field on the body). Stable +
   *  documented; safe to switch on in your code. */
  readonly meliCode: string | null;
  /** MELI's human-readable error message if present. */
  readonly meliMessage: string | null;
  /** Multi-issue causes (validation failures usually). */
  readonly meliCauses: ReadonlyArray<{
    code?: string | number;
    message?: string;
    [k: string]: unknown;
  }>;

  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
    const parsed = parseMeliErrorBody(body);
    this.meliCode = parsed.error ?? null;
    this.meliMessage = parsed.message ?? null;
    this.meliCauses = parsed.cause ?? [];
  }

  /** Back-compat — same as `meliCode`. New code should read `meliCode` directly. */
  meliErrorCode(): string | null {
    return this.meliCode;
  }

  /**
   * True if MELI explicitly told us this was a rate-limit hit
   * (vs. a 429 with no body, or a 5xx). Use this to drive a longer backoff
   * in your retry loop.
   */
  isRateLimited(): boolean {
    return this.status === 429 || this.meliCode === "rate_limited";
  }

  /**
   * True if the request hit the seller's permission boundary — typically
   * because the bearer token doesn't own the resource being addressed.
   * Don't retry; surface to the user.
   */
  isForbidden(): boolean {
    return this.status === 403 || this.meliCode === "forbidden";
  }

  /**
   * True if MELI says this access_token is invalid / expired.
   * The OAuth flow's `ensureAccessToken` should be re-driven before retrying.
   */
  isUnauthorized(): boolean {
    return this.status === 401 || this.meliCode === "unauthorized" || this.meliCode === "invalid_token";
  }

  /** True if MELI's body identifies this as validation-failure on inputs. */
  isValidationError(): boolean {
    return this.meliCode === "validation_error" || this.status === 400;
  }
}

/** Best-effort parse of MELI's error envelope. Tolerates missing fields
 *  and the post-purchase `{ error_code, description }` variant. */
function parseMeliErrorBody(body: unknown): MeliErrorBody {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const out: MeliErrorBody = {};
  if (typeof b["error"] === "string") out.error = b["error"];
  else if (typeof b["error_code"] === "string") out.error = b["error_code"];
  if (typeof b["message"] === "string") out.message = b["message"];
  else if (typeof b["description"] === "string") out.message = b["description"];
  if (typeof b["status"] === "number") out.status = b["status"];
  if (Array.isArray(b["cause"])) {
    out.cause = b["cause"].filter(
      (c): c is { code?: string | number; message?: string } =>
        typeof c === "object" && c !== null,
    );
  }
  return out;
}

/** OAuth-related failure (token refresh, callback, etc.). */
export class MeliAuthError extends MeliError {
  readonly code = "meli_auth_error";
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** Rate limit hit and retries are exhausted. */
export class MeliRateLimitError extends MeliError {
  readonly code = "meli_rate_limit";
  constructor(
    public readonly retryAfterSeconds: number,
    public readonly url: string,
  ) {
    super(
      `MELI rate limit exhausted on ${url}; retry in ${retryAfterSeconds}s`,
    );
  }
}

/** The host's network failed (DNS, TLS, fetch threw). */
export class MeliNetworkError extends MeliError {
  readonly code = "meli_network_error";
  constructor(
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
  }
}

/** A response body failed Zod validation. */
export class MeliValidationError extends MeliError {
  readonly code = "meli_validation_error";
  constructor(
    message: string,
    public readonly issues: unknown,
  ) {
    super(message);
  }
}

/** Webhook signature verification failed (where ML supports it). */
export class MeliWebhookError extends MeliError {
  readonly code = "meli_webhook_error";
  constructor(
    public readonly detail:
      | "missing_topic"
      | "missing_resource"
      | "unknown_topic"
      | "malformed_body"
      | "missed_feeds_unauthorized",
    message: string,
  ) {
    super(message);
  }
}

/** Convenience type guard. */
export function isMeliError(e: unknown): e is MeliError {
  return e instanceof MeliError;
}
