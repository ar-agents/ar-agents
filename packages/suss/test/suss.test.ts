import { describe, expect, it } from "vitest";
import {
  calculateEmployeeMonth,
  buildSicossDdjj,
  quickContribuciones,
  DEFAULT_RATE_TABLE,
  sussTools,
  ALL_TOOL_NAMES,
  SussValidationError,
  SussUnconfiguredError,
  UnconfiguredSussAdapter,
  type EmployeeMonthInput,
} from "../src/index";

const baseEmp: EmployeeMonthInput = {
  cuil: "20111111110",
  period: "2026-01",
  remuneracionBrutaCentavos: 100_000_000, // ARS 1.000.000 brutos
};

describe("calculateEmployeeMonth (régimen general)", () => {
  const r = calculateEmployeeMonth({ employee: baseEmp });

  it("normalizes cuil", () => {
    const r2 = calculateEmployeeMonth({
      employee: { ...baseEmp, cuil: "20-11111111-0" },
    });
    expect(r2.cuil).toBe("20111111110");
  });

  it("EMPLEADO aportes: 11% + 3% + 3% = 17%", () => {
    // jub 11% of 1M ARS = 110k ARS = 11_000_000 centavos
    expect(r.aportes.jubilacion).toBe(11_000_000);
    expect(r.aportes.inssjp).toBe(3_000_000);
    expect(r.aportes.obraSocial).toBe(3_000_000);
    expect(r.aportes.total).toBe(17_000_000);
  });

  it("EMPLEADOR contribuciones general regime", () => {
    // jub 10.17% of 100_000_000 = 10_170_000
    expect(r.contribuciones.jubilacion).toBe(10_170_000);
    // inssjp 1.5%
    expect(r.contribuciones.inssjp).toBe(1_500_000);
    // aaff 4.7%
    expect(r.contribuciones.asignacionesFamiliares).toBe(4_700_000);
    // fne 0.94%
    expect(r.contribuciones.fondoNacionalEmpleo).toBe(940_000);
    // obra social empleador 6%
    expect(r.contribuciones.obraSocial).toBe(6_000_000);
    // art 5% default
    expect(r.contribuciones.art).toBe(5_000_000);

    // Total = 10.17 + 1.5 + 4.7 + 0.94 + 6 + 5 = 28.31%
    expect(r.contribuciones.total).toBe(28_310_000);
  });

  it("vector totals match SICOSS expectations", () => {
    // seguridad social = jub + inssjp + aaff + fne
    expect(r.contribucionesSeguridadSocialCentavos).toBe(
      10_170_000 + 1_500_000 + 4_700_000 + 940_000,
    );
    expect(r.contribucionesObraSocialCentavos).toBe(6_000_000);
    expect(r.contribucionesArtCentavos).toBe(5_000_000);
    expect(r.totalContribucionesCentavos).toBe(r.contribuciones.total);
  });
});

describe("calculateEmployeeMonth — grandes empleadores", () => {
  it("uses the higher rate matrix", () => {
    const r = calculateEmployeeMonth({
      employee: baseEmp,
      employerRegime: "grandes_empleadores",
    });
    // jub 12.71%
    expect(r.contribuciones.jubilacion).toBe(12_710_000);
    // aaff 5.4%
    expect(r.contribuciones.asignacionesFamiliares).toBe(5_400_000);
  });
});

describe("calculateEmployeeMonth — art override", () => {
  it("honors a custom artRate", () => {
    const r = calculateEmployeeMonth({
      employee: baseEmp,
      artRate: 0.08, // 8%
    });
    expect(r.contribuciones.art).toBe(8_000_000);
  });

  it("rejects artRate out of range", () => {
    expect(() =>
      calculateEmployeeMonth({ employee: baseEmp, artRate: 1.5 }),
    ).toThrow(SussValidationError);
    expect(() =>
      calculateEmployeeMonth({ employee: baseEmp, artRate: -0.1 }),
    ).toThrow(SussValidationError);
  });
});

describe("calculateEmployeeMonth — validation", () => {
  it("rejects negative remuneración", () => {
    expect(() =>
      calculateEmployeeMonth({
        employee: { ...baseEmp, remuneracionBrutaCentavos: -1 },
      }),
    ).toThrow(SussValidationError);
  });
  it("rejects bad CUIL", () => {
    expect(() =>
      calculateEmployeeMonth({ employee: { ...baseEmp, cuil: "abc" } }),
    ).toThrow(SussValidationError);
  });
  it("rejects bad period", () => {
    expect(() =>
      calculateEmployeeMonth({ employee: { ...baseEmp, period: "2026/01" } }),
    ).toThrow(SussValidationError);
  });
  it("non-remunerativos default to 0", () => {
    const r = calculateEmployeeMonth({ employee: baseEmp });
    expect(r.noRemunerativosCentavos).toBe(0);
  });
});

describe("buildSicossDdjj", () => {
  const employees: EmployeeMonthInput[] = [
    {
      cuil: "20111111110",
      nombre: "Empleado A",
      period: "2026-01",
      remuneracionBrutaCentavos: 100_000_000, // 1M
    },
    {
      cuil: "20222222220",
      nombre: "Empleado B",
      period: "2026-01",
      remuneracionBrutaCentavos: 50_000_000, // 500k
    },
  ];

  it("aggregates totals across employees", () => {
    const ddjj = buildSicossDdjj({
      period: "2026-01",
      employerCuit: "30500000018",
      employees,
    });
    expect(ddjj.totals.employees).toBe(2);
    expect(ddjj.totals.remuneracionBrutaCentavos).toBe(150_000_000);
    // contribuciones general = 28.31% × 150M = 42_465_000
    expect(ddjj.totals.contribucionesCentavos).toBe(42_465_000);
    expect(ddjj.totals.remitirCentavos).toBe(42_465_000);
  });

  it("vector totals are present", () => {
    const ddjj = buildSicossDdjj({
      period: "2026-01",
      employerCuit: "30500000018",
      employees,
    });
    expect(ddjj.byVector.seguridadSocial).toBeGreaterThan(0);
    expect(ddjj.byVector.obraSocial).toBeGreaterThan(0);
    expect(ddjj.byVector.art).toBeGreaterThan(0);
  });

  it("rejects malformed period", () => {
    expect(() =>
      buildSicossDdjj({
        period: "2026/01",
        employerCuit: "30500000018",
        employees,
      }),
    ).toThrow(SussValidationError);
  });

  it("accepts pre-computed EmployeeMonthResult inputs", () => {
    const r1 = calculateEmployeeMonth({ employee: employees[0]! });
    const r2 = calculateEmployeeMonth({ employee: employees[1]! });
    const ddjj = buildSicossDdjj({
      period: "2026-01",
      employerCuit: "30500000018",
      employees: [r1, r2],
    });
    expect(ddjj.totals.employees).toBe(2);
    expect(ddjj.employees[0]).toBe(r1);
  });
});

describe("quickContribuciones", () => {
  it("returns just the total for a single employee", () => {
    const t = quickContribuciones(100_000_000);
    // 28.31% of 100_000_000 = 28_310_000
    expect(t).toBe(28_310_000);
  });

  it("honors regime", () => {
    const general = quickContribuciones(100_000_000, { employerRegime: "general" });
    const large = quickContribuciones(100_000_000, {
      employerRegime: "grandes_empleadores",
    });
    expect(large).toBeGreaterThan(general);
  });
});

describe("DEFAULT_RATE_TABLE sanity", () => {
  it("EMPLEADO total adds to 17%", () => {
    const t = DEFAULT_RATE_TABLE;
    expect(t.jubilacionEmpleado + t.inssjpEmpleado + t.obraSocialEmpleado).toBeCloseTo(
      0.17,
      4,
    );
  });

  it("general SS total ≈ 17.31%", () => {
    const t = DEFAULT_RATE_TABLE;
    const ss =
      t.jubilacionEmpleadorGeneral +
      t.inssjpEmpleadorGeneral +
      t.asignacionesFamiliaresGeneral +
      t.fneGeneral;
    expect(ss).toBeCloseTo(0.1731, 4);
  });
});

describe("sussTools factory", () => {
  it("exposes all 3 tools by default", () => {
    const t = sussTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("submit_ddjj throws unconfigured by default", async () => {
    const t = sussTools();
    await expect(
      (t.suss_submit_ddjj.execute as (a: unknown, c: unknown) => Promise<unknown>)(
        { ddjj: {} },
        {},
      ),
    ).rejects.toBeInstanceOf(SussUnconfiguredError);
  });

  it("each tool description is meaningful (>40 chars)", () => {
    const t = sussTools();
    for (const [name, def] of Object.entries(t)) {
      expect(def.description, `${name} missing description`).toBeTruthy();
      expect(def.description!.length).toBeGreaterThan(40);
    }
  });
});

describe("UnconfiguredSussAdapter", () => {
  it("throws on submitDdjj", async () => {
    const a = new UnconfiguredSussAdapter();
    await expect(a.submitDdjj({} as never)).rejects.toBeInstanceOf(
      SussUnconfiguredError,
    );
  });
});
