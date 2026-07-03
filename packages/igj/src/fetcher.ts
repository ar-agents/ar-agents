/**
 * IGJ data fetcher contract + implementations.
 *
 * The IGJ open data lives at `datos.jus.gob.ar`, served by CKAN. This
 * module wraps:
 *   - `package_search` (full-text package metadata)
 *   - `datastore_search` (row-level filtering + pagination + free-text)
 *   - `package_show` (single dataset metadata)
 *
 * IMPORTANT: The IGJ datasets are SAMPLE datasets (`muestreo`). The
 * `coverageNote` on every result reflects this — surface it verbatim.
 */

import {
  ArAgentsProtocolError,
  ArAgentsResponseValidationError,
  HttpClient,
  isArAgentsError,
  type HttpRetryOptions,
} from "@ar-agents/core";
import { z } from "zod";
import { FetcherNotConfiguredError, IgjError } from "./errors";
import {
  normalizeCuit,
  parseAsamblea,
  parseAutoridad,
  parseBalance,
  parseDomicilio,
  parseEntity,
} from "./normalize";
import type {
  IgjAsamblea,
  IgjAutoridad,
  IgjBalance,
  IgjDomicilio,
  IgjEntity,
  IgjSearchQuery,
  IgjSearchResult,
} from "./types";

/**
 * Hard-coded resource ids for the IGJ datasets on datos.jus.gob.ar
 * (verified 2026-05). Override via `LiveCkanFetcherOptions.resourceIds`
 * if these get rotated.
 */
export const IGJ_RESOURCE_IDS = {
  entidades: "6652404c-7de4-45b5-8344-80f4bcc200f7",
  domicilios: "c8da9549-ad13-4143-a192-56c2810bf39c",
  balances: "7849ffd0-4a00-4223-acf7-0cce652fb949",
  autoridades: "dc840e68-86fc-405f-87b6-904d292891ff",
  asambleas: "3be34cd6-7515-4b13-80b3-c83c7fc6579b",
} as const;

const COVERAGE_NOTE_LIVE =
  "Los datos provienen del CKAN abierto del Ministerio de Justicia (datos.jus.gob.ar) y corresponden a un MUESTREO de las entidades inscriptas en IGJ. NO son datos en tiempo real ni cobertura completa: para verificación oficial usá el portal de IGJ (no expone API). Última actualización del dataset: ver `dataset.modified` en CKAN.";
const COVERAGE_NOTE_MOCK = "MOCK FETCHER — datos sintéticos para tests/demo, no reflejan IGJ real.";
const COVERAGE_NOTE_UNCONFIGURED =
  "FETCHER NO CONFIGURADO — instanciá `LiveCkanFetcher()` para queries reales contra datos.jus.gob.ar.";

export interface IgjFetcher {
  search(query: IgjSearchQuery): Promise<IgjSearchResult>;
  getEntity(id: string): Promise<IgjEntity | null>;
  getDomicilios(entityId: string): Promise<IgjDomicilio[]>;
  getAutoridades(entityId: string): Promise<IgjAutoridad[]>;
  getBalances(entityId: string): Promise<IgjBalance[]>;
  getAsambleas(entityId: string): Promise<IgjAsamblea[]>;
}

/** Default no-op fetcher; tools stay safe to call. */
export class UnconfiguredIgjFetcher implements IgjFetcher {
  async search(_q: IgjSearchQuery): Promise<IgjSearchResult> {
    return {
      results: [],
      total: 0,
      nextCursor: null,
      source: "unconfigured",
      coverageNote: COVERAGE_NOTE_UNCONFIGURED,
    };
  }
  async getEntity(_id: string): Promise<IgjEntity | null> {
    throw new FetcherNotConfiguredError();
  }
  async getDomicilios(_id: string): Promise<IgjDomicilio[]> {
    return [];
  }
  async getAutoridades(_id: string): Promise<IgjAutoridad[]> {
    return [];
  }
  async getBalances(_id: string): Promise<IgjBalance[]> {
    return [];
  }
  async getAsambleas(_id: string): Promise<IgjAsamblea[]> {
    return [];
  }
}

/** In-memory fetcher for tests + demos. */
export class MockIgjFetcher implements IgjFetcher {
  constructor(
    private readonly data: {
      entidades: IgjEntity[];
      domicilios?: IgjDomicilio[];
      autoridades?: IgjAutoridad[];
      balances?: IgjBalance[];
      asambleas?: IgjAsamblea[];
    },
  ) {}
  async search(query: IgjSearchQuery): Promise<IgjSearchResult> {
    const filtered = this.data.entidades.filter((e) => matchEntity(e, query));
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const offset = query.cursor ? Number(query.cursor) : 0;
    const page = filtered.slice(offset, offset + pageSize);
    const next = offset + pageSize < filtered.length ? String(offset + pageSize) : null;
    return {
      results: page,
      total: filtered.length,
      nextCursor: next,
      source: "mock",
      coverageNote: COVERAGE_NOTE_MOCK,
    };
  }
  async getEntity(id: string): Promise<IgjEntity | null> {
    return this.data.entidades.find((e) => e.id === id) ?? null;
  }
  async getDomicilios(entityId: string): Promise<IgjDomicilio[]> {
    return (this.data.domicilios ?? []).filter((d) => d.entityId === entityId);
  }
  async getAutoridades(entityId: string): Promise<IgjAutoridad[]> {
    return (this.data.autoridades ?? []).filter((a) => a.entityId === entityId);
  }
  async getBalances(entityId: string): Promise<IgjBalance[]> {
    return (this.data.balances ?? []).filter((b) => b.entityId === entityId);
  }
  async getAsambleas(entityId: string): Promise<IgjAsamblea[]> {
    return (this.data.asambleas ?? []).filter((a) => a.entityId === entityId);
  }
}

export interface LiveCkanFetcherOptions {
  /** Override the CKAN base. Default: https://datos.jus.gob.ar */
  baseUrl?: string;
  /** Override the resource ids (e.g., when the dataset is republished). */
  resourceIds?: Partial<typeof IGJ_RESOURCE_IDS>;
  /** Custom fetch (proxy, retries). */
  fetch?: typeof fetch;
  /** Timeout in ms. Default 30s. */
  timeoutMs?: number;
  /** Retry policy override. Default: 2 attempts — CKAN's datastore_search is an
   * idempotent GET, so a transient 5xx/timeout is safe to retry once. */
  retry?: HttpRetryOptions;
}

// CKAN action envelope. Validated at the boundary so a `success:true` body whose
// `result.records` isn't an array fails loud (via the typed client) rather than
// being blind-cast and coerced to an empty result set. `success:false` is
// handled explicitly below to preserve CKAN's own error message.
const ckanEnvelopeSchema = z.object({
  success: z.boolean(),
  result: z
    .object({
      records: z.array(z.record(z.string(), z.unknown())).optional(),
      total: z.number().optional(),
    })
    .optional(),
  error: z.unknown().optional(),
});

type CkanEnvelope = z.infer<typeof ckanEnvelopeSchema>;

const CKAN_DATASTORE_PATH = "/api/3/action/datastore_search";

export class LiveCkanFetcher implements IgjFetcher {
  private readonly resourceIds: typeof IGJ_RESOURCE_IDS;
  private readonly client: HttpClient;

  constructor(opts: LiveCkanFetcherOptions = {}) {
    this.resourceIds = { ...IGJ_RESOURCE_IDS, ...(opts.resourceIds ?? {}) };
    this.client = new HttpClient({
      baseUrl: opts.baseUrl ?? "https://datos.jus.gob.ar",
      timeoutMs: opts.timeoutMs ?? 30_000,
      retry: opts.retry ?? { maxAttempts: 2 },
      ...(opts.fetch !== undefined ? { fetch: opts.fetch } : {}),
    });
  }

  async search(query: IgjSearchQuery): Promise<IgjSearchResult> {
    const offset = query.cursor ? Number(query.cursor) : 0;
    const limit = Math.min(query.pageSize ?? 20, 100);
    const filters: Record<string, string> = {};
    const cuit = normalizeCuit(query.cuit);
    if (cuit) filters["cuit"] = cuit;
    const params: Record<string, string> = {
      resource_id: this.resourceIds.entidades,
      offset: String(offset),
      limit: String(limit),
    };
    if (query.query) params["q"] = query.query;
    if (Object.keys(filters).length > 0) params["filters"] = JSON.stringify(filters);
    const json = await this.getJson(params);
    const records = extractRecords(json);
    let entities = records.map(parseEntity);
    if (query.tipos && query.tipos.length > 0) {
      const allowed = new Set(query.tipos);
      entities = entities.filter((e) => allowed.has(e.tipoEntidad));
    }
    if (query.from) {
      entities = entities.filter((e) => !e.fechaInscripcion || e.fechaInscripcion >= query.from!);
    }
    if (query.to) {
      entities = entities.filter((e) => !e.fechaInscripcion || e.fechaInscripcion <= query.to!);
    }
    const total = extractTotal(json);
    const nextCursor =
      records.length === limit && (total === undefined || offset + limit < total)
        ? String(offset + limit)
        : null;
    return {
      results: entities,
      ...(total !== undefined ? { total } : {}),
      nextCursor,
      source: "live",
      coverageNote: COVERAGE_NOTE_LIVE,
    };
  }

  async getEntity(id: string): Promise<IgjEntity | null> {
    const records = await this.queryDatastore(this.resourceIds.entidades, { _id: id });
    if (records.length === 0) return null;
    return parseEntity(records[0]!);
  }

  async getDomicilios(entityId: string): Promise<IgjDomicilio[]> {
    const records = await this.queryDatastore(this.resourceIds.domicilios, { correlativo: entityId });
    return records.map(parseDomicilio);
  }
  async getAutoridades(entityId: string): Promise<IgjAutoridad[]> {
    const records = await this.queryDatastore(this.resourceIds.autoridades, { correlativo: entityId });
    return records.map(parseAutoridad);
  }
  async getBalances(entityId: string): Promise<IgjBalance[]> {
    const records = await this.queryDatastore(this.resourceIds.balances, { correlativo: entityId });
    return records.map(parseBalance);
  }
  async getAsambleas(entityId: string): Promise<IgjAsamblea[]> {
    const records = await this.queryDatastore(this.resourceIds.asambleas, { correlativo: entityId });
    return records.map(parseAsamblea);
  }

  private async queryDatastore(
    resourceId: string,
    filters: Record<string, string>,
    extras: Record<string, string> = {},
  ): Promise<Array<Record<string, unknown>>> {
    const params: Record<string, string> = {
      resource_id: resourceId,
      filters: JSON.stringify(filters),
      limit: "100",
      ...extras,
    };
    const json = await this.getJson(params);
    return extractRecords(json);
  }

  /** One CKAN datastore_search GET through the shared client: timeout, retry,
   * typed errors, and an envelope schema. CKAN's own `success:false` is mapped
   * to the existing IgjError so callers see the CKAN error message. */
  private async getJson(query: Record<string, string>): Promise<CkanEnvelope> {
    let json: CkanEnvelope;
    try {
      json = await this.client.request({
        path: CKAN_DATASTORE_PATH,
        query,
        schema: ckanEnvelopeSchema,
      });
    } catch (err) {
      if (err instanceof ArAgentsResponseValidationError) {
        throw new IgjError("ckan_invalid_response", `CKAN response shape invalid: ${err.message}`);
      }
      if (err instanceof ArAgentsProtocolError) {
        throw new IgjError(
          "ckan_unreachable",
          `CKAN ${err.status ?? "request"} failed: ${err.message}`,
        );
      }
      if (isArAgentsError(err)) {
        throw new IgjError("ckan_unreachable", `CKAN request failed: ${err.message}`);
      }
      throw err;
    }
    if (json.success === false) {
      throw new IgjError(
        "ckan_invalid_response",
        `CKAN action failed: ${JSON.stringify(json.error ?? json)}`,
      );
    }
    return json;
  }
}

function matchEntity(e: IgjEntity, q: IgjSearchQuery): boolean {
  if (q.cuit) {
    const target = normalizeCuit(q.cuit);
    if (!target || e.cuit !== target) return false;
  }
  if (q.tipos && q.tipos.length > 0 && !q.tipos.includes(e.tipoEntidad)) return false;
  if (q.from && e.fechaInscripcion && e.fechaInscripcion < q.from) return false;
  if (q.to && e.fechaInscripcion && e.fechaInscripcion > q.to) return false;
  if (q.query) {
    const haystack = `${e.nombre}\n${e.cuit ?? ""}`.toLowerCase();
    if (!haystack.includes(q.query.toLowerCase())) return false;
  }
  return true;
}

function extractRecords(json: CkanEnvelope): Array<Record<string, unknown>> {
  return json.result?.records ?? [];
}

function extractTotal(json: CkanEnvelope): number | undefined {
  return json.result?.total;
}
