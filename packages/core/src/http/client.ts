// `HttpClient` — the one HTTP transport every @ar-agents/* adapter should build
// on. It concentrates the things each adapter used to re-invent (usually
// incompletely): a real per-request timeout, bounded jittered backoff,
// 429/Retry-After handling, idempotency-aware retry, SSRF-safe URL building,
// typed `ArAgentsError` mapping, and — the reason this exists — response-schema
// validation at the boundary so a malformed body fails LOUD instead of being
// blind-cast into a clean-looking result.
//
// Scope note: this is transport + validation, not a rate limiter. Proactive
// throttling (e.g. MELI's per-seller token bucket) stays in the adapters that
// need it; the client handles reactive 429s.

import {
  ArAgentsAuthError,
  ArAgentsError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
} from "../errors";
import {
  defaultRetryClassifier,
  fetchWithRetry,
  parseRetryAfter,
  type HttpRetryOptions,
  type RetryClassifier,
} from "./retry";
import { parseOrThrow, type ResponseSchema } from "./schema";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";

export type QueryParams = Record<string, string | number | boolean | undefined | null>;

/**
 * Supplies the `Authorization` header value (the FULL value, e.g.
 * `"Bearer abc"`). A function is called per request so token refresh is
 * transparent; return `null` for an unauthenticated request.
 */
export type AuthProvider =
  | string
  | (() => string | null | Promise<string | null>);

export interface HttpClientOptions {
  /** Base URL; every request path is resolved against it. */
  baseUrl: string;
  /** Override fetch (tests / msw). Defaults to `globalThis.fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
  /** Retry policy forwarded to {@link fetchWithRetry}. */
  retry?: HttpRetryOptions;
  /** Custom retry classifier. Default: idempotency-aware 5xx/429/network. */
  retryClassifier?: RetryClassifier;
  /** `User-Agent` sent on every request. */
  userAgent?: string;
  /** Headers merged into every request (request-level headers win). */
  defaultHeaders?: Record<string, string>;
  /** Provides the `Authorization` header value; see {@link AuthProvider}. */
  auth?: AuthProvider;
}

export interface HttpRequest<T = unknown> {
  method?: HttpMethod;
  /** Path relative to `baseUrl` (must start with `/`). Absolute URLs rejected. */
  path: string;
  query?: QueryParams;
  /** Request body. Objects are JSON-serialized; strings are sent as-is. */
  body?: unknown;
  /** Per-request headers (override `defaultHeaders`). */
  headers?: Record<string, string>;
  /**
   * Schema validated against the 2xx JSON body. STRONGLY recommended on
   * money/State paths: without it the raw parsed JSON is returned and the old
   * blind-cast footgun is back. With it, a malformed body throws
   * `ArAgentsResponseValidationError`.
   */
  schema?: ResponseSchema<T>;
  /** Caller AbortSignal, composed with the per-request timeout. */
  signal?: AbortSignal;
  /** Per-request timeout override (ms). */
  timeoutMs?: number;
  /**
   * Mark a non-idempotent method (POST/PATCH) as safe to retry — e.g. the
   * endpoint is idempotent or you set an Idempotency-Key header. Default:
   * method-based (GET/PUT/DELETE/HEAD retried, POST/PATCH not).
   */
  idempotent?: boolean;
  /** Per-request retry override, or `false` to disable retry entirely. */
  retry?: HttpRetryOptions | false;
  /** `Accept` header. Default `application/json`. */
  accept?: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class HttpClient {
  readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly retry: HttpRetryOptions;
  private readonly retryClassifier: RetryClassifier;
  private readonly userAgent: string | undefined;
  private readonly defaultHeaders: Record<string, string>;
  private readonly auth: AuthProvider | undefined;

  constructor(options: HttpClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.fetchImpl =
      options.fetch ?? ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch);
    if (typeof this.fetchImpl !== "function") {
      throw new ArAgentsProtocolError(
        "HttpClient requires `fetch` (Node 20+, browsers, or Vercel Edge). Pass `fetch` explicitly if none is global.",
      );
    }
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.retry = options.retry ?? {};
    this.retryClassifier = options.retryClassifier ?? defaultRetryClassifier;
    this.userAgent = options.userAgent;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.auth = options.auth;
  }

  /** Make a request and return the parsed (and, if `schema` given, validated) body. */
  async request<T = unknown>(req: HttpRequest<T>): Promise<T> {
    const res = await this.execute(req);
    if (res.status === 204 || res.status === 205) return undefined as T;

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      throw new ArAgentsProtocolError(
        `${req.method ?? "GET"} ${this.hostOf(res.url)} returned a non-JSON body`,
        { status: res.status, context: { url: res.url }, cause: err },
      );
    }
    if (req.schema) {
      return parseOrThrow(req.schema, body, { url: res.url, status: res.status });
    }
    return body as T;
  }

  /**
   * Make a request and return the raw `Response` (for binary bodies: PDFs, ZPL
   * labels, SOAP XML). Still runs the full auth + timeout + retry pipeline and
   * still throws a typed error on status >= 400 — the caller only owns body
   * decoding.
   */
  async requestRaw(req: HttpRequest): Promise<Response> {
    return this.execute(req);
  }

  /** Shared pipeline. Returns a < 400 Response; throws a typed error otherwise. */
  private async execute(req: HttpRequest): Promise<Response> {
    const method = req.method ?? "GET";
    const url = this.buildUrl(req.path, req.query);
    const authHeader = await this.resolveAuth();

    const headers: Record<string, string> = {
      Accept: req.accept ?? "application/json",
      ...this.defaultHeaders,
      ...(this.userAgent ? { "User-Agent": this.userAgent } : {}),
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(req.headers ?? {}),
    };
    const hasBody = req.body !== undefined && req.body !== null;
    if (hasBody && headers["Content-Type"] === undefined && headers["content-type"] === undefined) {
      headers["Content-Type"] = "application/json";
    }

    const timeoutSignal = AbortSignal.timeout(req.timeoutMs ?? this.timeoutMs);
    const signal = req.signal ? anySignal(req.signal, timeoutSignal) : timeoutSignal;

    const init: RequestInit = {
      method,
      headers,
      signal,
      ...(hasBody
        ? { body: typeof req.body === "string" ? req.body : JSON.stringify(req.body) }
        : {}),
    };

    const retryOpts: HttpRetryOptions = req.retry === false ? { maxAttempts: 1 } : { ...this.retry, ...(req.retry ?? {}) };

    let response: Response;
    try {
      response = await fetchWithRetry(
        url,
        init,
        retryOpts,
        this.retryClassifier,
        this.fetchImpl,
        { method, ...(req.idempotent !== undefined ? { idempotent: req.idempotent } : {}) },
      );
    } catch (err) {
      // fetchWithRetry throws either a synthetic error carrying `.response`
      // (retryable status, attempts exhausted) or the raw network/timeout error.
      const carried = (err as { response?: Response }).response;
      if (carried) throw await this.toHttpError(carried, method);
      throw this.toNetworkError(err, method, url, req.signal);
    }

    if (response.status >= 400) throw await this.toHttpError(response, method);
    return response;
  }

  private async resolveAuth(): Promise<string | null> {
    if (this.auth === undefined) return null;
    if (typeof this.auth === "string") return this.auth;
    try {
      return await this.auth();
    } catch (err) {
      throw new ArAgentsAuthError(
        `Auth provider failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err instanceof Error ? err.message : String(err) },
      );
    }
  }

  /** Map a >= 400 Response to the right typed error, attaching a body snippet. */
  private async toHttpError(res: Response, method: string): Promise<ArAgentsError> {
    const body = await safeReadBodySnippet(res);
    const context: Record<string, unknown> = { url: res.url, method, status: res.status };
    if (body !== null) context["body"] = body;
    const where = `${method} ${this.hostOf(res.url)} → HTTP ${res.status}`;

    if (res.status === 401 || res.status === 403) {
      return new ArAgentsAuthError(where, context);
    }
    if (res.status === 429) {
      const header = res.headers.get("Retry-After");
      const retryAfterMs = (header ? parseRetryAfter(header) : null) ?? 0;
      return new ArAgentsRateLimitError(retryAfterMs, context);
    }
    return new ArAgentsProtocolError(where, { status: res.status, context });
  }

  /** Map a thrown network/timeout error. Caller-cancellation is re-raised as-is. */
  private toNetworkError(
    err: unknown,
    method: string,
    url: string,
    callerSignal: AbortSignal | undefined,
  ): unknown {
    // If the CALLER's signal is what aborted, honor the cancellation verbatim —
    // don't dress it up as a retryable protocol error.
    if (callerSignal?.aborted && err instanceof Error && err.name === "AbortError") {
      return err;
    }
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return new ArAgentsProtocolError(
      `${method} ${this.hostOf(url)} ${isTimeout ? "timed out" : "network error"}: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { status: null, context: { url, method, timeout: isTimeout }, cause: err },
    );
  }

  private buildUrl(path: string, query?: QueryParams): string {
    // SSRF defense: reject a "path" that is actually an absolute or
    // protocol-relative URL, which would silently rebase the request onto
    // another host. Adapters always pass a leading-slash path.
    if (
      typeof path !== "string" ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(path) ||
      path.startsWith("//") ||
      /\s/.test(path) ||
      /(^|\/)\.\.(\/|$)/.test(path)
    ) {
      throw new ArAgentsProtocolError(
        `HttpClient: refusing a path that is an absolute URL, escapes with ".." , or contains whitespace/NUL: ${JSON.stringify(path)}`,
      );
    }
    // Resolve RELATIVE to the base so a base WITH a path prefix
    // (e.g. https://host/wsfe) is preserved instead of being dropped by a
    // leading-slash "absolute" path.
    const url = new URL(path.replace(/^\/+/, ""), `${this.baseUrl}/`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined || v === null) continue;
        url.searchParams.set(k, String(v));
      }
    }
    return url.toString();
  }

  private hostOf(url: string): string {
    try {
      return new URL(url).host;
    } catch {
      return "(unknown host)";
    }
  }
}

/** Read a small JSON/text snippet from an error response for log context. Tolerant. */
async function safeReadBodySnippet(res: Response): Promise<unknown> {
  try {
    const text = await res.clone().text();
    if (text === "") return null;
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(0, 500);
    }
  } catch {
    return null;
  }
}

/**
 * Compose AbortSignals into one that aborts when any input does, propagating the
 * first abort reason. Uses native `AbortSignal.any` when present, else a small
 * polyfill for older Node 20.x.
 */
function anySignal(...signals: AbortSignal[]): AbortSignal {
  const anyFn = (AbortSignal as unknown as { any?: (s: AbortSignal[]) => AbortSignal }).any;
  if (typeof anyFn === "function") return anyFn(signals);

  const ctrl = new AbortController();
  const onAbort = (ev: Event) => ctrl.abort((ev.target as AbortSignal | null)?.reason);
  for (const s of signals) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener("abort", onAbort, { once: true });
  }
  return ctrl.signal;
}
