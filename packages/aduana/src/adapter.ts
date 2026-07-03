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
  /** Per-request timeout in ms. Default 10_000. The reads had none before — a
   * slow ARCA endpoint would hang the agent forever. */
  timeoutMs?: number;
  /** Retry policy override. Default: 3 attempts with jittered backoff (the
   * lookups are idempotent GETs, so retrying a transient 5xx/timeout is safe). */
  retry?: HttpRetryOptions;
  /** User-Agent identifying the client. */
  userAgent?: string;
}

const DEFAULT_BASE = "https://api.arca.gob.ar/aduana/v1";
const DEFAULT_UA = "@ar-agents/aduana (https://ar-agents.ar)";

const despachoStatusSchema = z.enum([
  "registrado",
  "oficializado",
  "canalizado_verde",
  "canalizado_naranja",
  "canalizado_rojo",
  "libre_disponibilidad",
  "anulado",
]);

const operationKindSchema = z.enum(["IM4", "IT4", "EC4", "ET4", "OTRO"]);

// The anti-fabrication guard for lookupDespacho: the OLD code stamped
// `found: true` onto ANY 200 body — an error page or an empty `{}` served with
// HTTP 200 became a "found" customs declaration. Requiring a valid `status`
// (the core marker of a genuine despacho record) means a non-despacho body now
// FAILS LOUD instead of masquerading as a real, found declaration.
const despachoBodySchema = z.object({
  status: despachoStatusSchema,
  operationKind: operationKindSchema.optional(),
  ncmCode: z.string().optional(),
  registeredAt: z.string().optional(),
  oficinaAduana: z.string().optional(),
  cuit: z.string().optional(),
  note: z.string().optional(),
});

const ncmBodySchema = z.object({
  code: z.string(),
  description: z.string(),
  active: z.boolean(),
  aecPercent: z.number().optional(),
  diePercent: z.number().optional(),
});

export class HttpAduanaAdapter implements AduanaAdapter {
  private readonly client: HttpClient;

  constructor(opts: HttpAduanaAdapterOptions = {}) {
    const baseUrl = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    const fetchImpl =
      opts.fetch ?? ((globalThis as { fetch?: FetchLike }).fetch as FetchLike | undefined);
    if (typeof fetchImpl !== "function") {
      throw new AduanaUnconfiguredError("HttpAduanaAdapter", "no fetch available");
    }
    this.client = new HttpClient({
      baseUrl,
      fetch: fetchImpl,
      timeoutMs: opts.timeoutMs ?? 10_000,
      userAgent: opts.userAgent ?? DEFAULT_UA,
      retry: opts.retry ?? { maxAttempts: 3 },
    });
  }

  async lookupDespacho(id: DespachoIdentifier): Promise<DespachoLookupResult> {
    let body;
    try {
      body = await this.client.request({
        path: "/despachos",
        query: { kind: id.kind, value: id.value },
        schema: despachoBodySchema,
      });
    } catch (err) {
      // 404 is a legitimate "no such despacho", not an error.
      if (err instanceof ArAgentsProtocolError && err.status === 404) {
        return { identifier: id, found: false };
      }
      throw this.toAduanaError(err);
    }
    // Only reached when the body validated as a real despacho record.
    return { ...body, identifier: id, found: true } as DespachoLookupResult;
  }

  async lookupNcm(code: string): Promise<NcmLookupResult | null> {
    try {
      const body = await this.client.request({
        path: `/ncm/${encodeURIComponent(code)}`,
        schema: ncmBodySchema,
      });
      return body as NcmLookupResult;
    } catch (err) {
      if (err instanceof ArAgentsProtocolError && err.status === 404) return null;
      throw this.toAduanaError(err);
    }
  }

  /**
   * Translate a core error into the Aduana taxonomy. A malformed-body
   * `ArAgentsResponseValidationError` is surfaced as-is (fail loud — a
   * non-despacho body must never be stamped `found: true`); transport errors
   * become `AduanaApiError` carrying the upstream status.
   */
  private toAduanaError(err: unknown): unknown {
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
      return new AduanaApiError(status, err.context["body"] ?? null);
    }
    return err;
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
