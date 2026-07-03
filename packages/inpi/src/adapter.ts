/**
 * Adapter contract for INPI.
 *
 * Defaults:
 *   - UnconfiguredInpiAdapter — throws (safe for tests)
 *   - InMemoryInpiAdapter — accepts seed data
 *   - HttpInpiAdapter — points at INPI's public search endpoint (v0.1
 *     reference impl; production use should pin a base-URL override
 *     because INPI's search UI lives at a few mirrors).
 */

import {
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  HttpClient,
  isArAgentsError,
  type HttpRetryOptions,
} from "@ar-agents/core";
import { z } from "zod";
import { InpiApiError, InpiUnconfiguredError } from "./errors";
import type {
  SearchInput,
  SearchResult,
  TrademarkRecord,
} from "./types";

export type FetchLike = typeof fetch;

export interface InpiAdapter {
  search(input: SearchInput): Promise<SearchResult>;
  getByActa(acta: string): Promise<TrademarkRecord | null>;
}

export class UnconfiguredInpiAdapter implements InpiAdapter {
  async search(): Promise<never> {
    throw new InpiUnconfiguredError("search");
  }
  async getByActa(): Promise<never> {
    throw new InpiUnconfiguredError("getByActa");
  }
}

export interface InMemoryInpiSeed {
  records?: TrademarkRecord[];
}

export class InMemoryInpiAdapter implements InpiAdapter {
  constructor(private readonly seed: InMemoryInpiSeed = {}) {}

  async search(input: SearchInput): Promise<SearchResult> {
    const all = this.seed.records ?? [];
    const q = input.q.toLowerCase();
    const filtered = all.filter((r) => {
      if (!r.denomination.toLowerCase().includes(q)) return false;
      if (input.niceClass !== undefined && r.niceClass !== input.niceClass) return false;
      if (input.status && r.status !== input.status) return false;
      return true;
    });
    const limit = Math.min(input.limit ?? 25, 100);
    return {
      query: input,
      records: filtered.slice(0, limit),
      hasMore: filtered.length > limit,
    };
  }

  async getByActa(acta: string): Promise<TrademarkRecord | null> {
    return (this.seed.records ?? []).find((r) => r.acta === acta) ?? null;
  }
}

export interface HttpInpiAdapterOptions {
  /** Override the base URL. Default: INPI's public search portal. */
  baseUrl?: string;
  fetch?: FetchLike;
  /** Per-request timeout in ms. Default 10_000. Without this a slow/flaky INPI
   * mirror would hang the agent forever (the reads had no timeout before). */
  timeoutMs?: number;
  /** Retry policy override. Default: 3 attempts with jittered backoff — the
   * searches are idempotent GETs against a flaky public mirror, so retrying a
   * transient 5xx/timeout is both safe and worthwhile. */
  retry?: HttpRetryOptions;
  /** User-Agent identifying the client. */
  userAgent?: string;
}

const DEFAULT_BASE = "https://servicios.inpi.gob.ar/marcas/v1";
const DEFAULT_UA = "@ar-agents/inpi (https://ar-agents.ar)";

// Trademark status enum, mirroring INPI's "estado" field. A body whose status
// isn't one of these fails validation rather than silently coercing.
const trademarkStatusSchema = z.enum([
  "presentada",
  "publicada",
  "oposicion",
  "concedida",
  "rechazada",
  "abandonada",
  "extinguida",
  "en_renovacion",
]);

const trademarkRecordSchema = z.object({
  acta: z.string(),
  denomination: z.string(),
  niceClass: z.number(),
  status: trademarkStatusSchema,
  holder: z.string(),
  presentedAt: z.string().optional(),
  grantedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  note: z.string().optional(),
});

// The anti-fabrication guard: a search response MUST carry a `records` array of
// valid trademark records. An error page, an empty `{}`, or a shape drift now
// FAILS LOUD (ArAgentsResponseValidationError) instead of being blind-cast into
// `records: []` and read downstream as "no conflicting trademarks" — the exact
// footgun that could greenlight registering an infringing mark.
const searchResponseSchema = z.object({
  records: z.array(trademarkRecordSchema),
  hasMore: z.boolean().optional(),
});

export class HttpInpiAdapter implements InpiAdapter {
  private readonly client: HttpClient;

  constructor(opts: HttpInpiAdapterOptions = {}) {
    const baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const fetchImpl =
      opts.fetch ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike | undefined);
    if (typeof fetchImpl !== "function") {
      throw new InpiUnconfiguredError("HttpInpiAdapter", "no fetch available");
    }
    this.client = new HttpClient({
      baseUrl,
      fetch: fetchImpl,
      timeoutMs: opts.timeoutMs ?? 10_000,
      userAgent: opts.userAgent ?? DEFAULT_UA,
      retry: opts.retry ?? { maxAttempts: 3 },
    });
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const query: Record<string, string | number> = { q: input.q };
    if (input.niceClass !== undefined) query["class"] = input.niceClass;
    if (input.status) query["status"] = input.status;
    if (input.limit) query["limit"] = input.limit;
    let parsed;
    try {
      parsed = await this.client.request({
        path: "/search",
        query,
        schema: searchResponseSchema,
      });
    } catch (err) {
      throw this.toInpiError(err);
    }
    // Build the envelope ourselves (like the InMemory adapter) rather than
    // trusting the upstream to echo `query`/`hasMore`. The cast only reconciles
    // zod's `string | undefined` optionals with the type's bare-optional fields.
    return {
      query: input,
      records: parsed.records as TrademarkRecord[],
      hasMore: parsed.hasMore ?? false,
    };
  }

  async getByActa(acta: string): Promise<TrademarkRecord | null> {
    try {
      const rec = await this.client.request({
        path: `/marcas/${encodeURIComponent(acta)}`,
        schema: trademarkRecordSchema,
      });
      return rec as TrademarkRecord;
    } catch (err) {
      // 404 is a legitimate "no such acta", not an error.
      if (err instanceof ArAgentsProtocolError && err.status === 404) return null;
      throw this.toInpiError(err);
    }
  }

  /**
   * Translate a core error into the INPI taxonomy. A malformed-body
   * `ArAgentsResponseValidationError` is surfaced as-is (fail loud, informative —
   * a failed search must never masquerade as "no conflicts"); transport errors
   * become `InpiApiError` carrying the upstream status.
   */
  private toInpiError(err: unknown): unknown {
    if (err instanceof ArAgentsResponseValidationError) return err;
    if (isArAgentsError(err)) {
      const status =
        err instanceof ArAgentsProtocolError
          ? err.status ?? 0
          : err instanceof ArAgentsRateLimitError
            ? 429
            : err instanceof ArAgentsAuthError
              ? 401
              : 0;
      return new InpiApiError(status, err.context["body"] ?? null);
    }
    return err;
  }
}
