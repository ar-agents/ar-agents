// Typed errors for `@ar-agents/mercadolibre`. All client failures funnel
// through one of these so consumers can `if (err instanceof MeliApiError)`
// without parsing strings.

/** Common base. */
export abstract class MeliError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** A MELI API call returned a non-2xx after retries are exhausted. */
export class MeliApiError extends MeliError {
  readonly code = "meli_api_error";
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
  }

  /** Convenience: did MELI return a documented error code? */
  meliErrorCode(): string | null {
    const body = this.body as { error?: unknown; message?: unknown } | null;
    if (body && typeof body.error === "string") return body.error;
    return null;
  }
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
