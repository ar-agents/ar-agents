/**
 * BCRA "Principales Variables" — the open REST API every Argentine fintech
 * needs. Tipo de cambio, CER, UVA, reservas internacionales, BADLAR, tasa
 * de política monetaria, inflación.
 *
 * # Endpoint
 *
 * Base: `https://api.bcra.gob.ar/estadisticas/v3.0`
 *
 * - `GET /Monetarias` — list of all available variables (id + descripción).
 * - `GET /Monetarias/{idVariable}` — time series for a single variable.
 *
 * No authentication. CORS-enabled. Rate-limited per IP (~60 req/min).
 *
 * # Why an adapter?
 *
 * Same pattern as `@ar-agents/banking`'s BCRA Central de Deudores: ship
 * `UnconfiguredBcraVarsAdapter` (always-fail, always safe) and a default
 * `BcraVarsPublicApiAdapter` that hits the public REST. Custom adapters
 * for caching, mirrors, or in-house copies.
 */

import { BcraVarsNotConfiguredError } from "./errors";

/**
 * A single BCRA monetary variable definition. Returned by
 * `listVariables()`.
 */
export interface BcraVariable {
  /** Internal BCRA id used to query the time series. */
  idVariable: number;
  /** Long descripción as published by BCRA. */
  descripcion: string;
  /** Most recent value in the series. */
  valor: number | null;
  /** ISO date of the most recent value (`YYYY-MM-DD`). */
  fecha: string | null;
  /** Update cadence: "Diaria" | "Mensual" | "Trimestral" | etc. */
  cadencia?: string;
}

/** A single time-series datapoint for a BCRA variable. */
export interface BcraVariableDatapoint {
  fecha: string; // YYYY-MM-DD
  valor: number;
}

export interface BcraVarsResult {
  /** True when the call succeeded; false when the adapter is unconfigured or BCRA didn't respond. */
  available: boolean;
  /** Spanish-language explanation when `available: false`. */
  error: string | null;
  /** Result data when `available: true`. Type depends on the call. */
  data: unknown;
}

/**
 * Adapter contract for BCRA Principales Variables. Implement this to wire
 * the BCRA public API, a private mirror, a caching layer, or a mock for
 * tests.
 */
export interface BcraVarsAdapter {
  /** List all monetary variables BCRA publishes. */
  listVariables(): Promise<BcraVariable[]>;
  /**
   * Fetch the time series for one variable. Range filtering via `from`/`to`
   * (ISO `YYYY-MM-DD`); both optional. BCRA caps responses at ~3000 points.
   */
  getVariable(
    idVariable: number,
    range?: { from?: string; to?: string },
  ): Promise<BcraVariableDatapoint[]>;
}

/**
 * Default adapter that always returns "not configured". Use when you want
 * the BCRA-vars tools to be safe to call without making real BCRA
 * requests.
 */
export class UnconfiguredBcraVarsAdapter implements BcraVarsAdapter {
  async listVariables(): Promise<BcraVariable[]> {
    throw new BcraVarsNotConfiguredError();
  }
  async getVariable(): Promise<BcraVariableDatapoint[]> {
    throw new BcraVarsNotConfiguredError();
  }
}

/**
 * Default adapter that hits BCRA's public REST API. No auth required.
 *
 * Tolerates BCRA's certificate quirks (some BCRA endpoints have served
 * intermittent TLS issues over the years) — pass a custom `fetch` to wrap
 * with retry/proxy when needed.
 */
export interface BcraVarsPublicApiAdapterOptions {
  /** Override the BCRA base URL. Default `https://api.bcra.gob.ar/estadisticas/v3.0`. */
  baseUrl?: string;
  /** Custom fetch (proxy, retries, etc.). */
  fetch?: typeof fetch;
  /** Request timeout in ms. Default 15s. */
  timeoutMs?: number;
}

export class BcraVarsPublicApiAdapter implements BcraVarsAdapter {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: BcraVarsPublicApiAdapterOptions = {}) {
    this.baseUrl = opts.baseUrl ?? "https://api.bcra.gob.ar/estadisticas/v3.0";
    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = opts.timeoutMs ?? 15_000;
  }

  async listVariables(): Promise<BcraVariable[]> {
    const json = await this.getJson(`${this.baseUrl}/Monetarias`);
    const results = Array.isArray(json) ? json : (json["results"] as unknown);
    if (!Array.isArray(results)) return [];
    return results.map((r: Record<string, unknown>) => ({
      idVariable: Number(r["idVariable"] ?? 0),
      descripcion: String(r["descripcion"] ?? ""),
      valor: r["valor"] === null || r["valor"] === undefined ? null : Number(r["valor"]),
      fecha: r["fecha"] ? String(r["fecha"]) : null,
      ...(r["cadencia"] !== undefined ? { cadencia: String(r["cadencia"]) } : {}),
    }));
  }

  async getVariable(
    idVariable: number,
    range: { from?: string; to?: string } = {},
  ): Promise<BcraVariableDatapoint[]> {
    const params = new URLSearchParams();
    if (range.from) params.set("desde", range.from);
    if (range.to) params.set("hasta", range.to);
    const qs = params.size ? `?${params.toString()}` : "";
    const url = `${this.baseUrl}/Monetarias/${idVariable}${qs}`;
    const json = await this.getJson(url);
    const results = Array.isArray(json) ? json : (json["results"] as unknown);
    if (!Array.isArray(results)) return [];
    return results.map((r: Record<string, unknown>) => ({
      fecha: String(r["fecha"] ?? ""),
      valor: Number(r["valor"] ?? 0),
    }));
  }

  private async getJson(url: string): Promise<Record<string, unknown> | unknown[]> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
      });
      if (!res.ok) {
        throw new Error(`BCRA API ${res.status} ${res.statusText} at ${url}`);
      }
      return (await res.json()) as Record<string, unknown> | unknown[];
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * Well-known BCRA variable ids. The ids are stable but new ones get added
 * occasionally — use `listVariables()` to discover.
 *
 * Verified against the BCRA API as of 2026-05.
 */
export const BCRA_VARIABLE_IDS = {
  RESERVAS_INTERNACIONALES: 1,
  TIPO_CAMBIO_MINORISTA_USD: 4,
  TIPO_CAMBIO_MAYORISTA_USD: 5,
  TASA_POLITICA_MONETARIA: 6,
  BADLAR_BANCOS_PRIVADOS: 7,
  TIPO_CAMBIO_REAL_MULTILATERAL: 8,
  CER_DIA: 30,
  UVA_DIA: 31,
  INFLACION_MENSUAL: 27,
  INFLACION_INTERANUAL: 28,
} as const;

export type BcraVariableId = (typeof BCRA_VARIABLE_IDS)[keyof typeof BCRA_VARIABLE_IDS];
