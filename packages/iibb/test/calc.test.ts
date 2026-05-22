import { describe, it, expect } from "vitest";
import {
  RateBook,
  computeDdjj,
  calculateRetention,
  calculatePerception,
  IibbValidationError,
  IibbRateNotFoundError,
  UnconfiguredIibbAdapter,
  AgipAdapter,
  IibbUnconfiguredError,
  iibbTools,
  ALL_TOOL_NAMES,
  AUTHORITY_BY_JURISDICTION,
} from "../src/index";

describe("RateBook", () => {
  it("looks up an exact (jurisdiction, activityCode) match", () => {
    const book = new RateBook([
      { jurisdiction: "CABA", activityCode: "620100", rate: 0.05 },
      { jurisdiction: "BSAS", activityCode: "620100", rate: 0.045 },
    ]);
    expect(book.lookup("CABA", "620100")?.rate).toBe(0.05);
    expect(book.lookup("BSAS", "620100")?.rate).toBe(0.045);
    expect(book.lookup("CABA", "unknown")).toBeNull();
  });
});

describe("computeDdjj (local regime)", () => {
  const rateBook = new RateBook([
    { jurisdiction: "CABA", activityCode: "620100", rate: 0.05 },
  ]);

  it("computes total tax = sum(base × rate) for a single-jurisdiction filer", () => {
    const result = computeDdjj({
      period: "2026-05",
      regime: "local",
      filerCode: "CABA",
      rateBook,
      lines: [
        {
          dateIso: "2026-05-05",
          jurisdiction: "CABA",
          activityCode: "620100",
          baseImponibleCentavos: 1_000_000, // ARS 10.000
        },
        {
          dateIso: "2026-05-20",
          jurisdiction: "CABA",
          activityCode: "620100",
          baseImponibleCentavos: 500_000, // ARS 5.000
        },
      ],
    });
    expect(result.totals.baseCentavos).toBe(1_500_000);
    expect(result.totals.taxDueCentavos).toBe(75_000); // 5% of 15.000 = 750
    expect(result.byJurisdiction[0]?.weightedAlicuota).toBeCloseTo(0.05, 6);
    expect(result.byJurisdiction[0]?.authority).toBe("AGIP");
  });

  it("rejects lines that escape the filer jurisdiction in local regime", () => {
    expect(() =>
      computeDdjj({
        period: "2026-05",
        regime: "local",
        filerCode: "CABA",
        rateBook,
        lines: [
          {
            dateIso: "2026-05-05",
            jurisdiction: "BSAS", // mismatch
            activityCode: "620100",
            baseImponibleCentavos: 100_000,
          },
        ],
      }),
    ).toThrow(IibbValidationError);
  });

  it("rejects period that is not YYYY-MM", () => {
    expect(() =>
      computeDdjj({
        period: "May 2026",
        regime: "local",
        filerCode: "CABA",
        rateBook,
        lines: [],
      }),
    ).toThrow(IibbValidationError);
  });

  it("throws IibbRateNotFoundError when an activity is missing", () => {
    expect(() =>
      computeDdjj({
        period: "2026-05",
        regime: "local",
        filerCode: "CABA",
        rateBook,
        lines: [
          {
            dateIso: "2026-05-05",
            jurisdiction: "CABA",
            activityCode: "unknown",
            baseImponibleCentavos: 100_000,
          },
        ],
      }),
    ).toThrow(IibbRateNotFoundError);
  });
});

describe("computeDdjj (CM regime, Article 2 general)", () => {
  const rateBook = new RateBook([
    { jurisdiction: "CABA", activityCode: "620100", rate: 0.05 },
    { jurisdiction: "BSAS", activityCode: "620100", rate: 0.045 },
  ]);

  it("apportions the total base by cmCoefficients and applies each jurisdiction's rate", () => {
    const result = computeDdjj({
      period: "2026-05",
      regime: "cm",
      filerCode: "CM",
      rateBook,
      cmCoefficients: { CABA: 0.6, BSAS: 0.4 },
      lines: [
        {
          dateIso: "2026-05-05",
          jurisdiction: "CABA",
          activityCode: "620100",
          baseImponibleCentavos: 1_000_000,
        },
        {
          dateIso: "2026-05-15",
          jurisdiction: "BSAS",
          activityCode: "620100",
          baseImponibleCentavos: 1_000_000,
        },
      ],
    });
    // Total base 2.000.000 cents = ARS 20.000
    // CABA share: 0.6 × 2M = 1.2M cents × 5% = 60.000 cents
    // BSAS share: 0.4 × 2M = 800k cents × 4.5% = 36.000 cents
    expect(result.totals.baseCentavos).toBe(2_000_000);
    expect(result.totals.taxDueCentavos).toBe(96_000);
    const caba = result.byJurisdiction.find((j) => j.jurisdiction === "CABA");
    const bsas = result.byJurisdiction.find((j) => j.jurisdiction === "BSAS");
    expect(caba?.totalBaseCentavos).toBe(1_200_000);
    expect(caba?.taxDueCentavos).toBe(60_000);
    expect(bsas?.totalBaseCentavos).toBe(800_000);
    expect(bsas?.taxDueCentavos).toBe(36_000);
    expect(result.cmCoefficients).toEqual({ CABA: 0.6, BSAS: 0.4 });
  });

  it("rejects CM coefficients that do not sum to 1.0", () => {
    expect(() =>
      computeDdjj({
        period: "2026-05",
        regime: "cm",
        filerCode: "CM",
        rateBook,
        cmCoefficients: { CABA: 0.5, BSAS: 0.3 }, // 0.8
        lines: [
          {
            dateIso: "2026-05-05",
            jurisdiction: "CABA",
            activityCode: "620100",
            baseImponibleCentavos: 100_000,
          },
        ],
      }),
    ).toThrow(IibbValidationError);
  });

  it("requires cmCoefficients when regime='cm'", () => {
    expect(() =>
      computeDdjj({
        period: "2026-05",
        regime: "cm",
        filerCode: "CM",
        rateBook,
        lines: [
          {
            dateIso: "2026-05-05",
            jurisdiction: "CABA",
            activityCode: "620100",
            baseImponibleCentavos: 100_000,
          },
        ],
      }),
    ).toThrow(IibbValidationError);
  });
});

describe("calculateRetention / calculatePerception", () => {
  it("returns base × rate when no threshold or threshold is met", () => {
    const r = calculateRetention({
      jurisdiction: "CABA",
      activityCode: "620100",
      baseCentavos: 100_000,
      overrideRate: 0.025,
    });
    expect(r.amountCentavos).toBe(2_500); // 2.5% of 100.000 cents = 2.500 cents
    expect(r.belowThreshold).toBe(false);
  });

  it("returns 0 + belowThreshold=true when base is below the minimum", () => {
    const r = calculateRetention({
      jurisdiction: "CABA",
      activityCode: "620100",
      baseCentavos: 10_000,
      overrideRate: 0.025,
      minimumThresholdCentavos: 50_000,
    });
    expect(r.amountCentavos).toBe(0);
    expect(r.belowThreshold).toBe(true);
  });

  it("rejects negative base and out-of-range rate", () => {
    expect(() =>
      calculateRetention({
        jurisdiction: "CABA",
        activityCode: "620100",
        baseCentavos: -1,
        overrideRate: 0.025,
      }),
    ).toThrow(IibbValidationError);

    expect(() =>
      calculateRetention({
        jurisdiction: "CABA",
        activityCode: "620100",
        baseCentavos: 100_000,
        overrideRate: 1.5,
      }),
    ).toThrow(IibbValidationError);
  });

  it("perception mirrors retention in v0.1", () => {
    expect(
      calculatePerception({
        jurisdiction: "CABA",
        activityCode: "620100",
        baseCentavos: 100_000,
        overrideRate: 0.025,
      }).amountCentavos,
    ).toBe(2_500);
  });
});

describe("adapters", () => {
  it("UnconfiguredIibbAdapter and AgipAdapter both throw IibbUnconfiguredError", async () => {
    await expect(
      new UnconfiguredIibbAdapter("CABA").lookupPadron("20123456789"),
    ).rejects.toBeInstanceOf(IibbUnconfiguredError);
    await expect(new AgipAdapter().lookupPadron("20123456789")).rejects.toBeInstanceOf(
      IibbUnconfiguredError,
    );
  });
});

describe("iibbTools(opts) factory", () => {
  it("exposes all 4 tools by default", () => {
    const t = iibbTools();
    expect(Object.keys(t).sort()).toEqual([...ALL_TOOL_NAMES].sort());
  });

  it("honors `include` filter", () => {
    const t = iibbTools({ include: ["iibb_calculate_retention"] });
    expect(Object.keys(t)).toEqual(["iibb_calculate_retention"]);
  });
});

describe("AUTHORITY_BY_JURISDICTION", () => {
  it("maps CABA→AGIP, BSAS→ARBA, CM→COMARB", () => {
    expect(AUTHORITY_BY_JURISDICTION.CABA).toBe("AGIP");
    expect(AUTHORITY_BY_JURISDICTION.BSAS).toBe("ARBA");
    expect(AUTHORITY_BY_JURISDICTION.CM).toBe("COMARB");
  });
});
