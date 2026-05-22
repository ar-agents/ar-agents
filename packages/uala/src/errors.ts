/**
 * Ualá error model. All public-API errors inherit from `UalaError` so
 * agents (and ar-agents/tool() callers) can `instanceof` dispatch in one
 * branch instead of pattern-matching across cases.
 */

export class UalaError extends Error {
  public readonly code: string;
  public readonly status?: number | undefined;
  public readonly details?: unknown;

  constructor(
    code: string,
    message: string,
    opts: { status?: number; details?: unknown } = {},
  ) {
    super(message);
    this.name = "UalaError";
    this.code = code;
    if (opts.status !== undefined) this.status = opts.status;
    if (opts.details !== undefined) this.details = opts.details;
  }
}

export class UalaUnconfiguredError extends UalaError {
  constructor(operation: string) {
    super(
      "unconfigured",
      `Ualá adapter is not configured. Operation "${operation}" requires a real UalaAdapter (e.g. UalaApiAdapter) wired with credentials. The default UnconfiguredUalaAdapter is for unit-tests only.`,
    );
    this.name = "UalaUnconfiguredError";
  }
}

export class UalaAuthError extends UalaError {
  constructor(message = "Authentication failed against Ualá API.") {
    super("auth_failed", message, { status: 401 });
    this.name = "UalaAuthError";
  }
}

export class UalaApiError extends UalaError {
  constructor(status: number, body: unknown) {
    super(
      "api_error",
      `Ualá API returned HTTP ${status}. ` +
        `Body: ${typeof body === "string" ? body.slice(0, 200) : JSON.stringify(body).slice(0, 200)}`,
      { status, details: body },
    );
    this.name = "UalaApiError";
  }
}

export class UalaValidationError extends UalaError {
  constructor(field: string, message: string) {
    super("validation", `Invalid "${field}": ${message}`);
    this.name = "UalaValidationError";
  }
}
