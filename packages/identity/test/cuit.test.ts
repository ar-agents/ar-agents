import { describe, expect, it } from "vitest";
import {
  computeCheckDigit,
  describePersonType,
  isValidCuit,
  normalizeCuit,
  parseCuit,
} from "../src";

describe("normalizeCuit", () => {
  it.each([
    ["20-12345678-6", "20123456786"],
    ["20.12345678.6", "20123456786"],
    ["20 12345678 6", "20123456786"],
    ["20123456786", "20123456786"],
    ["", ""],
    ["abc", ""],
  ])("normalizes %s → %s", (input, expected) => {
    expect(normalizeCuit(input)).toBe(expected);
  });
});

describe("computeCheckDigit", () => {
  it("computes the AFIP modulo-11 check digit for valid 10-digit inputs", () => {
    expect(computeCheckDigit("2012345678")).toBe(6);
  });

  it("returns 9 when remainder is 1 (special AFIP case)", () => {
    // 30-70750012 has sum 122; 122 mod 11 = 1; check digit = 9 per AFIP spec.
    expect(computeCheckDigit("3070750012")).toBe(9);
  });

  it("returns null for non-numeric input", () => {
    expect(computeCheckDigit("204175810a")).toBeNull();
  });

  it("returns null when input length isn't 10", () => {
    expect(computeCheckDigit("20417581")).toBeNull();
    expect(computeCheckDigit("20123456786")).toBeNull();
  });
});

describe("parseCuit", () => {
  it("returns a fully populated valid result for a known-good CUIT", () => {
    const result = parseCuit("20-12345678-6");
    expect(result).toEqual({
      valid: true,
      normalized: "20123456786",
      formatted: "20-12345678-6",
      prefix: "20",
      body: "12345678",
      checkDigit: "6",
      personType: "fisica_masculina",
      error: null,
    });
  });

  it("infers persona jurídica from prefix 30", () => {
    expect(parseCuit("30-70750012-9").personType).toBe("juridica");
  });

  it("infers persona física femenina from prefix 27", () => {
    const synthetic = "27" + "10000003" + computeCheckDigit("2710000003");
    expect(parseCuit(synthetic).personType).toBe("fisica_femenina");
  });

  it("rejects empty input with a clear Spanish error", () => {
    const result = parseCuit("");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/vacío/i);
  });

  it("rejects wrong-length input with a digit count in the message", () => {
    const result = parseCuit("20417581");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/8/); // mentions actual count
  });

  it("rejects unknown prefix and lists allowed prefixes in the message", () => {
    const result = parseCuit("00-12345678-9");
    expect(result.valid).toBe(false);
    expect(result.personType).toBe("desconocida");
    expect(result.error).toMatch(/20\/23\/24\/27/);
  });

  it("rejects wrong check digit AND tells the user the right one", () => {
    const result = parseCuit("20-12345678-9");
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/Esperado: 6/);
    expect(result.error).toMatch(/recibido: 9/);
  });

  it("normalizes input with separators before validating", () => {
    expect(parseCuit("20.12345678.6").valid).toBe(true);
    expect(parseCuit("20 12345678 6").valid).toBe(true);
  });
});

describe("isValidCuit", () => {
  it("returns just the boolean", () => {
    expect(isValidCuit("20-12345678-6")).toBe(true);
    expect(isValidCuit("20-12345678-9")).toBe(false);
  });
});

describe("describePersonType", () => {
  it("returns Spanish descriptions for all known types", () => {
    expect(describePersonType("fisica_masculina")).toMatch(/masculino/i);
    expect(describePersonType("fisica_femenina")).toMatch(/femenino/i);
    expect(describePersonType("juridica")).toMatch(/jurídica/i);
    expect(describePersonType("desconocida")).toMatch(/desconocido/i);
  });
});
