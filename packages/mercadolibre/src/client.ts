// `MeliClient` — typed HTTP client for the MercadoLibre API.
//
// Behaviour:
//   - Bearer auth via OAuth access_token. The client coalesces concurrent
//     calls per seller and refreshes tokens via the configured store.
//   - Per-seller rate limit (token bucket; default 24/s, burst 60).
//   - Exponential-backoff retry on 5xx + 429 + network errors.
//   - Response body validation via Zod (with a flag to disable for hot paths).
//   - Single base URL: `https://api.mercadolibre.com`.
//
// Domain-specific helpers (`items`, `categories`, etc.) compose this client
// — they call `client.fetch(path, opts)` with the appropriate type.

import {
  MeliApiError,
  MeliAuthError,
  MeliNetworkError,
  MeliValidationError,
} from "./errors";
import {
  TokenBucketRateLimiter,
  type RateLimiter,
} from "./rate-limiter";
import {
  fetchWithRetry,
  type RetryClassifier,
  type RetryOptions,
  defaultRetryClassifier,
} from "./retry";
import {
  ensureAccessToken,
  type OAuthAppCredentials,
  type OAuthTokenStore,
} from "./oauth";
import {
  generateRequestId,
  noopTelemetry,
  type TelemetryHooks,
} from "./telemetry";
import type { ZodType } from "zod";

const DEFAULT_BASE_URL = "https://api.mercadolibre.com";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export type AuthMode =
  | { kind: "bearer"; accessToken: string }
  | { kind: "oauth"; userId: number; app: OAuthAppCredentials; store: OAuthTokenStore }
  | { kind: "none" };

export interface MeliClientOptions {
  /** Auth strategy. Use `bearer` for direct tokens, `oauth` for managed
   *  refresh, or `none` for public endpoints (search, sites, currencies). */
  auth: AuthMode;
  /** Override base URL — useful for testing against a mock server. */
  baseUrl?: string;
  /** Override fetch (e.g. msw). Defaults to globalThis.fetch. */
  fetch?: typeof fetch;
  /** Rate limiter implementation. Default: TokenBucketRateLimiter. */
  rateLimiter?: RateLimiter;
  /** Retry options forwarded to `fetchWithRetry`. */
  retry?: RetryOptions;
  /** Custom retry classifier. */
  retryClassifier?: RetryClassifier;
  /** User-Agent string. Default: `@ar-agents/mercadolibre/<version>`. */
  userAgent?: string;
  /** When true, skip Zod validation on responses (hot paths). Default false. */
  skipResponseValidation?: boolean;
  /** Pluggable telemetry hooks (OpenTelemetry, Sentry, Datadog, custom). */
  telemetry?: TelemetryHooks;
  /** Per-request timeout in milliseconds. Default 30000.
   *  Wedged TCP connections that never return data otherwise burn a Vercel
   *  Edge function's entire 25-60s budget on attempt #1 and never retry. */
  requestTimeoutMs?: number;
}

export interface FetchOptions<T = unknown> {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  /** Path relative to base URL (must start with `/`). */
  path: string;
  /** Query string parameters. */
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Pre-serialized body. If set, body is sent as-is. */
  body?: unknown;
  /** When set, response is parsed against this Zod schema. */
  responseSchema?: ZodType<T>;
  /** Override per-call User-Agent. */
  userAgent?: string;
  /** Per-call retry override. */
  retry?: RetryOptions;
  /** AbortSignal. */
  signal?: AbortSignal;
  /** Override the rate-limit scope. Default: derived from auth (`seller:<userId>`). */
  rateLimitScope?: string;
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export class MeliClient {
  readonly baseUrl: string;
  private readonly auth: AuthMode;
  private readonly fetchImpl: typeof fetch;
  private readonly rateLimiter: RateLimiter;
  private readonly retry: RetryOptions;
  private readonly retryClassifier: RetryClassifier;
  private readonly userAgent: string;
  private readonly skipResponseValidation: boolean;
  private readonly telemetry: Required<TelemetryHooks>;
  private readonly requestTimeoutMs: number;

  constructor(options: MeliClientOptions) {
    this.auth = options.auth;
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl =
      options.fetch ??
      ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch);
    if (typeof this.fetchImpl !== "function") {
      throw new Error(
        "MeliClient requires `fetch` (Node 20+, browsers, Vercel Edge, etc.).",
      );
    }
    this.rateLimiter = options.rateLimiter ?? new TokenBucketRateLimiter();
    this.retry = options.retry ?? {};
    this.retryClassifier = options.retryClassifier ?? defaultRetryClassifier;
    this.userAgent = options.userAgent ?? `@ar-agents/mercadolibre/0.1`;
    this.skipResponseValidation = options.skipResponseValidation ?? false;
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.telemetry = {
      onRequest: options.telemetry?.onRequest ?? noopTelemetry.onRequest,
      onResponse: options.telemetry?.onResponse ?? noopTelemetry.onResponse,
      onRetry: options.telemetry?.onRetry ?? noopTelemetry.onRetry,
      onRateLimitWait:
        options.telemetry?.onRateLimitWait ?? noopTelemetry.onRateLimitWait,
    };
  }

  /**
   * Like `fetch`, but returns the raw `Response`. Used for binary endpoints
   * (e.g., `/shipment_labels` returning PDF/ZPL). Goes through the same
   * auth + rate-limit + retry + telemetry plumbing.
   *
   * Throws on non-2xx the same way `fetch<T>` does.
   */
  async fetchRaw(
    options: FetchOptions<unknown> & { acceptHeader?: string },
  ): Promise<Response> {
    return (await this.executeRequest({ ...options, parseAsJson: false })) as Response;
  }

  /**
   * Make a request. Returns the parsed-and-validated response.
   *
   * Throws:
   *   - `MeliAuthError` if OAuth refresh fails
   *   - `MeliApiError` if status >= 400 after retries
   *   - `MeliNetworkError` if fetch threw
   *   - `MeliValidationError` if response failed Zod validation
   */
  async fetch<T = unknown>(options: FetchOptions<T>): Promise<T> {
    return this.executeRequest({ ...options, parseAsJson: true }) as Promise<T>;
  }

  /** Internal — runs the full request pipeline. JSON-parses unless told otherwise. */
  private async executeRequest(
    options: FetchOptions<unknown> & {
      parseAsJson: boolean;
      acceptHeader?: string;
    },
  ): Promise<unknown> {
    const url = this.buildUrl(options.path, options.query);
    const requestId = generateRequestId();
    const startedAt = Date.now();
    let attempts = 1;

    // 1. Resolve auth header.
    const authHeader = await this.resolveAuthHeader();

    // 2. Acquire rate-limit token.
    const scope = options.rateLimitScope ?? this.deriveRateLimitScope();
    const rateLimitStartedAt = Date.now();
    await this.rateLimiter.acquire(scope);
    const rateLimitWaitMs = Date.now() - rateLimitStartedAt;
    if (rateLimitWaitMs > 0) {
      this.telemetry.onRateLimitWait({ scope, waitMs: rateLimitWaitMs });
    }

    this.telemetry.onRequest({
      requestId,
      startedAt,
      method: options.method ?? "GET",
      url,
      path: options.path,
      attempt: 1,
    });

    // 3. Build request init. Compose a per-request timeout signal with the
    // caller's signal (if any) so wedged connections can't burn the agent's
    // budget on a single attempt.
    const timeoutSignal = AbortSignal.timeout(this.requestTimeoutMs);
    const composedSignal = options.signal
      ? anySignal(options.signal, timeoutSignal)
      : timeoutSignal;
    const init: RequestInit = {
      method: options.method ?? "GET",
      headers: {
        Accept: options.acceptHeader ?? "application/json",
        "User-Agent": options.userAgent ?? this.userAgent,
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(options.body !== undefined && options.body !== null
          ? { "Content-Type": "application/json" }
          : {}),
      },
      ...(options.body !== undefined && options.body !== null
        ? { body: typeof options.body === "string" ? options.body : JSON.stringify(options.body) }
        : {}),
      signal: composedSignal,
    };

    // 4. Do the request with retry.
    const wrappedRetry: RetryOptions = {
      ...this.retry,
      ...(options.retry ?? {}),
      onRetry: (attempt: number, lastError: unknown) => {
        attempts = attempt + 1;
        const retryResponse = (lastError as { response?: Response }).response;
        const reason: "status" | "network" | "timeout" = retryResponse
          ? "status"
          : (lastError as { name?: string })?.name === "AbortError"
            ? "timeout"
            : "network";
        const event: import("./telemetry").TelemetryRetryEvent = {
          requestId,
          attempt,
          reason,
          delayMs: 0,
        };
        if (retryResponse) event.status = retryResponse.status;
        this.telemetry.onRetry(event);
        (this.retry.onRetry ?? options.retry?.onRetry)?.(attempt, lastError);
      },
    };
    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        init,
        wrappedRetry,
        this.retryClassifier,
        this.fetchImpl,
      );
    } catch (err) {
      // Rethrow as our typed error so consumers can branch.
      if (err instanceof Error && (err as { response?: Response }).response) {
        const r = (err as { response?: Response }).response!;
        const errorBody = await safeReadJson(r);
        throw new MeliApiError(
          `MELI API ${r.status} on ${options.method ?? "GET"} ${options.path}`,
          r.status,
          url,
          errorBody,
          r.headers.get("x-request-id") ?? undefined,
        );
      }
      throw new MeliNetworkError(
        `MELI fetch failed for ${options.method ?? "GET"} ${options.path}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }

    // 5. Parse + validate.
    const meliReqId = response.headers.get("x-request-id");
    const responseEvent: import("./telemetry").TelemetryResponseEvent = {
      requestId,
      endedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      status: response.status,
      attempts,
    };
    if (meliReqId) responseEvent.meliRequestId = meliReqId;
    this.telemetry.onResponse(responseEvent);

    // Raw mode: return the Response untouched (caller handles binary body).
    if (!options.parseAsJson) {
      if (response.status >= 400) {
        // Try to read a JSON error body for context, but tolerate non-JSON.
        const errorBody = await safeReadJson(response.clone());
        throw new MeliApiError(
          `MELI API ${response.status} on ${options.method ?? "GET"} ${options.path}`,
          response.status,
          url,
          errorBody,
          response.headers.get("x-request-id") ?? undefined,
        );
      }
      return response;
    }

    if (response.status === 204 || response.status === 205) {
      return undefined;
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch (err) {
      throw new MeliApiError(
        `MELI returned non-JSON body on ${options.path}`,
        response.status,
        url,
        null,
        response.headers.get("x-request-id") ?? undefined,
      );
    }

    if (response.status >= 400) {
      throw new MeliApiError(
        `MELI API ${response.status} on ${options.method ?? "GET"} ${options.path}`,
        response.status,
        url,
        body,
        response.headers.get("x-request-id") ?? undefined,
      );
    }

    if (options.responseSchema && !this.skipResponseValidation) {
      const parsed = options.responseSchema.safeParse(body);
      if (!parsed.success) {
        throw new MeliValidationError(
          `Response from ${options.path} failed validation: ${
            parsed.error.issues[0]?.message ?? "unknown"
          }`,
          parsed.error.issues,
        );
      }
      return parsed.data;
    }
    return body;
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private async resolveAuthHeader(): Promise<string | null> {
    switch (this.auth.kind) {
      case "none":
        return null;
      case "bearer":
        return `Bearer ${this.auth.accessToken}`;
      case "oauth": {
        const tokens = await ensureAccessToken({
          userId: this.auth.userId,
          app: this.auth.app,
          store: this.auth.store,
          fetchImpl: this.fetchImpl,
        }).catch((err) => {
          throw err instanceof Error ? new MeliAuthError(err.message, err) : err;
        });
        return `Bearer ${tokens.access_token}`;
      }
    }
  }

  private deriveRateLimitScope(): string {
    if (this.auth.kind === "oauth") return `seller:${this.auth.userId}`;
    if (this.auth.kind === "bearer") {
      // Hash instead of slicing the token. Slicing leaks the last 8 chars
      // into telemetry; hashing produces an opaque, collision-resistant id.
      // Use a non-cryptographic FNV-1a 32-bit (deterministic, no async).
      return `bearer:${fnv1a32(this.auth.accessToken)}`;
    }
    return "anon";
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number | boolean | undefined | null>,
  ): string {
    // Defence in depth against SSRF: reject any path that includes a scheme
    // (`http://...`) or a protocol-relative authority (`//evil.com/x`).
    // Without this, a path containing an absolute URL would silently rebase
    // the request onto an attacker's host. Domain helpers always pass paths
    // beginning with `/`, so this only catches mistakes (or attacks) before
    // they reach the network.
    if (
      typeof path !== "string" ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ||
      path.startsWith("//") ||
      path.includes(" ")
    ) {
      throw new Error(
        `MeliClient: refusing to fetch path that looks like an absolute URL or contains NUL: ${JSON.stringify(path)}`,
      );
    }
    const url = new URL(path.startsWith("/") ? path : `/${path}`, this.baseUrl);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }
}

async function safeReadJson(r: Response): Promise<unknown> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

/** Compose multiple AbortSignals into one. The result aborts when any input
 *  aborts. Pure ES2022, works on Node 20+ / browsers / Edge. */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  if (typeof (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any === "function") {
    return (AbortSignal as unknown as { any: (s: AbortSignal[]) => AbortSignal }).any(signals);
  }
  // Polyfill for runtimes without AbortSignal.any (older Node 20.x).
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort();
      break;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }
  return ctrl.signal;
}

/** FNV-1a 32-bit hash. Used to scope rate-limit buckets without leaking tokens. */
function fnv1a32(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}
