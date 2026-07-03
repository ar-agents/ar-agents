import { describe, expect, it, vi } from "vitest";
import {
  HttpBcraAdapter,
  InMemoryBcraAdapter,
  UnconfiguredBcraAdapter,
  bcraTools,
  ALL_TOOL_NAMES,
  riskBand,
  summarizeDebt,
  entryAmountCentavos,
  normalizeCuit,
  BcraApiError,
  BcraNotFoundError,
  BcraUnconfiguredError,
  BcraValidationError,
  type DebtResponse,
  type FetchLike,
} from "../src/index";

function mockFetch(
  responder: (url: string) => {
    ok: boolean;
    status: number;
    body: unknown;
  },
): FetchLike {
  return async (url) => {
    const r = responder(url);
    return {
      ok: r.ok,
      status: r.status,
      text: async () => JSON.stringify(r.body),
      json: async () => r.body,
    };
  };
}

const cleanDebt: DebtResponse = {
  cuit: "30500000018",
  periodo: "202601",
  entidades: [],
};

const lowRiskDebt: DebtResponse = {
  cuit: "30500000018",
  periodo: "202601",
  entidades: [
    {
      entidad: "BANCO DE LA NACION ARGENTINA",
      nombre: "BANCO DE LA NACION ARGENTINA",
      periodo: "202601",
      situacion: 1,
      montoEnMiles: 150, // ARS 150.000
      procesoJud: false,
      refinanciaciones: false,
      situacionFraude: false,
      enRevision: false,
    },
    {
      entidad: "BANCO DE LA PROVINCIA DE BUENOS AIRES",
      nombre: "BANCO DE LA PROVINCIA DE BUENOS AIRES",
      periodo: "202601",
      situacion: 2,
      montoEnMiles: 90, // ARS 90.000
      procesoJud: false,
      refinanciaciones: false,
      situacionFraude: false,
      enRevision: false,
    },
  ],
};

const watchDebt: DebtResponse = {
  cuit: "30500000018",
  periodo: "202601",
  entidades: [
    {
      entidad: "BANCO X",
      nombre: "BANCO X",
      periodo: "202601",
      situacion: 3,
      montoEnMiles: 500,
      procesoJud: false,
      refinanciaciones: false,
      situacionFraude: false,
      enRevision: false,
    },
  ],
};

const highRiskDebt: DebtResponse = {
  cuit: "30500000018",
  periodo: "202601",
  entidades: [
    {
      entidad: "BANCO X",
      nombre: "BANCO X",
      periodo: "202601",
      situacion: 5,
      montoEnMiles: 2_000,
      procesoJud: true,
      refinanciaciones: false,
      situacionFraude: false,
      enRevision: false,
    },
  ],
};

describe("normalizeCuit", () => {
  it("strips hyphens", () => {
    expect(normalizeCuit("30-50000001-8")).toBe("30500000018");
  });
  it("rejects garbage", () => {
    expect(() => normalizeCuit("nope")).toThrow(BcraValidationError);
    expect(() => normalizeCuit("1234")).toThrow(BcraValidationError);
  });
});

describe("summarizeDebt", () => {
  it("empty entidades → zeros + worst 0", () => {
    const s = summarizeDebt(cleanDebt);
    expect(s.entidadesCount).toBe(0);
    expect(s.totalCentavos).toBe(0);
    expect(s.worstSituacion).toBe(0);
    expect(s.hasProcesoJudicial).toBe(false);
  });

  it("rolls up centavos honoring montoEnMiles", () => {
    const s = summarizeDebt(lowRiskDebt);
    // 150_000 ARS = 15_000_000 centavos
    //  90_000 ARS =  9_000_000 centavos
    // sum         = 24_000_000 centavos
    expect(s.totalCentavos).toBe(24_000_000);
  });

  it("worstSituacion is the max across entidades", () => {
    const s = summarizeDebt(lowRiskDebt);
    expect(s.worstSituacion).toBe(2);
  });

  it("flags carry over when any entidad has them", () => {
    const s = summarizeDebt(highRiskDebt);
    expect(s.hasProcesoJudicial).toBe(true);
  });
});

describe("riskBand", () => {
  it("clean: no entidades", () => {
    expect(riskBand(summarizeDebt(cleanDebt))).toBe("clean");
  });
  it("low: worst ≤ 2 + no flags", () => {
    expect(riskBand(summarizeDebt(lowRiskDebt))).toBe("low");
  });
  it("watch: worst = 3", () => {
    expect(riskBand(summarizeDebt(watchDebt))).toBe("watch");
  });
  it("high: judicial flag dominates", () => {
    expect(riskBand(summarizeDebt(highRiskDebt))).toBe("high");
  });
});

describe("entryAmountCentavos", () => {
  it("converts ARS thousands to centavos", () => {
    expect(
      entryAmountCentavos({
        entidad: "BANCO X",
        nombre: "BANCO X",
        periodo: "p",
        situacion: 1,
        montoEnMiles: 150,
        procesoJud: false,
        refinanciaciones: false,
        situacionFraude: false,
        enRevision: false,
      }),
    ).toBe(15_000_000);
  });
});

describe("UnconfiguredBcraAdapter", () => {
  it("throws on every method", async () => {
    const a = new UnconfiguredBcraAdapter();
    await expect(a.getDebt("30500000018")).rejects.toThrow(BcraUnconfiguredError);
    await expect(a.getHistoricalDebt("30500000018")).rejects.toThrow(
      BcraUnconfiguredError,
    );
    await expect(a.getBouncedChecks("30500000018")).rejects.toThrow(
      BcraUnconfiguredError,
    );
  });
});

describe("InMemoryBcraAdapter", () => {
  it("returns the seeded row for a known cuit", async () => {
    const a = new InMemoryBcraAdapter({ debts: [lowRiskDebt] });
    const r = await a.getDebt("30500000018");
    expect(r.entidades.length).toBe(2);
  });

  it("BcraNotFoundError for an unknown cuit", async () => {
    const a = new InMemoryBcraAdapter({ debts: [lowRiskDebt] });
    await expect(a.getDebt("20111111110")).rejects.toBeInstanceOf(
      BcraNotFoundError,
    );
  });

  it("accepts hyphenated cuit", async () => {
    const a = new InMemoryBcraAdapter({ debts: [lowRiskDebt] });
    const r = await a.getDebt("30-50000001-8");
    expect(r.cuit).toBe("30500000018");
  });
});

describe("HttpBcraAdapter", () => {
  it("targets the public BCRA host", async () => {
    let capturedUrl = "";
    const a = new HttpBcraAdapter({
      fetch: mockFetch((url) => {
        capturedUrl = url;
        return {
          ok: true,
          status: 200,
          body: {
            results: {
              identificacion: 30500000018,
              denominacion: "EMPRESA DEMO SA",
              periodos: [{ periodo: "202601", entidades: [] }],
            },
          },
        };
      }),
    });
    await a.getDebt("30500000018");
    expect(capturedUrl).toBe(
      "https://api.bcra.gob.ar/centraldedeudores/v1.0/Deudas/30500000018",
    );
  });

  it("parses the real BCRA-shape response (results.periodos[].entidades)", async () => {
    // Real /Deudas/{cuit} v1.0 body: debts live under
    // results.periodos[].entidades, and each entidad's `entidad` field
    // is the bank NAME string (no numeric code).
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        body: {
          status: 200,
          results: {
            identificacion: 30500000018,
            denominacion: "EMPRESA DEMO SA",
            periodos: [
              {
                periodo: "202601",
                entidades: [
                  {
                    entidad: "BANCO DE LA NACION ARGENTINA",
                    situacion: 2,
                    fechaSit1: "2026-01-31",
                    monto: 150,
                    diasAtrasoPago: 0,
                    refinanciaciones: false,
                    recategorizacionOblig: false,
                    situacionJuridica: false,
                    irrecDisposicionTecnica: false,
                    enRevision: false,
                    procesoJud: false,
                  },
                ],
              },
            ],
          },
        },
      })),
    });
    const r = await a.getDebt("30500000018");
    expect(r.periodo).toBe("202601");
    expect(r.entidades).toHaveLength(1);
    expect(r.entidades[0]?.entidad).toBe("BANCO DE LA NACION ARGENTINA");
    expect(r.entidades[0]?.nombre).toBe("BANCO DE LA NACION ARGENTINA");
    expect(r.entidades[0]?.situacion).toBe(2);
    expect(r.entidades[0]?.montoEnMiles).toBe(150);
  });

  it("getDebt surfaces a situación-5 judicial debtor → NOT clean", async () => {
    // Regression: the parser used to read root-level `entidades`, which
    // the real API never emits, so every debtor came back clean and
    // credit was approved. Feed a real periodos-nested body with an
    // irrecuperable (situación 5) debtor in proceso judicial.
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        body: {
          status: 200,
          results: {
            identificacion: 30500000018,
            denominacion: "MOROSO SA",
            periodos: [
              {
                periodo: "202601",
                entidades: [
                  {
                    entidad: "BANCO DE LA NACION ARGENTINA",
                    situacion: 5,
                    monto: 2_000,
                    diasAtrasoPago: 400,
                    refinanciaciones: false,
                    enRevision: true,
                    procesoJud: true,
                  },
                ],
              },
            ],
          },
        },
      })),
    });
    const r = await a.getDebt("30500000018");
    expect(r.entidades).toHaveLength(1);
    expect(r.entidades[0]?.situacion).toBe(5);
    expect(r.entidades[0]?.procesoJud).toBe(true);

    const summary = summarizeDebt(r);
    expect(summary.worstSituacion).toBe(5);
    expect(summary.hasProcesoJudicial).toBe(true);
    expect(riskBand(summary)).not.toBe("clean");
    expect(riskBand(summary)).toBe("high");
  });

  it("picks the most recent periodo when several are returned", async () => {
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        body: {
          results: {
            periodos: [
              {
                periodo: "202511",
                entidades: [
                  { entidad: "BANCO VIEJO", situacion: 1, monto: 10 },
                ],
              },
              {
                periodo: "202601",
                entidades: [
                  { entidad: "BANCO NUEVO", situacion: 3, monto: 20 },
                ],
              },
            ],
          },
        },
      })),
    });
    const r = await a.getDebt("30500000018");
    expect(r.periodo).toBe("202601");
    expect(r.entidades).toHaveLength(1);
    expect(r.entidades[0]?.entidad).toBe("BANCO NUEVO");
    expect(r.entidades[0]?.situacion).toBe(3);
  });

  it("maps 404 to BcraNotFoundError (not generic API error)", async () => {
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({ ok: false, status: 404, body: null })),
    });
    await expect(a.getDebt("30500000018")).rejects.toBeInstanceOf(
      BcraNotFoundError,
    );
  });

  it("maps 5xx to retryable BcraApiError", async () => {
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({ ok: false, status: 503, body: null })),
    });
    try {
      await a.getDebt("30500000018");
      expect.fail("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(BcraApiError);
      const e = err as BcraApiError;
      expect(e.status).toBe(503);
      expect(e.retryable).toBe(true);
    }
  });

  it("clamps situacion to 1..6", async () => {
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        body: {
          results: {
            periodos: [
              {
                periodo: "202601",
                entidades: [{ entidad: "BANCO X", situacion: 99 }],
              },
            ],
          },
        },
      })),
    });
    const r = await a.getDebt("30500000018");
    expect(r.entidades[0]?.situacion).toBe(6);
  });

  it("getBouncedChecks parses the cheques array", async () => {
    const a = new HttpBcraAdapter({
      fetch: mockFetch(() => ({
        ok: true,
        status: 200,
        body: {
          results: {
            cheques: [
              {
                entidad: 11,
                nombreEntidad: "Banco Nación",
                fechaRechazo: "2026-04-15",
                monto: 50_000,
                numeroCheque: "0123456",
                causa: "Sin fondos suficientes",
              },
            ],
          },
        },
      })),
    });
    const r = await a.getBouncedChecks("30500000018");
    expect(r.cheques).toHaveLength(1);
    expect(r.cheques[0]?.causa).toContain("fondos");
  });

  it("requires fetch (no globalThis.fetch + no opt) throws", () => {
    const originalFetch = (globalThis as { fetch?: unknown }).fetch;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).fetch = undefined;
    try {
      expect(() => new HttpBcraAdapter()).toThrow(BcraUnconfiguredError);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = originalFetch;
    }
  });
});

describe("bcraTools factory", () => {
  it("exposes all 4 tools by default", () => {
    const t = bcraTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("debt_summary returns summary + riskBand", async () => {
    const t = bcraTools({
      adapter: new InMemoryBcraAdapter({ debts: [lowRiskDebt] }),
    });
    type DebtSummaryWithRisk = ReturnType<typeof summarizeDebt> & { riskBand: string };
    const result = (await (
      t.bcra_get_debt_summary.execute as (a: unknown, c: unknown) => Promise<DebtSummaryWithRisk>
    )({ cuit: "30500000018" }, {})) as DebtSummaryWithRisk;
    expect(result.riskBand).toBe("low");
    expect(result.entidadesCount).toBe(2);
  });

  it("each tool description is meaningful (>40 chars)", () => {
    const t = bcraTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description, `${name} missing description`).toBeTruthy();
      expect(def.description!.length).toBeGreaterThan(40);
    }
  });
});

// vi import retained for future test additions
void vi;
