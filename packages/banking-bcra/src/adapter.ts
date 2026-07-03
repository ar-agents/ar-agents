/**
 * BCRA Central de Deudores adapter contract.
 *
 *   UnconfiguredBcraAdapter   throws on every call. Default.
 *   InMemoryBcraAdapter       deterministic seeded; for tests + dogfood.
 *   HttpBcraAdapter           real adapter against the public BCRA API
 *                             (no auth, no token, no per-key rate-limit
 *                             from us — BCRA does enforce ~100 req/min
 *                             at their edge so use middleware to throttle).
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
import {
  BcraApiError,
  BcraNotFoundError,
  BcraUnconfiguredError,
} from "./errors";
import { normalizeCuit } from "./summarize";
import type {
  BouncedChecksResponse,
  DebtResponse,
  HistoricalDebtResponse,
} from "./types";

export interface BcraAdapter {
  /** Current debt status snapshot. */
  getDebt(cuit: string): Promise<DebtResponse>;
  /** Historical monthly snapshots (24 months by default). */
  getHistoricalDebt(cuit: string): Promise<HistoricalDebtResponse>;
  /** Bounced check history. */
  getBouncedChecks(cuit: string): Promise<BouncedChecksResponse>;
}

// ── Unconfigured (default) ──────────────────────────────────────

export class UnconfiguredBcraAdapter implements BcraAdapter {
  async getDebt(): Promise<never> {
    throw new BcraUnconfiguredError("getDebt");
  }
  async getHistoricalDebt(): Promise<never> {
    throw new BcraUnconfiguredError("getHistoricalDebt");
  }
  async getBouncedChecks(): Promise<never> {
    throw new BcraUnconfiguredError("getBouncedChecks");
  }
}

// ── HTTP (real BCRA) ────────────────────────────────────────────

/**
 * @deprecated The adapter now uses the standard `fetch` from
 * `@ar-agents/core`'s HttpClient. Pass a real `fetch` (or omit for the global
 * one). Kept only so existing type imports don't break.
 */
export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface HttpBcraAdapterOptions {
  /** Override base URL (mainly for tests / regional proxies). */
  baseUrl?: string;
  /** Optional `fetch` override (tests / custom transport). Defaults to global. */
  fetch?: typeof fetch;
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** User-Agent identifying the client. BCRA doesn't require one but
   * sending an identifier is polite + helps if they ever need to
   * rate-limit aggressive callers separately. */
  userAgent?: string;
  /** Retry policy override. Default: 3 attempts with jittered backoff — the
   * reads are idempotent GETs, so retrying a transient 5xx/timeout is safe. */
  retry?: HttpRetryOptions;
}

const DEFAULT_BASE_URL = "https://api.bcra.gob.ar";
const DEFAULT_UA = "@ar-agents/banking-bcra (https://ar-agents.ar)";

/**
 * Envelope guard for every BCRA read. Its job is NOT to fully type the debt
 * body (the tolerant field-pickers below handle BCRA's casing quirks) but to
 * REJECT a response that isn't a recognizable BCRA envelope — an error page, a
 * truncated body, or `{}` — so it can't slide through the `?? [] / ?? 0`
 * defaults and fabricate a debt-free / clean result. That fabrication (an
 * unrecognized body parsing as "no debt") was the audit's headline risk on this
 * exact credit-check path.
 */
const bcraEnvelopeSchema = z
  .object({
    results: z.record(z.string(), z.unknown()).nullable().optional(),
    periodos: z.array(z.unknown()).optional(),
    entidades: z.array(z.unknown()).optional(),
    cheques: z.array(z.unknown()).optional(),
  })
  .refine(
    (b) =>
      b.results !== undefined ||
      b.periodos !== undefined ||
      b.entidades !== undefined ||
      b.cheques !== undefined,
    {
      message:
        "BCRA response has neither `results` nor a debt/cheque array — likely an error page or truncated body, not a real Central de Deudores response",
    },
  );

export class HttpBcraAdapter implements BcraAdapter {
  private readonly client: HttpClient;
  private readonly baseUrl: string;

  constructor(opts: HttpBcraAdapterOptions = {}) {
    const baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const fetchImpl =
      opts.fetch ?? ((globalThis as { fetch?: typeof fetch }).fetch as typeof fetch | undefined);
    if (typeof fetchImpl !== "function") {
      throw new BcraUnconfiguredError("fetch", "no fetch function available");
    }
    this.baseUrl = baseUrl;
    this.client = new HttpClient({
      baseUrl,
      fetch: fetchImpl,
      timeoutMs: opts.timeoutMs ?? 10_000,
      userAgent: opts.userAgent ?? DEFAULT_UA,
      retry: opts.retry ?? { maxAttempts: 3 },
    });
  }

  async getDebt(cuit: string): Promise<DebtResponse> {
    const clean = normalizeCuit(cuit);
    const raw = await this.get(`/centraldedeudores/v1.0/Deudas/${clean}`, clean);
    return this.parseDebtResponse(clean, raw);
  }

  async getHistoricalDebt(cuit: string): Promise<HistoricalDebtResponse> {
    const clean = normalizeCuit(cuit);
    const raw = await this.get(
      `/centraldedeudores/v1.0/Deudas/Historicas/${clean}`,
      clean,
    );
    return this.parseHistoricalResponse(clean, raw);
  }

  async getBouncedChecks(cuit: string): Promise<BouncedChecksResponse> {
    const clean = normalizeCuit(cuit);
    const raw = await this.get(
      `/centraldedeudores/v1.0/Deudas/ChequesRechazados/${clean}`,
      clean,
    );
    return this.parseBouncedResponse(clean, raw);
  }

  /**
   * One BCRA GET through the shared HttpClient: real timeout, idempotent-GET
   * retry with backoff, 429/Retry-After, and an envelope schema that fails
   * LOUD on a non-BCRA body. Core's typed errors are translated back to the
   * BCRA taxonomy so the public contract is unchanged; a malformed-body
   * `ArAgentsResponseValidationError` is surfaced as-is (informative — a human
   * needs to see the upstream shape drifted, and it must never be swallowed
   * into a "clean" answer).
   */
  private async get(path: string, cuit: string): Promise<unknown> {
    try {
      return await this.client.request({ path, schema: bcraEnvelopeSchema });
    } catch (err) {
      if (err instanceof ArAgentsProtocolError && err.status === 404) {
        // BCRA's "no records" — the expected clean-taxpayer response.
        throw new BcraNotFoundError(cuit);
      }
      if (err instanceof ArAgentsResponseValidationError) {
        throw err; // fail loud; do NOT flatten into a generic API error
      }
      if (isArAgentsError(err)) {
        const status =
          err instanceof ArAgentsProtocolError
            ? err.status ?? 0
            : err instanceof ArAgentsRateLimitError
              ? 429
              : err instanceof ArAgentsAuthError
                ? 401
                : 0;
        throw new BcraApiError(status, null, {
          url: `${this.baseUrl}${path}`,
          cause: err.message,
        });
      }
      throw err;
    }
  }

  private parseDebtResponse(cuit: string, raw: unknown): DebtResponse {
    const root = unwrapResults(raw);
    // The real /Deudas/{cuit} response nests debts under
    // `results.periodos[].entidades` (same shape as Historicas), NOT
    // at the root. Read the most-recent periodo. Fall back to a
    // root-level `entidades`/`periodo` only if periodos is absent.
    const periodosRaw = pickArray(root, ["periodos", "Periodos"]);
    if (periodosRaw && periodosRaw.length > 0) {
      const latest = periodosRaw
        .map((p) => {
          const obj = p as Record<string, unknown>;
          return {
            periodo: pickString(obj, ["periodo", "Periodo"]) ?? "",
            entidades: pickArray(obj, ["entidades", "Entidades"]) ?? [],
          };
        })
        .reduce((a, b) => (b.periodo > a.periodo ? b : a));
      return {
        cuit,
        periodo: latest.periodo || currentYearMonth(),
        entidades: latest.entidades.map(parseDebtEntry),
      };
    }
    const periodo =
      pickString(root, ["periodo", "Periodo"]) ?? currentYearMonth();
    const entidadesRaw = pickArray(root, ["entidades", "Entidades"]) ?? [];
    return {
      cuit,
      periodo,
      entidades: entidadesRaw.map(parseDebtEntry),
    };
  }

  private parseHistoricalResponse(
    cuit: string,
    raw: unknown,
  ): HistoricalDebtResponse {
    const root = unwrapResults(raw);
    const periodosRaw = pickArray(root, ["periodos", "Periodos"]) ?? [];
    return {
      cuit,
      periodos: periodosRaw.map((p) => {
        const obj = p as Record<string, unknown>;
        return {
          periodo: pickString(obj, ["periodo", "Periodo"]) ?? "",
          entidades: (pickArray(obj, ["entidades", "Entidades"]) ?? []).map(
            parseDebtEntry,
          ),
        };
      }),
    };
  }

  private parseBouncedResponse(cuit: string, raw: unknown): BouncedChecksResponse {
    const root = unwrapResults(raw);
    const arr = pickArray(root, ["cheques", "ChequesRechazados", "Cheques"]) ?? [];
    return {
      cuit,
      cheques: arr.map((c) => {
        const obj = c as Record<string, unknown>;
        const fechaPago = pickString(obj, ["fechaPago", "FechaPago"]);
        return {
          entidad: pickNumber(obj, ["entidad", "Entidad"]) ?? 0,
          nombre: pickString(obj, ["nombreEntidad", "Nombre", "nombre"]) ?? "",
          fechaRechazo:
            pickString(obj, ["fechaRechazo", "FechaRechazo"]) ?? "",
          monto: pickNumber(obj, ["monto", "Monto"]) ?? 0,
          numeroCheque:
            pickString(obj, ["numeroCheque", "NumeroCheque"]) ?? "",
          causa: pickString(obj, ["causa", "Causa", "motivo"]) ?? "",
          ...(fechaPago ? { fechaPago } : {}),
        };
      }),
    };
  }

}

// ── In-memory (testing / dogfood) ───────────────────────────────

export interface InMemoryBcraSeed {
  debts?: DebtResponse[];
  historical?: HistoricalDebtResponse[];
  bouncedChecks?: BouncedChecksResponse[];
}

/**
 * Deterministic adapter. Looks up the cuit in each seeded list;
 * misses throw BcraNotFoundError (the BCRA-realistic behavior for
 * "no records").
 */
export class InMemoryBcraAdapter implements BcraAdapter {
  private readonly debts: Map<string, DebtResponse>;
  private readonly historical: Map<string, HistoricalDebtResponse>;
  private readonly cheques: Map<string, BouncedChecksResponse>;

  constructor(seed: InMemoryBcraSeed = {}) {
    this.debts = new Map((seed.debts ?? []).map((d) => [normalizeCuit(d.cuit), d]));
    this.historical = new Map(
      (seed.historical ?? []).map((h) => [normalizeCuit(h.cuit), h]),
    );
    this.cheques = new Map(
      (seed.bouncedChecks ?? []).map((c) => [normalizeCuit(c.cuit), c]),
    );
  }

  async getDebt(cuit: string): Promise<DebtResponse> {
    const clean = normalizeCuit(cuit);
    const r = this.debts.get(clean);
    if (!r) throw new BcraNotFoundError(clean);
    return r;
  }

  async getHistoricalDebt(cuit: string): Promise<HistoricalDebtResponse> {
    const clean = normalizeCuit(cuit);
    const r = this.historical.get(clean);
    if (!r) throw new BcraNotFoundError(clean);
    return r;
  }

  async getBouncedChecks(cuit: string): Promise<BouncedChecksResponse> {
    const clean = normalizeCuit(cuit);
    const r = this.cheques.get(clean);
    if (!r) throw new BcraNotFoundError(clean);
    return r;
  }
}

// ── Parser helpers ──────────────────────────────────────────────

function unwrapResults(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "object" || raw === null) return {};
  const obj = raw as Record<string, unknown>;
  // BCRA often wraps results in `{ status: 200, results: { ... } }`.
  if (
    obj["results"] !== undefined &&
    typeof obj["results"] === "object" &&
    obj["results"] !== null
  ) {
    return obj["results"] as Record<string, unknown>;
  }
  return obj;
}

function pickString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string") return v;
  }
  return undefined;
}

function pickNumber(
  obj: Record<string, unknown>,
  keys: string[],
): number | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
      return Number(v);
    }
  }
  return undefined;
}

function pickArray(
  obj: Record<string, unknown>,
  keys: string[],
): unknown[] | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
  }
  return undefined;
}

function parseDebtEntry(raw: unknown): import("./types").DebtEntry {
  const obj = (raw as Record<string, unknown>) ?? {};
  const sit = pickNumber(obj, ["situacion", "Situacion"]) ?? 1;
  const diasAtraso = pickNumber(obj, ["diasAtrasoPago", "DiasAtrasoPago"]);
  // BCRA returns the reporting bank's NAME in `entidad` (this endpoint
  // has no numeric code). Mirror it into `nombre` for callers that
  // read either field.
  const entidad = pickString(obj, ["entidad", "Entidad"]) ?? "";
  return {
    entidad,
    nombre: pickString(obj, ["nombre", "Nombre"]) ?? entidad,
    periodo: pickString(obj, ["periodo", "Periodo"]) ?? "",
    situacion: clampSituacion(sit),
    montoEnMiles: pickNumber(obj, ["monto", "Monto", "montoEnMiles"]) ?? 0,
    procesoJud: pickBoolish(obj, ["procesoJud", "ProcesoJud"]),
    refinanciaciones: pickBoolish(obj, ["refinanciaciones", "Refinanciaciones"]),
    situacionFraude: pickBoolish(obj, ["situacionFraude", "SituacionFraude"]),
    enRevision: pickBoolish(obj, ["enRevision", "EnRevision"]),
    ...(diasAtraso !== undefined ? { diasAtrasoPago: diasAtraso } : {}),
  };
}

function clampSituacion(n: number): import("./types").SituacionCrediticia {
  const r = Math.max(1, Math.min(6, Math.round(n)));
  return r as import("./types").SituacionCrediticia;
}

function pickBoolish(obj: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") {
      const s = v.toLowerCase().trim();
      if (s === "true" || s === "1" || s === "si" || s === "sí") return true;
      if (s === "false" || s === "0" || s === "no") return false;
    }
  }
  return false;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
