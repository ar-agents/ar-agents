import { describe, expect, it } from "vitest";
import {
  computeBlockCheckDigit,
  isValidCbu,
  normalizeCbu,
  parseCbu,
} from "../src/cbu";
import {
  EMPTY_CBU,
  INVALID_GALICIA_BLOCK1,
  INVALID_GALICIA_BLOCK2,
  LONG_CBU,
  SHORT_CBU,
  UNKNOWN_PSP_CVU,
  VALID_GALICIA_CBU,
  VALID_MERCADOPAGO_CVU,
  VALID_NACION_CBU,
} from "./fixtures/cbus";

describe("normalizeCbu", () => {
  it("strips hyphens, spaces, and dots", () => {
    expect(normalizeCbu("0070123-145678901234564")).toBe(VALID_GALICIA_CBU);
    expect(normalizeCbu("0070123 14567 8901234 564")).toBe(VALID_GALICIA_CBU);
    expect(normalizeCbu("0070123.145678901234564")).toBe(VALID_GALICIA_CBU);
  });

  it("returns empty string for empty input", () => {
    expect(normalizeCbu("")).toBe("");
  });
});

describe("computeBlockCheckDigit", () => {
  it("computes block-1 check digit correctly", () => {
    // For "0070123" → expected 1
    const result = computeBlockCheckDigit("0070123", [7, 1, 3, 9, 7, 1, 3]);
    expect(result).toBe(1);
  });

  it("computes block-2 check digit correctly", () => {
    // For "4567890123456" → expected 4
    const result = computeBlockCheckDigit(
      "4567890123456",
      [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3],
    );
    expect(result).toBe(4);
  });

  it("returns null when length doesn't match weights", () => {
    expect(computeBlockCheckDigit("12", [7, 1, 3])).toBeNull();
  });

  it("returns null when input has non-digits", () => {
    expect(computeBlockCheckDigit("abc1234", [7, 1, 3, 9, 7, 1, 3])).toBeNull();
  });
});

describe("parseCbu — valid CBUs", () => {
  it("parses a valid Banco Galicia CBU and identifies the bank", () => {
    const result = parseCbu(VALID_GALICIA_CBU);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(VALID_GALICIA_CBU);
    expect(result.entityCode).toBe("007");
    expect(result.branchCode).toBe("0123");
    expect(result.accountNumber).toBe("4567890123456");
    expect(result.kind).toBe("cbu");
    expect(result.bank?.name).toContain("Galicia");
    expect(result.error).toBeNull();
  });

  it("parses a valid Banco Nación CBU", () => {
    const result = parseCbu(VALID_NACION_CBU);
    expect(result.valid).toBe(true);
    expect(result.entityCode).toBe("011");
    expect(result.kind).toBe("cbu");
    expect(result.bank?.shortName).toBe("Banco Nación");
  });

  it("parses a valid Mercado Pago CVU and identifies it as a CVU", () => {
    const result = parseCbu(VALID_MERCADOPAGO_CVU);
    expect(result.valid).toBe(true);
    expect(result.entityCode).toBe("000");
    expect(result.kind).toBe("cvu");
    expect(result.bank?.shortName).toBe("Mercado Pago");
  });

  it("identifies an unknown PSP CVU as kind=cvu but bank=null", () => {
    const result = parseCbu(UNKNOWN_PSP_CVU);
    expect(result.valid).toBe(true);
    expect(result.entityCode).toBe("000");
    expect(result.kind).toBe("cvu");
    expect(result.bank).toBeNull();
  });

  it("normalizes input with separators before validating", () => {
    const formatted = "00701231-45678901234564";
    const result = parseCbu(formatted);
    expect(result.valid).toBe(true);
    expect(result.normalized).toBe(VALID_GALICIA_CBU);
  });
});

describe("parseCbu — invalid CBUs", () => {
  it("rejects empty input with a Spanish error", () => {
    const result = parseCbu(EMPTY_CBU);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/vacío/i);
  });

  it("rejects too-short input with the actual length", () => {
    const result = parseCbu(SHORT_CBU);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("5");
  });

  it("rejects too-long input with the actual length", () => {
    const result = parseCbu(LONG_CBU);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("23");
  });

  it("rejects bad block-1 check digit and explains why", () => {
    const result = parseCbu(INVALID_GALICIA_BLOCK1);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/[Bb]loque 1/);
    expect(result.error).toMatch(/[Ee]sperado: 1/);
  });

  it("rejects bad block-2 check digit and explains why", () => {
    const result = parseCbu(INVALID_GALICIA_BLOCK2);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/[Bb]loque 2/);
    expect(result.error).toMatch(/[Ee]sperado: 4/);
  });

  it("still surfaces the bank info on invalid CBUs (helpful for debugging)", () => {
    const result = parseCbu(INVALID_GALICIA_BLOCK1);
    expect(result.bank?.shortName).toBe("Banco Galicia");
    expect(result.entityCode).toBe("007");
  });
});

describe("isValidCbu", () => {
  it("returns true for valid CBUs", () => {
    expect(isValidCbu(VALID_GALICIA_CBU)).toBe(true);
    expect(isValidCbu(VALID_NACION_CBU)).toBe(true);
    expect(isValidCbu(VALID_MERCADOPAGO_CVU)).toBe(true);
  });

  it("returns false for invalid CBUs", () => {
    expect(isValidCbu(INVALID_GALICIA_BLOCK1)).toBe(false);
    expect(isValidCbu(INVALID_GALICIA_BLOCK2)).toBe(false);
    expect(isValidCbu(SHORT_CBU)).toBe(false);
    expect(isValidCbu(EMPTY_CBU)).toBe(false);
  });
});
