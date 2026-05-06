import { describe, expect, it } from "vitest";
import {
  listBanks,
  listPsps,
  lookupBankByCode,
  lookupCvuByPrefix,
} from "../src/banks";

describe("lookupBankByCode", () => {
  it("returns Banco Galicia for code 007", () => {
    const bank = lookupBankByCode("007");
    expect(bank).not.toBeNull();
    expect(bank?.shortName).toBe("Banco Galicia");
    expect(bank?.kind).toBe("cbu");
  });

  it("returns Banco Nación for code 011", () => {
    const bank = lookupBankByCode("011");
    expect(bank?.shortName).toBe("Banco Nación");
  });

  it("returns null for unknown code", () => {
    expect(lookupBankByCode("999")).toBeNull();
  });

  it("returns null for empty code", () => {
    expect(lookupBankByCode("")).toBeNull();
  });
});

describe("lookupCvuByPrefix", () => {
  it("returns Mercado Pago for prefix 0000031", () => {
    const psp = lookupCvuByPrefix("0000031");
    expect(psp).not.toBeNull();
    expect(psp?.shortName).toBe("Mercado Pago");
    expect(psp?.kind).toBe("cvu");
  });

  it("returns Ualá for prefix 0000007", () => {
    const psp = lookupCvuByPrefix("0000007");
    expect(psp?.shortName).toBe("Ualá");
  });

  it("returns null for unknown prefix", () => {
    expect(lookupCvuByPrefix("0009999")).toBeNull();
  });
});

describe("listBanks", () => {
  it("returns a sorted, non-empty list", () => {
    const banks = listBanks();
    expect(banks.length).toBeGreaterThan(20);
    expect(banks[0]!.code.localeCompare(banks[1]!.code)).toBeLessThanOrEqual(0);
  });

  it("includes the major AR banks", () => {
    const codes = listBanks().map((b) => b.code);
    expect(codes).toContain("007"); // Galicia
    expect(codes).toContain("011"); // Nación
    expect(codes).toContain("072"); // Santander
    expect(codes).toContain("285"); // Macro
  });
});

describe("listPsps", () => {
  it("returns a non-empty list of PSPs", () => {
    const psps = listPsps();
    expect(psps.length).toBeGreaterThan(2);
  });

  it("includes Mercado Pago and Ualá", () => {
    const names = listPsps().map((p) => p.shortName);
    expect(names).toContain("Mercado Pago");
    expect(names).toContain("Ualá");
  });

  it("all PSPs are kind=cvu", () => {
    expect(listPsps().every((p) => p.kind === "cvu")).toBe(true);
  });
});
