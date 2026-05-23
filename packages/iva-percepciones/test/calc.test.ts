import { describe, it, expect } from "vitest";
import {
  calculatePerception,
  buildPerceptionDdjj,
  quickPerception,
  asEntry,
  IvaPerceptionValidationError,
  IvaPerceptionRateNotFoundError,
  type PerceptionInput,
} from "../src/index";

const buyerCuit = "20111111110";
const date = "2026-01-15";

describe("calculatePerception — RG 2408 general", () => {
  it("RI: 1.5% sobre el neto", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "responsable_inscripto",
      buyerCuit,
      netCentavos: 10_000_000, // $100k
      operationDate: date,
    });
    expect(r.perceptionCentavos).toBe(150_000); // ARS 1.500
    expect(r.rate).toBe(0.015);
    expect(r.waiverReason).toBeUndefined();
  });

  it("no_categorizado: 3% (tasa agravada)", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "no_categorizado",
      buyerCuit,
      netCentavos: 10_000_000,
      operationDate: date,
    });
    expect(r.perceptionCentavos).toBe(300_000);
    expect(r.rate).toBe(0.03);
  });

  it("monotributista: 0 con waiverReason exempt_buyer-style", () => {
    // monotributista in the default table has rate 0, so the result
    // is rate=0 without an explicit waiverReason — the table itself
    // is the waiver.
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "monotributista",
      buyerCuit,
      netCentavos: 10_000_000,
      operationDate: date,
    });
    expect(r.perceptionCentavos).toBe(0);
    expect(r.rate).toBe(0);
  });

  it("exento: 0 con waiverReason exempt_buyer", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "exento",
      buyerCuit,
      netCentavos: 10_000_000,
      operationDate: date,
    });
    expect(r.perceptionCentavos).toBe(0);
    expect(r.waiverReason).toBe("exempt_buyer");
  });

  it("consumidor_final: 0 con waiverReason consumidor_final", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "consumidor_final",
      buyerCuit,
      netCentavos: 10_000_000,
      operationDate: date,
    });
    expect(r.perceptionCentavos).toBe(0);
    expect(r.waiverReason).toBe("consumidor_final");
  });
});

describe("calculatePerception — certificate of non-perception", () => {
  it("certificate trumps the table rate", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "responsable_inscripto",
      buyerCuit,
      netCentavos: 10_000_000,
      operationDate: date,
      buyerHasNonPerceptionCertificate: true,
    });
    expect(r.perceptionCentavos).toBe(0);
    expect(r.waiverReason).toBe("non_perception_certificate");
  });
});

describe("calculatePerception — mínimo", () => {
  it("below mínimo returns 0 with waiverReason below_minimum", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "responsable_inscripto",
      buyerCuit,
      netCentavos: 5_000, // ARS 50
      operationDate: date,
      rateTable: [
        {
          regime: "rg_2408_general",
          buyerCondition: "responsable_inscripto",
          rate: 0.015,
          minimumNetCentavos: 10_000, // ARS 100
        },
      ],
    });
    expect(r.perceptionCentavos).toBe(0);
    expect(r.waiverReason).toBe("below_minimum");
  });

  it("at the mínimo exactly applies the rate", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "responsable_inscripto",
      buyerCuit,
      netCentavos: 10_000,
      operationDate: date,
      rateTable: [
        {
          regime: "rg_2408_general",
          buyerCondition: "responsable_inscripto",
          rate: 0.015,
          minimumNetCentavos: 10_000,
        },
      ],
    });
    expect(r.perceptionCentavos).toBe(150);
  });
});

describe("calculatePerception — validation", () => {
  it("rejects negative netCentavos", () => {
    expect(() =>
      calculatePerception({
        regime: "rg_2408_general",
        buyerCondition: "responsable_inscripto",
        buyerCuit,
        netCentavos: -1,
        operationDate: date,
      }),
    ).toThrow(IvaPerceptionValidationError);
  });

  it("rejects malformed CUIT", () => {
    expect(() =>
      calculatePerception({
        regime: "rg_2408_general",
        buyerCondition: "responsable_inscripto",
        buyerCuit: "abc",
        netCentavos: 1_000_000,
        operationDate: date,
      }),
    ).toThrow(IvaPerceptionValidationError);
  });

  it("rejects malformed date", () => {
    expect(() =>
      calculatePerception({
        regime: "rg_2408_general",
        buyerCondition: "responsable_inscripto",
        buyerCuit,
        netCentavos: 1_000_000,
        operationDate: "2026/01/15",
      }),
    ).toThrow(IvaPerceptionValidationError);
  });

  it("rejects rate-table missing the regime/condition pair", () => {
    const input: PerceptionInput = {
      regime: "rg_3337_combustibles",
      buyerCondition: "responsable_inscripto",
      buyerCuit,
      netCentavos: 1_000_000,
      operationDate: date,
      rateTable: [],
    };
    expect(() => calculatePerception(input)).toThrow(
      IvaPerceptionRateNotFoundError,
    );
  });

  it("normalizes CUIT with hyphens", () => {
    const r = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "responsable_inscripto",
      buyerCuit: "20-11111111-0",
      netCentavos: 1_000_000,
      operationDate: date,
    });
    expect(r.buyerCuit).toBe("20111111110");
  });
});

describe("buildPerceptionDdjj", () => {
  it("aggregates by regime + buyer", () => {
    const r1 = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "responsable_inscripto",
      buyerCuit,
      netCentavos: 10_000_000,
      operationDate: date,
    });
    const r2 = calculatePerception({
      regime: "rg_2408_general",
      buyerCondition: "no_categorizado",
      buyerCuit: "20999999990",
      netCentavos: 10_000_000,
      operationDate: date,
    });
    const ddjj = buildPerceptionDdjj({
      period: "2026-01",
      agentCuit: "20417581015",
      entries: [asEntry("FA-001", r1), asEntry("FA-002", r2)],
    });
    expect(ddjj.totals.perceptionCentavos).toBe(150_000 + 300_000);
    expect(ddjj.totals.entryCount).toBe(2);
    expect(ddjj.byRegime.length).toBe(1); // both are rg_2408_general
    expect(ddjj.byRegime[0]!.entryCount).toBe(2);
    expect(ddjj.byBuyer.length).toBe(2);
    // bySupplier (byBuyer here) sorted desc by perceptionCentavos
    expect(ddjj.byBuyer[0]!.buyerCuit).toBe("20999999990");
  });

  it("rejects malformed period", () => {
    expect(() =>
      buildPerceptionDdjj({
        period: "2026/01",
        agentCuit: "20417581015",
        entries: [],
      }),
    ).toThrow(IvaPerceptionValidationError);
  });
});

describe("quickPerception", () => {
  it("returns just the perception amount", () => {
    const amt = quickPerception(
      "rg_2408_general",
      "responsable_inscripto",
      10_000_000,
    );
    expect(amt).toBe(150_000);
  });

  it("honors the non-perception certificate flag", () => {
    const amt = quickPerception(
      "rg_2408_general",
      "responsable_inscripto",
      10_000_000,
      { buyerHasNonPerceptionCertificate: true },
    );
    expect(amt).toBe(0);
  });
});
