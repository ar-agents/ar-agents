/**
 * Adapter contract for BCRA Central de Deudores lookups.
 *
 * # Background (for agents picking this lib)
 *
 * BCRA's "Central de Deudores del Sistema Financiero" is a public registry
 * of credit obligations across all AR banks and PSPs. Every CUIT with active
 * or recently active credit (loans, credit cards, mortgages) appears with
 * a "situación" code from 1 (normal) to 6 (irrecuperable):
 *
 * - **1 — Normal**: payments on time
 * - **2 — Riesgo bajo**: <90 days past due, observable warning
 * - **3 — Riesgo medio**: 90-180 days past due, real concern
 * - **4 — Riesgo alto**: 180-365 days past due, severe risk
 * - **5 — Irrecuperable**: 365+ days past due, written off
 * - **6 — Irrecuperable disposición técnica**: very rare, BCRA admin write-off
 *
 * The data is updated monthly. There's also `chequesRechazados` (bounced
 * cheques) for additional risk signal.
 *
 * # Why an adapter?
 *
 * BCRA exposes the data through a public REST endpoint
 * (https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{cuit}). The
 * package ships an `UnconfiguredBcraAdapter` (always-fail, always safe to
 * call) and a default `BcraPublicApiAdapter` that hits the public API. You
 * can swap in your own adapter to add caching, fallback, custom retry
 * policies, or to use a private mirror of the data.
 *
 * # When this matters
 *
 * Most agentic billing flows for AR SaaS *don't* need BCRA lookups —
 * Mercado Pago handles credit risk on the SaaS's behalf via its own scoring.
 * This adapter is for B2B agents that need to assess counterparty risk
 * before extending credit, factoring invoices, or onboarding suppliers.
 */

import { BcraNotConfiguredError } from "./errors";
import type { BcraDeudaResult } from "./types";

/**
 * Adapter contract. Implement this to wire any BCRA-equivalent backend
 * (BCRA public API, NOSIS, Equifax, your in-house cache, mocks for tests).
 */
export interface BcraDeudaAdapter {
  /**
   * Look up the consolidated debt situation for a CUIT.
   *
   * @param cuit Bare 11-digit CUIT (caller normalizes — adapter doesn't).
   * @returns Always returns a `BcraDeudaResult`; on error, `available: false`
   *          with an explanatory message in `error`. Does NOT throw for
   *          known failure modes (CUIT not found, service down) — only
   *          throws for unexpected errors the caller should handle.
   */
  lookup(cuit: string): Promise<BcraDeudaResult>;
}

/**
 * Default adapter that always returns "not configured". Use this when you
 * want the `lookup_credit_situation` tool to be safe to call (no crash) but
 * not actually wired to BCRA — typical for read-only demos or tests.
 *
 * The error message is actionable: it tells the agent / end user how to
 * enable real lookups.
 */
export class UnconfiguredBcraAdapter implements BcraDeudaAdapter {
  async lookup(cuit: string): Promise<BcraDeudaResult> {
    return {
      cuit,
      available: false,
      error: new BcraNotConfiguredError().message,
      data: null,
    };
  }
}

/**
 * Default adapter that hits BCRA's public REST API. No authentication
 * required; respect their rate limits.
 *
 * # Endpoint
 * GET https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/{cuit}
 *
 * # Response shape (simplified)
 * ```
 * {
 *   "results": {
 *     "identificacion": 20417581015,
 *     "denominacion": "CLEMENTE NAZARENO",
 *     "periodos": [{
 *       "periodo": "202604",
 *       "entidades": [{
 *         "entidad": "BANCO MACRO S.A.",
 *         "situacion": 1,
 *         "monto": 35.5,
 *         ...
 *       }]
 *     }]
 *   }
 * }
 * ```
 *
 * Returns `available: false` cleanly when:
 * - CUIT not in BCRA registry (HTTP 404)
 * - Service unavailable (5xx)
 * - Network error
 */
export class BcraPublicApiAdapter implements BcraDeudaAdapter {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly requestTimeoutMs: number;
  private readonly maxRetries: number;
  private readonly onCall:
    | ((event: {
        label: string;
        durationMs: number;
        httpStatus: number | null;
        retried: number;
        success: boolean;
      }) => void)
    | undefined;

  constructor(options: BcraPublicApiAdapterOptions = {}) {
    this.endpoint =
      options.endpoint ??
      "https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas";
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.requestTimeoutMs = options.requestTimeoutMs ?? 30_000;
    this.maxRetries = options.maxRetries ?? 1;
    this.onCall = options.onCall;
  }

  async lookup(cuit: string): Promise<BcraDeudaResult> {
    const url = `${this.endpoint}/${cuit}`;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      const start = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(
        () => controller.abort(),
        this.requestTimeoutMs,
      );
      try {
        const res = await this.fetchImpl(url, {
          method: "GET",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        clearTimeout(timer);
        const httpStatus = res.status;

        if (res.status === 404) {
          this.onCall?.({
            label: "bcra.deudas.lookup",
            durationMs: Date.now() - start,
            httpStatus,
            retried: attempt,
            success: true, // 404 is a clean "not found" response, not an error
          });
          return {
            cuit,
            available: false,
            error: `BCRA no tiene registro del CUIT ${cuit} en la Central de Deudores. Puede ser un CUIT sin antecedentes crediticios o sin movimiento reciente.`,
            data: null,
          };
        }

        if (res.status >= 500 && attempt < this.maxRetries) {
          // Retryable
          this.onCall?.({
            label: "bcra.deudas.lookup",
            durationMs: Date.now() - start,
            httpStatus,
            retried: attempt,
            success: false,
          });
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }

        if (!res.ok) {
          this.onCall?.({
            label: "bcra.deudas.lookup",
            durationMs: Date.now() - start,
            httpStatus,
            retried: attempt,
            success: false,
          });
          return {
            cuit,
            available: false,
            error: `BCRA respondió HTTP ${res.status}. ${await safeText(res)}`,
            data: null,
          };
        }

        const json = (await res.json()) as { results?: BcraApiResults };
        this.onCall?.({
          label: "bcra.deudas.lookup",
          durationMs: Date.now() - start,
          httpStatus,
          retried: attempt,
          success: true,
        });

        if (!json.results) {
          return {
            cuit,
            available: false,
            error: `Respuesta BCRA sin campo \"results\" para CUIT ${cuit}.`,
            data: null,
          };
        }

        return {
          cuit,
          available: true,
          error: null,
          data: normalizeBcraResult(json.results),
        };
      } catch (err) {
        clearTimeout(timer);
        lastErr = err;
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || err.message.includes("aborted"));
        this.onCall?.({
          label: "bcra.deudas.lookup",
          durationMs: Date.now() - start,
          httpStatus: null,
          retried: attempt,
          success: false,
        });
        if (attempt < this.maxRetries && !isAbort) {
          await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
          continue;
        }
        return {
          cuit,
          available: false,
          error: `Error contactando BCRA: ${err instanceof Error ? err.message : String(err)}.`,
          data: null,
        };
      }
    }
    return {
      cuit,
      available: false,
      error: `Error contactando BCRA tras ${this.maxRetries + 1} intentos: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}.`,
      data: null,
    };
  }
}

export interface BcraPublicApiAdapterOptions {
  /** Override the BCRA endpoint base (testing only). */
  endpoint?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx + transient errors. Default 1. */
  maxRetries?: number;
  /** Observability hook fired after every request. */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

interface BcraApiResults {
  identificacion: number;
  denominacion?: string;
  periodos?: Array<{
    periodo: string;
    entidades?: Array<{
      entidad?: string;
      situacion?: number;
      fechaSit1?: string;
      monto?: number;
      diasAtrasoPago?: number;
      refinanciaciones?: string;
      recategorizacionOblig?: string;
      situacionJuridica?: string;
      irrecDisposicionTecnica?: string;
      enRevision?: string;
      procesoJud?: string;
    }>;
  }>;
}

function normalizeBcraResult(
  results: BcraApiResults,
): BcraDeudaResult["data"] {
  const periods = results.periodos ?? [];
  const latestPeriod = periods[0];
  const entities = (latestPeriod?.entidades ?? []).map((e) => ({
    entity: e.entidad ?? "Desconocido",
    situation: clampSituation(e.situacion ?? 0),
    amount: e.monto ?? 0,
    daysOverdue: e.diasAtrasoPago ?? 0,
    refinanced: e.refinanciaciones === "S",
    inReview: e.enRevision === "S",
    inLitigation: e.procesoJud === "S",
  }));
  let worst: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 0;
  let total = 0;
  for (const e of entities) {
    if (e.situation > worst) worst = e.situation;
    total += e.amount;
  }
  return {
    name: results.denominacion ?? "",
    period: latestPeriod?.periodo ?? "",
    worstSituation: worst,
    totalAmount: total,
    entities,
  };
}

function clampSituation(n: number): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  if (n <= 0) return 0;
  if (n >= 6) return 6;
  return Math.floor(n) as 1 | 2 | 3 | 4 | 5;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}
