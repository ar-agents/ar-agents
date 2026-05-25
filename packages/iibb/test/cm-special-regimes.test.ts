import { describe, expect, it } from "vitest";
import {
  computeDdjj,
  RateBook,
  IibbValidationError,
  IibbRateNotFoundError,
  type Alicuota,
  type IngresoLine,
} from "../src";

const RATES: Alicuota[] = [
  { jurisdiction: "CABA", activityCode: "620100", rate: 0.05 },
  { jurisdiction: "BSAS", activityCode: "620100", rate: 0.035 },
  { jurisdiction: "CBA", activityCode: "620100", rate: 0.04 },
  { jurisdiction: "CABA", activityCode: "432110", rate: 0.04 },
  { jurisdiction: "BSAS", activityCode: "432110", rate: 0.035 },
  { jurisdiction: "MZA", activityCode: "432110", rate: 0.03 },
  { jurisdiction: "CABA", activityCode: "492110", rate: 0.03 },
  { jurisdiction: "BSAS", activityCode: "492110", rate: 0.025 },
  { jurisdiction: "MZA", activityCode: "492110", rate: 0.04 },
];
const rateBook = new RateBook(RATES);

// ── Art 6 (Construction) ─────────────────────────────────────────

describe("CM Article 6 — Construction", () => {
  const lines: IngresoLine[] = [
    {
      dateIso: "2026-01-10",
      jurisdiction: "BSAS",
      workJurisdiction: "BSAS",
      activityCode: "432110",
      baseImponibleCentavos: 70_000_000,
    },
    {
      dateIso: "2026-01-20",
      jurisdiction: "MZA",
      workJurisdiction: "MZA",
      activityCode: "432110",
      baseImponibleCentavos: 30_000_000,
    },
  ];

  it("requires seatJurisdiction", () => {
    expect(() =>
      computeDdjj({
        period: "2026-01",
        regime: "cm",
        filerCode: "CM",
        lines,
        rateBook,
        cmArticle: "art_6_construction",
      }),
    ).toThrow(IibbValidationError);
  });

  it("attributes 10% to the seat + 90% prorated to work jurisdictions", () => {
    const r = computeDdjj({
      period: "2026-01",
      regime: "cm",
      filerCode: "CM",
      lines,
      rateBook,
      cmArticle: "art_6_construction",
      seatJurisdiction: "CABA",
    });
    expect(r.totals.baseCentavos).toBe(100_000_000);
    const seat = r.byJurisdiction.find((j) => j.jurisdiction === "CABA");
    expect(seat?.totalBaseCentavos).toBe(10_000_000); // 10% of 100M
    const bsas = r.byJurisdiction.find((j) => j.jurisdiction === "BSAS");
    expect(bsas?.totalBaseCentavos).toBe(63_000_000); // 70% of remaining 90M
    const mza = r.byJurisdiction.find((j) => j.jurisdiction === "MZA");
    expect(mza?.totalBaseCentavos).toBe(27_000_000); // 30% of 90M
  });

  it("falls back to line.jurisdiction when workJurisdiction is absent", () => {
    const r = computeDdjj({
      period: "2026-01",
      regime: "cm",
      filerCode: "CM",
      lines: lines.map((l) => ({ ...l, workJurisdiction: undefined })),
      rateBook,
      cmArticle: "art_6_construction",
      seatJurisdiction: "CABA",
    });
    const bsas = r.byJurisdiction.find((j) => j.jurisdiction === "BSAS");
    expect(bsas?.totalBaseCentavos).toBe(63_000_000);
  });
});

// ── Art 8 (Transport) ────────────────────────────────────────────

describe("CM Article 8 — Transport", () => {
  it("attributes 100% to origin jurisdiction (no seat component)", () => {
    const lines: IngresoLine[] = [
      // Trip from BSAS to CABA, billed in CABA, but origin determines split
      {
        dateIso: "2026-01-10",
        jurisdiction: "CABA",
        originJurisdiction: "BSAS",
        activityCode: "492110",
        baseImponibleCentavos: 50_000_000,
      },
      // Trip originating MZA → CABA
      {
        dateIso: "2026-01-15",
        jurisdiction: "CABA",
        originJurisdiction: "MZA",
        activityCode: "492110",
        baseImponibleCentavos: 30_000_000,
      },
    ];
    const r = computeDdjj({
      period: "2026-01",
      regime: "cm",
      filerCode: "CM",
      lines,
      rateBook,
      cmArticle: "art_8_transport",
    });
    expect(r.totals.baseCentavos).toBe(80_000_000);
    const bsas = r.byJurisdiction.find((j) => j.jurisdiction === "BSAS");
    expect(bsas?.totalBaseCentavos).toBe(50_000_000);
    expect(bsas?.taxDueCentavos).toBe(1_250_000); // 50M × 2.5%
    const mza = r.byJurisdiction.find((j) => j.jurisdiction === "MZA");
    expect(mza?.totalBaseCentavos).toBe(30_000_000);
    expect(mza?.taxDueCentavos).toBe(1_200_000); // 30M × 4%
    const caba = r.byJurisdiction.find((j) => j.jurisdiction === "CABA");
    expect(caba).toBeUndefined(); // no income attributed to billing jurisdiction
  });

  it("falls back to line.jurisdiction when originJurisdiction is absent", () => {
    const lines: IngresoLine[] = [
      {
        dateIso: "2026-01-10",
        jurisdiction: "BSAS",
        activityCode: "492110",
        baseImponibleCentavos: 50_000_000,
      },
    ];
    const r = computeDdjj({
      period: "2026-01",
      regime: "cm",
      filerCode: "CM",
      lines,
      rateBook,
      cmArticle: "art_8_transport",
    });
    expect(r.byJurisdiction[0]?.jurisdiction).toBe("BSAS");
  });
});

// ── Art 9 (Professional services) ────────────────────────────────

describe("CM Article 9 — Professional services", () => {
  const lines: IngresoLine[] = [
    {
      dateIso: "2026-01-10",
      jurisdiction: "BSAS",
      activityCode: "620100",
      baseImponibleCentavos: 60_000_000,
    },
    {
      dateIso: "2026-01-20",
      jurisdiction: "CBA",
      activityCode: "620100",
      baseImponibleCentavos: 40_000_000,
    },
  ];

  it("requires seatJurisdiction", () => {
    expect(() =>
      computeDdjj({
        period: "2026-01",
        regime: "cm",
        filerCode: "CM",
        lines,
        rateBook,
        cmArticle: "art_9_professional_services",
      }),
    ).toThrow(IibbValidationError);
  });

  it("attributes 20% to seat + 80% prorated by realized income", () => {
    const r = computeDdjj({
      period: "2026-01",
      regime: "cm",
      filerCode: "CM",
      lines,
      rateBook,
      cmArticle: "art_9_professional_services",
      seatJurisdiction: "CABA",
    });
    expect(r.totals.baseCentavos).toBe(100_000_000);
    const seat = r.byJurisdiction.find((j) => j.jurisdiction === "CABA");
    expect(seat?.totalBaseCentavos).toBe(20_000_000); // 20% seat slice
    const bsas = r.byJurisdiction.find((j) => j.jurisdiction === "BSAS");
    expect(bsas?.totalBaseCentavos).toBe(48_000_000); // 60% of remaining 80M
    const cba = r.byJurisdiction.find((j) => j.jurisdiction === "CBA");
    expect(cba?.totalBaseCentavos).toBe(32_000_000); // 40% of 80M
  });
});

// ── Stubbed articles surface a clear error ───────────────────────

describe("Unimplemented CM articles", () => {
  const lines: IngresoLine[] = [
    {
      dateIso: "2026-01-10",
      jurisdiction: "CABA",
      activityCode: "620100",
      baseImponibleCentavos: 10_000_000,
    },
  ];
  const cases: Array<
    | "art_7_insurance"
    | "art_10_intermediaries"
    | "art_11_grain"
    | "art_12_finance"
    | "art_13_agro_industrial"
  > = [
    "art_7_insurance",
    "art_10_intermediaries",
    "art_11_grain",
    "art_12_finance",
    "art_13_agro_industrial",
  ];
  for (const cm of cases) {
    it(`throws an actionable validation error for ${cm}`, () => {
      expect(() =>
        computeDdjj({
          period: "2026-01",
          regime: "cm",
          filerCode: "CM",
          lines,
          rateBook,
          cmArticle: cm,
          seatJurisdiction: "CABA",
        }),
      ).toThrow(IibbValidationError);
    });
  }
});

describe("Missing rate-book entries surface IibbRateNotFoundError", () => {
  it("art_6 throws when work jurisdiction has no rate for the activity", () => {
    const lines: IngresoLine[] = [
      {
        dateIso: "2026-01-10",
        jurisdiction: "ER",
        workJurisdiction: "ER",
        activityCode: "432110",
        baseImponibleCentavos: 10_000_000,
      },
    ];
    expect(() =>
      computeDdjj({
        period: "2026-01",
        regime: "cm",
        filerCode: "CM",
        lines,
        rateBook,
        cmArticle: "art_6_construction",
        seatJurisdiction: "CABA",
      }),
    ).toThrow(IibbRateNotFoundError);
  });
});
