// Test helpers — `MockFetch` builder + a pre-wired client factory.
//
// Hosts that want to unit-test agent flows that consume the MELI client
// can fixture responses without a real MELI account:
//
//   import { mockFetch, makeMeliClient } from "@ar-agents/mercadolibre/testing";
//
//   const fetchMock = mockFetch()
//     .on("GET", "/items/MLA1", () => ({ status: 200, body: { ... } }))
//     .on("POST", "/answers", (req) => ({ status: 200, body: { id: 1, text: req.body.text } }))
//     .build();
//
//   const client = makeMeliClient({ fetch: fetchMock, accessToken: "test" });

import { MeliClient, type MeliClientOptions } from "./client";
import { NoopRateLimiter } from "./rate-limiter";

export interface MockRequestSnapshot {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export interface MockResponse {
  status: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export type MockHandler = (
  req: MockRequestSnapshot,
) => MockResponse | Promise<MockResponse>;

export interface MockFetchBuilder {
  /** Match exact method+pathname. */
  on(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    pathname: string,
    handler: MockHandler,
  ): MockFetchBuilder;
  /** Match a regex against pathname. */
  onRegex(
    method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH",
    pattern: RegExp,
    handler: MockHandler,
  ): MockFetchBuilder;
  /** Catch-all fallback (defaults to 404). */
  fallback(handler: MockHandler): MockFetchBuilder;
  /** Return the mock fetch fn + a recorder of all requests received. */
  build(): MockFetch;
}

export interface MockFetch {
  fetch: typeof fetch;
  /** All requests received, in order. */
  requests: MockRequestSnapshot[];
}

interface Rule {
  method: string;
  match: (pathname: string) => boolean;
  handler: MockHandler;
}

export function mockFetch(): MockFetchBuilder {
  const rules: Rule[] = [];
  let fallback: MockHandler = () => ({ status: 404, body: { error: "not_found" } });

  const builder: MockFetchBuilder = {
    on(method, pathname, handler) {
      rules.push({
        method,
        match: (p) => p === pathname,
        handler,
      });
      return builder;
    },
    onRegex(method, pattern, handler) {
      rules.push({
        method,
        match: (p) => pattern.test(p),
        handler,
      });
      return builder;
    },
    fallback(handler) {
      fallback = handler;
      return builder;
    },
    build() {
      const requests: MockRequestSnapshot[] = [];
      const f: typeof fetch = async (input, init) => {
        const urlStr = typeof input === "string" ? input : (input as Request).url;
        const u = new URL(urlStr);
        const method = (init?.method ?? "GET").toUpperCase();
        const headers: Record<string, string> = {};
        const headersInit = (init?.headers ?? {}) as
          | Record<string, string>
          | Headers
          | string[][];
        if (headersInit instanceof Headers) {
          headersInit.forEach((v, k) => {
            headers[k] = v;
          });
        } else if (Array.isArray(headersInit)) {
          for (const [k, v] of headersInit) {
            if (k && v) headers[k] = v;
          }
        } else {
          for (const [k, v] of Object.entries(headersInit)) {
            headers[k] = v;
          }
        }
        let parsedBody: unknown = null;
        if (init?.body !== undefined && init.body !== null) {
          if (typeof init.body === "string") {
            try {
              parsedBody = JSON.parse(init.body);
            } catch {
              parsedBody = init.body;
            }
          } else {
            parsedBody = init.body;
          }
        }
        const snapshot: MockRequestSnapshot = {
          method,
          url: urlStr,
          headers,
          body: parsedBody,
        };
        requests.push(snapshot);
        const matched = rules.find(
          (r) => r.method === method && r.match(u.pathname),
        );
        const handler = matched?.handler ?? fallback;
        const result = await handler(snapshot);
        const responseHeaders: Record<string, string> = {
          "Content-Type": "application/json",
          ...(result.headers ?? {}),
        };
        return new Response(
          result.body !== undefined ? JSON.stringify(result.body) : null,
          {
            status: result.status,
            headers: responseHeaders,
          },
        );
      };
      return { fetch: f, requests };
    },
  };
  return builder;
}

// ---------------------------------------------------------------------------
// Convenience: pre-wired client for tests
// ---------------------------------------------------------------------------

export interface MakeMeliClientOptions {
  /** Mock fetch implementation. */
  fetch: typeof fetch;
  /** Access token to embed (sent as `Bearer <token>`). Defaults to "test_token". */
  accessToken?: string;
  /** Override base URL (the mock fetch can ignore the host but we set one for url-building). */
  baseUrl?: string;
  /** Skip Zod response validation (useful when fixtures are minimal). */
  skipResponseValidation?: boolean;
}

export function makeMeliClient(opts: MakeMeliClientOptions): MeliClient {
  const init: MeliClientOptions = {
    auth: { kind: "bearer", accessToken: opts.accessToken ?? "test_token" },
    fetch: opts.fetch,
    rateLimiter: new NoopRateLimiter(),
    skipResponseValidation: opts.skipResponseValidation ?? false,
  };
  if (opts.baseUrl !== undefined) init.baseUrl = opts.baseUrl;
  return new MeliClient(init);
}
