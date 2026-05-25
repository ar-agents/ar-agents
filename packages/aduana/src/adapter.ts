/**
 * Adapter contract for ARCA Aduana.
 *
 * The shipping defaults are intentionally minimal:
 *   - UnconfiguredAduanaAdapter throws AduanaUnconfiguredError on every call,
 *     so unit tests never accidentally hit the network.
 *   - InMemoryAduanaAdapter accepts seed data and is useful for tests.
 *   - HttpAduanaAdapter hits ARCA's REST surface published in 2025.
 *     v0.1 ships the contract + a thin reference impl; production wiring
 *     should pass through an authenticated cert (most read endpoints are
 *     public, but write endpoints require WSAA tickets — out of scope here).
 */

import { AduanaApiError, AduanaUnconfiguredError } from "./errors";
import type {
  DespachoIdentifier,
  DespachoLookupResult,
  NcmLookupResult,
} from "./types";

export type FetchLike = typeof fetch;

export interface AduanaAdapter {
  lookupDespacho(id: DespachoIdentifier): Promise<DespachoLookupResult>;
  lookupNcm(code: string): Promise<NcmLookupResult | null>;
}

export class UnconfiguredAduanaAdapter implements AduanaAdapter {
  async lookupDespacho(): Promise<never> {
    throw new AduanaUnconfiguredError("lookupDespacho");
  }
  async lookupNcm(): Promise<never> {
    throw new AduanaUnconfiguredError("lookupNcm");
  }
}

export interface HttpAduanaAdapterOptions {
  /** Override the base URL. Default: ARCA's public Aduana REST root. */
  baseUrl?: string;
  /** Custom fetch (for tests / Edge runtimes). */
  fetch?: FetchLike;
}

const DEFAULT_BASE = "https://api.arca.gob.ar/aduana/v1";

export class HttpAduanaAdapter implements AduanaAdapter {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  constructor(opts: HttpAduanaAdapterOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const f =
      opts.fetch ??
      ((globalThis as { fetch?: FetchLike }).fetch as FetchLike | undefined);
    if (!f) {
      throw new AduanaUnconfiguredError("HttpAduanaAdapter", "no fetch available");
    }
    this.fetcher = f;
  }

  async lookupDespacho(id: DespachoIdentifier): Promise<DespachoLookupResult> {
    const url = `${this.baseUrl}/despachos?kind=${encodeURIComponent(id.kind)}&value=${encodeURIComponent(id.value)}`;
    const res = await this.fetcher(url, { method: "GET", headers: { accept: "application/json" } });
    if (res.status === 404) return { identifier: id, found: false };
    if (!res.ok) throw new AduanaApiError(res.status, await safeJson(res));
    const body = (await res.json()) as Partial<DespachoLookupResult>;
    return { ...body, identifier: id, found: true } as DespachoLookupResult;
  }

  async lookupNcm(code: string): Promise<NcmLookupResult | null> {
    const url = `${this.baseUrl}/ncm/${encodeURIComponent(code)}`;
    const res = await this.fetcher(url, { method: "GET", headers: { accept: "application/json" } });
    if (res.status === 404) return null;
    if (!res.ok) throw new AduanaApiError(res.status, await safeJson(res));
    return (await res.json()) as NcmLookupResult;
  }
}

export interface InMemoryAduanaSeed {
  despachos?: DespachoLookupResult[];
  ncm?: NcmLookupResult[];
}

export class InMemoryAduanaAdapter implements AduanaAdapter {
  constructor(private readonly seed: InMemoryAduanaSeed = {}) {}

  async lookupDespacho(id: DespachoIdentifier): Promise<DespachoLookupResult> {
    const match = (this.seed.despachos ?? []).find(
      (d) => d.identifier.kind === id.kind && d.identifier.value === id.value,
    );
    return match ?? { identifier: id, found: false };
  }
  async lookupNcm(code: string): Promise<NcmLookupResult | null> {
    return (this.seed.ncm ?? []).find((n) => n.code === code) ?? null;
  }
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
