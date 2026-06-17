/**
 * SICORE calc tests. All offline, all deterministic. The math has to be
 * right because a buggy retention calc means under- or over-paying AFIP,
 * which is what happens when handcoded accounting tools drift from
 * regulation.
 *
 * Numerical values reference RG 830/00 snapshot 2024-Q4 (mínimos):
 *   - servicios inscripto: mínimo $67.170, rate 2%
 *   - servicios no-inscripto: rate 28%
 *   - bienes inscripto: mínimo $224.000, rate 2%
 *   - alquileres inscripto: mínimo $30.000, rate 6%
 *   - honorarios inscripto: mínimo $67.170, escala 0%-22%
 *   - * exento: rate 0%
 */
import { describe, it, expect } from "vitest";
import {
  calculateRetention,
  calculateRetentionStream,
  buildSicoreDdjj,
  quickRetention,
  asEntry,
  SicoreValidationError,
  SicoreRateNotFoundError,
  type RetentionInput,
} from "../src/index";

const cuit = "20111111110";
const date = "2026-01-15";

describe("calculateRetention — servicios inscripto", () => {
  it("returns 0 when accumulated is below the minimum", () => {
    const r = calculateRetention({
      category: "servicios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 6_000_000, // $60k (below $67.170 mínimo)
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(0);
    expect(r.waiverReason).toBe("below_minimum");
  });

  it("retains 2% on the excedente over $67.170", () => {
    // Payment $100k → excedente $32.830 → 2% = $656,60 = 65.660 centavos
    const r = calculateRetention({
      category: "servicios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 10_000_000, // $100k
      paymentDate: date,
    });
    // excedente = 10_000_000 - 6_717_000 = 3_283_000
    // ret = round(3_283_000 * 0.02) = 65_660
    expect(r.retentionAmountCentavos).toBe(65_660);
    expect(r.effectiveRate).toBeCloseTo(0.02, 6);
  });

  it("applies the accumulator: 2nd payment same month catches up over minimum", () => {
    // First: $50k, accumulated $50k (below mínimo → 0)
    const first = calculateRetention({
      category: "servicios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 5_000_000,
      paymentDate: "2026-01-05",
    });
    expect(first.retentionAmountCentavos).toBe(0);
    // Second: $50k, accumulated $100k → excedente $32.830 → ret $656,60
    const second = calculateRetention({
      category: "servicios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 5_000_000,
      paymentDate: "2026-01-20",
      accumulatedMonthCentavos: 5_000_000,
      alreadyRetainedThisMonthCentavos: 0,
    });
    // accumulated_after = 10_000_000; excedente = 3_283_000; ret = 65_660
    expect(second.retentionAmountCentavos).toBe(65_660);
  });

  it("nets out already-retained so the cumulative never double-counts", () => {
    // First payment retained $40k. Second payment: theoretical $80k → today retains $40k.
    const r = calculateRetention({
      category: "servicios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 100_000_000, // $1M today
      paymentDate: date,
      accumulatedMonthCentavos: 0,
      alreadyRetainedThisMonthCentavos: 4_000_000, // $40k already retained
    });
    // accumulated $1M; excedente = 100_000_000 - 6_717_000 = 93_283_000
    // theoretical = round(93_283_000 * 0.02) = 1_865_660
    // retentionToday = 1_865_660 - 4_000_000 = max(0, ...) = 0 (already over-retained)
    expect(r.theoreticalRetentionCentavos).toBe(1_865_660);
    expect(r.retentionAmountCentavos).toBe(0);
  });
});

describe("calculateRetention — servicios no-inscripto", () => {
  it("retains 28% on the WHOLE payment (no mínimo)", () => {
    const r = calculateRetention({
      category: "servicios",
      status: "no_inscripto",
      supplierCuit: cuit,
      paymentCentavos: 1_000_000, // $10k
      paymentDate: date,
    });
    // No mínimo → excedente = full amount. ret = 1_000_000 * 0.28 = 280_000
    expect(r.retentionAmountCentavos).toBe(280_000);
    expect(r.effectiveRate).toBe(0.28);
  });
});

describe("calculateRetention — honorarios inscripto (escala)", () => {
  it("first tramo: 0% on excedente up to $24.000", () => {
    // pago $90.000 → excedente $22.830 → tramo 1 (0%) → 0 ret
    const r = calculateRetention({
      category: "honorarios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 9_000_000,
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(0);
    expect(r.theoreticalRetentionCentavos).toBe(0);
  });

  it("second tramo: 5% on excedente $24k-$48k", () => {
    // pago $115.170 → excedente $48.000 → tramo 1 lleva el primer $24k → tramo 2 sobre $24k:
    // theoretical = 0 (tramo1) + 0.05 * 24_000 → step 2 applies when excedente ≤ 4_800_000
    // ret = 0 + round((4_800_000 - 2_400_000) * 0.05) = 120_000? Actually...
    // Wait, the implementation uses step.fixedCentavos + rate × (overlap with that step)
    // For excedente at 4_800_000 exactly, applies step 2: fixed 0 + 0.05 * (4_800_000 - 2_400_000) = 120_000
    const r = calculateRetention({
      category: "honorarios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 11_517_000, // excedente exactly 4_800_000
      paymentDate: date,
    });
    expect(r.theoreticalRetentionCentavos).toBe(120_000);
  });

  it("uses the top tramo (22%) for very large excedentes", () => {
    // payment $10M → excedente $9.932.830, falls into top tramo (rate 0.22, fixed $118_800)
    const r = calculateRetention({
      category: "honorarios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 1_000_000_000, // $10M
      paymentDate: date,
    });
    // excedente = 993_283_000
    // step is Infinity tier: rate 0.22, fixed 11_880_000. overlap = 993_283_000 - 76_800_000 = 916_483_000
    // theoretical = 11_880_000 + 0.22 * 916_483_000 = 11_880_000 + 201_626_260 = 213_506_260
    expect(r.theoreticalRetentionCentavos).toBe(213_506_260);
  });
});

describe("calculateRetention — bienes", () => {
  it("inscripto: $0 below $224.000 mínimo", () => {
    const r = calculateRetention({
      category: "bienes",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 20_000_000, // $200k
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(0);
  });

  it("inscripto: 2% on excedente over $224.000", () => {
    // pago $300.000 → excedente $76.000 → ret 2% = $1.520 = 152.000 centavos
    const r = calculateRetention({
      category: "bienes",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 30_000_000,
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(152_000);
  });

  it("no-inscripto: 10% sin mínimo", () => {
    const r = calculateRetention({
      category: "bienes",
      status: "no_inscripto",
      supplierCuit: cuit,
      paymentCentavos: 10_000_000, // $100k
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(1_000_000);
  });
});

describe("calculateRetention — alquileres", () => {
  it("inscripto: 6% on excedente over $30.000", () => {
    // pago $50.000 → excedente $20.000 → ret 6% = $1.200 = 120.000 centavos
    const r = calculateRetention({
      category: "alquileres",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 5_000_000,
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(120_000);
  });
});

describe("calculateRetention — exento", () => {
  it("retains 0 regardless of amount", () => {
    const r = calculateRetention({
      category: "servicios",
      status: "exento",
      supplierCuit: cuit,
      paymentCentavos: 100_000_000_000, // huge amount
      paymentDate: date,
    });
    expect(r.retentionAmountCentavos).toBe(0);
    expect(r.waiverReason).toBe("exento_certificate");
  });
});

describe("calculateRetention — validation", () => {
  it("rejects negative payment", () => {
    expect(() =>
      calculateRetention({
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: -1,
        paymentDate: date,
      }),
    ).toThrow(SicoreValidationError);
  });

  it("rejects malformed CUIT", () => {
    expect(() =>
      calculateRetention({
        category: "servicios",
        status: "inscripto",
        supplierCuit: "abc",
        paymentCentavos: 1_000_000,
        paymentDate: date,
      }),
    ).toThrow(SicoreValidationError);
  });

  it("rejects malformed paymentDate", () => {
    expect(() =>
      calculateRetention({
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: 1_000_000,
        paymentDate: "2026/01/15",
      }),
    ).toThrow(SicoreValidationError);
  });

  it("rejects rate-table missing the category/status pair", () => {
    const input: RetentionInput = {
      category: "servicios",
      status: "inscripto",
      supplierCuit: cuit,
      paymentCentavos: 1_000_000,
      paymentDate: date,
      rateTable: [],
    };
    expect(() => calculateRetention(input)).toThrow(SicoreRateNotFoundError);
  });

  it("accepts CUIT with hyphens and normalizes", () => {
    const r = calculateRetention({
      category: "servicios",
      status: "no_inscripto",
      supplierCuit: "20-11111111-0",
      paymentCentavos: 1_000_000,
      paymentDate: date,
    });
    expect(r.supplierCuit).toBe("20111111110");
  });
});

describe("calculateRetentionStream", () => {
  it("returns an empty array for no payments", () => {
    expect(calculateRetentionStream([])).toEqual([]);
  });

  it("walks 3 payments in date order with accumulator advancing", () => {
    const results = calculateRetentionStream([
      {
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: 3_000_000, // $30k
        paymentDate: "2026-01-10",
      },
      {
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: 3_000_000, // $30k, accumulated $60k (still below)
        paymentDate: "2026-01-15",
      },
      {
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: 3_000_000, // $30k, accumulated $90k → excedente $22.830
        paymentDate: "2026-01-25",
      },
    ]);
    expect(results.length).toBe(3);
    expect(results[0]!.retentionAmountCentavos).toBe(0);
    expect(results[1]!.retentionAmountCentavos).toBe(0);
    // 3rd: excedente = 9_000_000 - 6_717_000 = 2_283_000; ret = round(2_283_000 * 0.02) = 45_660
    expect(results[2]!.retentionAmountCentavos).toBe(45_660);
  });

  it("sorts unordered payments by date", () => {
    const results = calculateRetentionStream([
      {
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: 3_000_000,
        paymentDate: "2026-01-25", // last
      },
      {
        category: "servicios",
        status: "inscripto",
        supplierCuit: cuit,
        paymentCentavos: 3_000_000,
        paymentDate: "2026-01-10", // first
      },
    ]);
    expect(results[0]!.paymentDate).toBe("2026-01-10");
    expect(results[1]!.paymentDate).toBe("2026-01-25");
  });

  it("rejects mixed-supplier streams", () => {
    expect(() =>
      calculateRetentionStream([
        {
          category: "servicios",
          status: "inscripto",
          supplierCuit: "20111111110",
          paymentCentavos: 1_000_000,
          paymentDate: "2026-01-10",
        },
        {
          category: "servicios",
          status: "inscripto",
          supplierCuit: "20999999990",
          paymentCentavos: 1_000_000,
          paymentDate: "2026-01-15",
        },
      ]),
    ).toThrow(SicoreValidationError);
  });

  it("rejects mixed-month streams", () => {
    expect(() =>
      calculateRetentionStream([
        {
          category: "servicios",
          status: "inscripto",
          supplierCuit: cuit,
          paymentCentavos: 1_000_000,
          paymentDate: "2026-01-10",
        },
        {
          category: "servicios",
          status: "inscripto",
          supplierCuit: cuit,
          paymentCentavos: 1_000_000,
          paymentDate: "2026-02-10",
        },
      ]),
    ).toThrow(SicoreValidationError);
  });
});

describe("buildSicoreDdjj", () => {
  it("aggregates by category + supplier with correct totals", () => {
    const r1 = calculateRetention({
      category: "servicios",
      status: "no_inscripto",
      supplierCuit: cuit,
      paymentCentavos: 1_000_000,
      paymentDate: date,
    });
    const r2 = calculateRetention({
      category: "bienes",
      status: "no_inscripto",
      supplierCuit: "20999999990",
      paymentCentavos: 10_000_000,
      paymentDate: date,
    });
    const ddjj = buildSicoreDdjj({
      period: "2026-01",
      agentCuit: "20123456786",
      entries: [asEntry("FA-001", r1), asEntry("FA-002", r2)],
    });
    expect(ddjj.totals.paymentCentavos).toBe(11_000_000);
    expect(ddjj.totals.retentionCentavos).toBe(280_000 + 1_000_000);
    expect(ddjj.totals.entryCount).toBe(2);
    expect(ddjj.byCategory.length).toBe(2);
    expect(ddjj.bySupplier.length).toBe(2);
    // bySupplier sorted descending by retention amount
    expect(ddjj.bySupplier[0]!.supplierCuit).toBe("20999999990");
  });

  it("rejects malformed period", () => {
    expect(() =>
      buildSicoreDdjj({
        period: "2026/01",
        agentCuit: "20123456786",
        entries: [],
      }),
    ).toThrow(SicoreValidationError);
  });
});

describe("quickRetention helper", () => {
  it("returns just the retention amount for a single call", () => {
    const amount = quickRetention("servicios", "no_inscripto", 1_000_000);
    expect(amount).toBe(280_000);
  });
});
