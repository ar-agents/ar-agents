import { describe, it, expect } from "vitest";
import {
  calculateRetention,
  buildRetentionDdjj,
  quickRetention,
  asEntry,
  IvaRetentionValidationError,
  IvaRetentionRateNotFoundError,
  type RetentionInput,
} from "../src/index";

const supplierCuit = "20111111110";
const date = "2026-01-15";

describe("calculateRetention — RG 2854 general (servicios)", () => {
  it("RI: 50% sobre el IVA por encima del mínimo", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 10_000_000, // $100k IVA
    });
    expect(r.retentionCentavos).toBe(5_000_000); // 50% → $50k
    expect(r.rate).toBe(0.5);
  });

  it("RI: 0 cuando IVA < mínimo (500.000 centavos = $5.000)", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 400_000, // $4.000 IVA
    });
    expect(r.retentionCentavos).toBe(0);
    expect(r.waiverReason).toBe("below_minimum");
  });

  it("no_categorizado: 100% del IVA sin mínimo", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "no_categorizado",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 10_000,
    });
    expect(r.retentionCentavos).toBe(10_000);
  });

  it("monotributista: 0 con waiverReason monotributista", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "monotributista",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 10_000_000,
    });
    expect(r.retentionCentavos).toBe(0);
    expect(r.waiverReason).toBe("monotributista");
  });

  it("exento: 0 con waiverReason exempt_supplier", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "exento",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 10_000_000,
    });
    expect(r.retentionCentavos).toBe(0);
    expect(r.waiverReason).toBe("exempt_supplier");
  });
});

describe("calculateRetention — RG 2854 general (cosas muebles)", () => {
  it("RI: 80% sobre el IVA", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "cosas_muebles",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 1_000_000, // $10k IVA
    });
    expect(r.retentionCentavos).toBe(800_000); // 80%
    expect(r.rate).toBe(0.8);
  });
});

describe("calculateRetention — RG 2854 general (locaciones inmuebles)", () => {
  it("RI: 50% sobre el IVA", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "locaciones_inmuebles",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 2_000_000,
    });
    expect(r.retentionCentavos).toBe(1_000_000);
  });
});

describe("calculateRetention — certificate", () => {
  it("certificate trumps table rate (returns 0)", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 10_000_000,
      supplierHasNonRetentionCertificate: true,
    });
    expect(r.retentionCentavos).toBe(0);
    expect(r.waiverReason).toBe("non_retention_certificate");
  });
});

describe("calculateRetention — validation", () => {
  it("rejects negative ivaCentavos", () => {
    expect(() =>
      calculateRetention({
        regime: "rg_2854_general",
        operationType: "servicios",
        supplierStatus: "responsable_inscripto",
        supplierCuit,
        paymentDate: date,
        ivaCentavos: -1,
      }),
    ).toThrow(IvaRetentionValidationError);
  });

  it("rejects bad CUIT", () => {
    expect(() =>
      calculateRetention({
        regime: "rg_2854_general",
        operationType: "servicios",
        supplierStatus: "responsable_inscripto",
        supplierCuit: "abc",
        paymentDate: date,
        ivaCentavos: 1000,
      }),
    ).toThrow(IvaRetentionValidationError);
  });

  it("rejects bad date", () => {
    expect(() =>
      calculateRetention({
        regime: "rg_2854_general",
        operationType: "servicios",
        supplierStatus: "responsable_inscripto",
        supplierCuit,
        paymentDate: "2026/01/15",
        ivaCentavos: 1000,
      }),
    ).toThrow(IvaRetentionValidationError);
  });

  it("rejects missing rate-table entry", () => {
    const input: RetentionInput = {
      regime: "rg_5057_servicios_digitales",
      operationType: "servicios",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 10_000_000,
      rateTable: [],
    };
    expect(() => calculateRetention(input)).toThrow(IvaRetentionRateNotFoundError);
  });

  it("normalizes hyphenated CUIT", () => {
    const r = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "responsable_inscripto",
      supplierCuit: "20-11111111-0",
      paymentDate: date,
      ivaCentavos: 10_000_000,
    });
    expect(r.supplierCuit).toBe("20111111110");
  });
});

describe("buildRetentionDdjj", () => {
  it("aggregates by regime + supplier", () => {
    const r1 = calculateRetention({
      regime: "rg_2854_general",
      operationType: "servicios",
      supplierStatus: "responsable_inscripto",
      supplierCuit,
      paymentDate: date,
      ivaCentavos: 1_000_000,
    });
    const r2 = calculateRetention({
      regime: "rg_2854_general",
      operationType: "cosas_muebles",
      supplierStatus: "no_categorizado",
      supplierCuit: "20999999990",
      paymentDate: date,
      ivaCentavos: 100_000,
    });
    const ddjj = buildRetentionDdjj({
      period: "2026-01",
      agentCuit: "20417581015",
      entries: [asEntry("FA-001", r1), asEntry("FA-002", r2)],
    });
    expect(ddjj.totals.retentionCentavos).toBe(500_000 + 100_000);
    expect(ddjj.totals.entryCount).toBe(2);
    expect(ddjj.byRegime[0]?.entryCount).toBe(2);
    expect(ddjj.bySupplier.length).toBe(2);
  });

  it("rejects malformed period", () => {
    expect(() =>
      buildRetentionDdjj({
        period: "2026/01",
        agentCuit: "20417581015",
        entries: [],
      }),
    ).toThrow(IvaRetentionValidationError);
  });
});

describe("quickRetention", () => {
  it("returns just the amount", () => {
    const amt = quickRetention(
      "rg_2854_general",
      "servicios",
      "responsable_inscripto",
      10_000_000,
    );
    expect(amt).toBe(5_000_000);
  });

  it("honors certificate flag", () => {
    const amt = quickRetention(
      "rg_2854_general",
      "servicios",
      "responsable_inscripto",
      10_000_000,
      { supplierHasNonRetentionCertificate: true },
    );
    expect(amt).toBe(0);
  });
});
