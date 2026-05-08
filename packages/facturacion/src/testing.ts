/**
 * `@ar-agents/facturacion/testing` — fixtures + mock WSFE client for tests.
 *
 * Mocks the AFIP/ARCA WSFE surface so cookbook recipes, agent loops, and
 * downstream apps can be tested without a real ARCA cert + WSAA token round-
 * trip.
 *
 * What you get:
 *
 *   - **`MockWsfeClient`** — public-method-compatible stand-in for `WsfeClient`.
 *     Pass it to `facturacionTools({ wsfe: mock as unknown as WsfeClient })`.
 *     Calls are recorded in `.calls` for assertion. Seed responses with
 *     `seedSolicitarCAE`, `seedUltimoAutorizado`, `seedConsultarComprobante`,
 *     `seedDummy`.
 *
 *   - **Factories** for the result shapes:
 *     `mockSolicitarCaeApproved`, `mockSolicitarCaeRejected`,
 *     `mockUltimoComprobante`, `mockConsultarComprobante`,
 *     `mockDummyOk`, `mockDummyDown`.
 *
 * The `validator.ts` tests don't need this — that module is pure.
 */

import { CbteTipo, type CbteTipoCode, DocTipo, type DocTipoCode } from "./catalogs";
import type {
  ConsultarComprobanteResult,
  DummyResult,
  SolicitarCaeInput,
  SolicitarCaeResult,
  UltimoComprobanteResult,
} from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const todayYmd = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

const plusDaysYmd = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
};

const synthCae = (cbteNro: number): string => {
  // 14 digits — first two YY, next 10 padded cbteNro, last 2 random-ish
  const yy = String(new Date().getFullYear()).slice(2);
  const nroPad = String(cbteNro).padStart(10, "0");
  const tail = String((cbteNro * 7) % 100).padStart(2, "0");
  return `${yy}${nroPad}${tail}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Approved factura — CAE issued, no observaciones, no errors.
 *
 * Defaults to a Factura B (1 unit, $100k, 21% IVA) but the caller can override
 * any field. Useful for happy-path agent-loop tests.
 */
export function mockSolicitarCaeApproved(
  overrides: Partial<SolicitarCaeResult> = {},
): SolicitarCaeResult {
  const cbteDesde = overrides.cbteDesde ?? 1;
  const cbteHasta = overrides.cbteHasta ?? cbteDesde;
  return {
    resultado: "A",
    cae: synthCae(cbteDesde),
    caeFchVto: plusDaysYmd(10),
    ptoVta: overrides.ptoVta ?? 1,
    cbteTipo: overrides.cbteTipo ?? CbteTipo.FACTURA_B,
    cbteDesde,
    cbteHasta,
    cbteFch: overrides.cbteFch ?? todayYmd(),
    fchProceso: overrides.fchProceso ?? todayYmd(),
    observaciones: overrides.observaciones ?? [],
    errors: overrides.errors ?? [],
    eventos: overrides.eventos ?? [],
  };
}

/**
 * Rejected factura — no CAE, with `errors` populated. Default error code 10015
 * is "Factura B con receptor que no es Consumidor Final" — a common rejection
 * the validator catches but tests need to simulate the AFIP-side path too.
 */
export function mockSolicitarCaeRejected(
  args: {
    code?: number;
    msg?: string;
    ptoVta?: number;
    cbteTipo?: CbteTipoCode;
    cbteDesde?: number;
  } = {},
): SolicitarCaeResult {
  const cbteDesde = args.cbteDesde ?? 1;
  return {
    resultado: "R",
    cae: null,
    caeFchVto: null,
    ptoVta: args.ptoVta ?? 1,
    cbteTipo: args.cbteTipo ?? CbteTipo.FACTURA_B,
    cbteDesde,
    cbteHasta: cbteDesde,
    cbteFch: todayYmd(),
    fchProceso: todayYmd(),
    observaciones: [],
    errors: [
      {
        code: args.code ?? 10015,
        msg:
          args.msg ??
          "El receptor de una Factura B debe ser Consumidor Final.",
      },
    ],
    eventos: [],
  };
}

/** Last authorized comprobante — defaults to "no comprobante yet" (cbteNro 0). */
export function mockUltimoComprobante(
  ptoVta = 1,
  cbteTipo: CbteTipoCode = CbteTipo.FACTURA_B,
  cbteNro = 0,
): UltimoComprobanteResult {
  return { ptoVta, cbteTipo, cbteNro };
}

/** Echo of an authorized comprobante. */
export function mockConsultarComprobante(
  args: {
    found?: boolean;
    ptoVta?: number;
    cbteTipo?: CbteTipoCode;
    cbteNro?: number;
    docTipo?: DocTipoCode;
    docNro?: string;
    impTotal?: number;
    impNeto?: number;
    impIVA?: number;
  } = {},
): ConsultarComprobanteResult {
  const cbteNro = args.cbteNro ?? 1;
  const ptoVta = args.ptoVta ?? 1;
  return {
    found: args.found ?? true,
    ptoVta,
    cbteTipo: args.cbteTipo ?? CbteTipo.FACTURA_B,
    cbteDesde: cbteNro,
    cbteHasta: cbteNro,
    cbteFch: todayYmd(),
    cae: synthCae(cbteNro),
    caeFchVto: plusDaysYmd(10),
    resultado: "A",
    emisionTipo: "CAE",
    docTipo: args.docTipo ?? DocTipo.CUIT,
    docNro: args.docNro ?? "30000000007",
    impTotal: args.impTotal ?? 121_000,
    impNeto: args.impNeto ?? 100_000,
    impIVA: args.impIVA ?? 21_000,
    observaciones: [],
  };
}

/** AFIP servers all healthy. */
export function mockDummyOk(): DummyResult {
  return { appServer: "OK", dbServer: "OK", authServer: "OK" };
}

/** AFIP DB server down — simulates planned-maintenance window. */
export function mockDummyDown(
  which: "appServer" | "dbServer" | "authServer" = "dbServer",
): DummyResult {
  const base: DummyResult = { appServer: "OK", dbServer: "OK", authServer: "OK" };
  base[which] = "DOWN";
  return base;
}

// ─────────────────────────────────────────────────────────────────────────────
// MockWsfeClient
// ─────────────────────────────────────────────────────────────────────────────

type CallLogEntry =
  | { method: "dummy" }
  | { method: "consultarUltimoAutorizado"; ptoVta: number; cbteTipo: CbteTipoCode }
  | { method: "consultarComprobante"; ptoVta: number; cbteTipo: CbteTipoCode; cbteNro: number }
  | { method: "solicitarCAE"; input: SolicitarCaeInput }
  | { method: "getTiposCbte" | "getTiposDoc" | "getTiposIva" | "getTiposConcepto" | "getTiposMonedas" }
  | { method: "getCotizacion"; monId: string };

/**
 * Stand-in for `WsfeClient`. Public-method compatible — pass to
 * `facturacionTools()` with a single cast:
 *
 * ```ts
 * import { MockWsfeClient, mockSolicitarCaeApproved } from "@ar-agents/facturacion/testing";
 * import type { WsfeClient } from "@ar-agents/facturacion";
 * import { facturacionTools } from "@ar-agents/facturacion";
 *
 * const mock = new MockWsfeClient()
 *   .seedSolicitarCAE(mockSolicitarCaeApproved({ cbteDesde: 42 }));
 *
 * const tools = facturacionTools({ wsfe: mock as unknown as WsfeClient });
 * ```
 */
export class MockWsfeClient {
  private solicitarCaeQueue: SolicitarCaeResult[] = [];
  private ultimoByKey = new Map<string, UltimoComprobanteResult>();
  private consultarByKey = new Map<string, ConsultarComprobanteResult>();
  private dummyResult: DummyResult = mockDummyOk();
  private cotizacionByMonId = new Map<string, { monId: string; monCotiz: number; fchCotiz: string }>();
  private tiposCbte: Array<{ id: number; desc: string }> = [];
  private tiposDoc: Array<{ id: number; desc: string }> = [];
  private tiposIva: Array<{ id: number; desc: string }> = [];
  private tiposConcepto: Array<{ id: number; desc: string }> = [];
  private tiposMonedas: Array<{ id: string; desc: string }> = [];

  /** Append-only call log for assertions. */
  readonly calls: CallLogEntry[] = [];

  /** Queue a solicitarCAE response. Pops FIFO; falls back to a synthesized approval. */
  seedSolicitarCAE(result: SolicitarCaeResult): this {
    this.solicitarCaeQueue.push(result);
    return this;
  }

  seedSolicitarCAEMany(results: SolicitarCaeResult[]): this {
    this.solicitarCaeQueue.push(...results);
    return this;
  }

  /** Seed the "last authorized" lookup for a (ptoVta, cbteTipo) pair. */
  seedUltimoAutorizado(
    ptoVta: number,
    cbteTipo: CbteTipoCode,
    cbteNro: number,
  ): this {
    this.ultimoByKey.set(`${ptoVta}|${cbteTipo}`, { ptoVta, cbteTipo, cbteNro });
    return this;
  }

  /** Seed a "consultar comprobante" echo. */
  seedConsultarComprobante(
    ptoVta: number,
    cbteTipo: CbteTipoCode,
    cbteNro: number,
    result: ConsultarComprobanteResult,
  ): this {
    this.consultarByKey.set(`${ptoVta}|${cbteTipo}|${cbteNro}`, result);
    return this;
  }

  /** Set the dummy() health-check response. Defaults to all-OK. */
  seedDummy(result: DummyResult): this {
    this.dummyResult = result;
    return this;
  }

  /** Seed a foreign-currency cotización. */
  seedCotizacion(monId: string, monCotiz: number): this {
    this.cotizacionByMonId.set(monId, {
      monId,
      monCotiz,
      fchCotiz: todayYmd(),
    });
    return this;
  }

  /** Provide a custom catalog (defaults to empty array). */
  setTiposCbte(items: Array<{ id: number; desc: string }>): this {
    this.tiposCbte = items;
    return this;
  }
  setTiposDoc(items: Array<{ id: number; desc: string }>): this {
    this.tiposDoc = items;
    return this;
  }
  setTiposIva(items: Array<{ id: number; desc: string }>): this {
    this.tiposIva = items;
    return this;
  }
  setTiposConcepto(items: Array<{ id: number; desc: string }>): this {
    this.tiposConcepto = items;
    return this;
  }
  setTiposMonedas(items: Array<{ id: string; desc: string }>): this {
    this.tiposMonedas = items;
    return this;
  }

  /** Clear `.calls` (does NOT clear seeded data). */
  reset(): this {
    this.calls.length = 0;
    return this;
  }

  /** Clear everything — seeded data + call log. */
  clear(): this {
    this.solicitarCaeQueue.length = 0;
    this.ultimoByKey.clear();
    this.consultarByKey.clear();
    this.cotizacionByMonId.clear();
    this.tiposCbte = [];
    this.tiposDoc = [];
    this.tiposIva = [];
    this.tiposConcepto = [];
    this.tiposMonedas = [];
    this.dummyResult = mockDummyOk();
    this.calls.length = 0;
    return this;
  }

  // ── Public WSFE surface ───────────────────────────────────────────────────

  async dummy(): Promise<DummyResult> {
    this.calls.push({ method: "dummy" });
    return this.dummyResult;
  }

  async consultarUltimoAutorizado(
    ptoVta: number,
    cbteTipo: CbteTipoCode,
  ): Promise<UltimoComprobanteResult> {
    this.calls.push({ method: "consultarUltimoAutorizado", ptoVta, cbteTipo });
    return (
      this.ultimoByKey.get(`${ptoVta}|${cbteTipo}`) ??
      mockUltimoComprobante(ptoVta, cbteTipo, 0)
    );
  }

  async consultarComprobante(
    ptoVta: number,
    cbteTipo: CbteTipoCode,
    cbteNro: number,
  ): Promise<ConsultarComprobanteResult> {
    this.calls.push({
      method: "consultarComprobante",
      ptoVta,
      cbteTipo,
      cbteNro,
    });
    return (
      this.consultarByKey.get(`${ptoVta}|${cbteTipo}|${cbteNro}`) ?? {
        ...mockConsultarComprobante({ ptoVta, cbteTipo, cbteNro }),
        found: false,
      }
    );
  }

  async solicitarCAE(input: SolicitarCaeInput): Promise<SolicitarCaeResult> {
    this.calls.push({ method: "solicitarCAE", input });
    const next = this.solicitarCaeQueue.shift();
    if (next) return next;
    // Fallback: synthesize an approval that echoes the input.
    return mockSolicitarCaeApproved({
      ptoVta: input.ptoVta,
      cbteTipo: input.cbteTipo,
      cbteDesde: input.cbteDesde,
      cbteHasta: input.cbteHasta,
      cbteFch: input.cbteFch,
    });
  }

  async getTiposCbte() {
    this.calls.push({ method: "getTiposCbte" });
    return this.tiposCbte;
  }
  async getTiposDoc() {
    this.calls.push({ method: "getTiposDoc" });
    return this.tiposDoc;
  }
  async getTiposIva() {
    this.calls.push({ method: "getTiposIva" });
    return this.tiposIva;
  }
  async getTiposConcepto() {
    this.calls.push({ method: "getTiposConcepto" });
    return this.tiposConcepto;
  }
  async getTiposMonedas() {
    this.calls.push({ method: "getTiposMonedas" });
    return this.tiposMonedas;
  }

  async getCotizacion(monId: string) {
    this.calls.push({ method: "getCotizacion", monId });
    return (
      this.cotizacionByMonId.get(monId) ?? {
        monId,
        monCotiz: 1,
        fchCotiz: todayYmd(),
      }
    );
  }
}
