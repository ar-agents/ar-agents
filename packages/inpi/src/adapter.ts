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
}

const DEFAULT_BASE = "https://servicios.inpi.gob.ar/marcas/v1";

export class HttpInpiAdapter implements InpiAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(opts: HttpInpiAdapterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const f =
      opts.fetch ??
      ((globalThis as { fetch?: FetchLike }).fetch as FetchLike | undefined);
    if (!f) throw new InpiUnconfiguredError("HttpInpiAdapter", "no fetch available");
    this.fetcher = f;
  }

  async search(input: SearchInput): Promise<SearchResult> {
    const params = new URLSearchParams({ q: input.q });
    if (input.niceClass !== undefined) params.set("class", String(input.niceClass));
    if (input.status) params.set("status", input.status);
    if (input.limit) params.set("limit", String(input.limit));
    const res = await this.fetcher(`${this.baseUrl}/search?${params}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new InpiApiError(res.status, await safeJson(res));
    return (await res.json()) as SearchResult;
  }

  async getByActa(acta: string): Promise<TrademarkRecord | null> {
    const res = await this.fetcher(
      `${this.baseUrl}/marcas/${encodeURIComponent(acta)}`,
      { headers: { accept: "application/json" } },
    );
    if (res.status === 404) return null;
    if (!res.ok) throw new InpiApiError(res.status, await safeJson(res));
    return (await res.json()) as TrademarkRecord;
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
