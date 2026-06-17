import { describe, expect, it } from "vitest";
import { detectAndValidate, validateTaxId } from "../src/tax-id";

describe("validateTaxId — AR DNI", () => {
  it("accepts valid 7-8 digit DNIs", () => {
    expect(validateTaxId("12345678", "DNI").valid).toBe(true);
    expect(validateTaxId("1234567", "DNI").valid).toBe(true);
    expect(validateTaxId("12.345.678", "DNI").valid).toBe(true);
  });

  it("rejects invalid lengths", () => {
    expect(validateTaxId("123456", "DNI").valid).toBe(false);
    expect(validateTaxId("123456789", "DNI").valid).toBe(false);
  });

  it("formats with dots", () => {
    expect(validateTaxId("12345678", "DNI").formatted).toBe("12.345.678");
  });
});

describe("validateTaxId — AR CUIT/CUIL", () => {
  it("accepts a valid CUIT (Naza's: 20-12345678-6)", () => {
    expect(validateTaxId("20-12345678-6", "CUIT").valid).toBe(true);
    expect(validateTaxId("20123456786", "CUIT").valid).toBe(true);
  });

  it("rejects bad checksum", () => {
    expect(validateTaxId("20-12345678-9", "CUIT").valid).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateTaxId("2012345678", "CUIT").valid).toBe(false);
  });

  it("formats as XX-XXXXXXXX-X", () => {
    expect(validateTaxId("20123456786", "CUIT").formatted).toBe("20-12345678-6");
  });
});

describe("validateTaxId — BR CPF", () => {
  it("accepts a valid CPF", () => {
    // 123.456.789-09 — known valid example from Receita Federal
    expect(validateTaxId("123.456.789-09", "CPF").valid).toBe(true);
    expect(validateTaxId("12345678909", "CPF").valid).toBe(true);
  });

  it("rejects all-same-digit CPF (e.g., 11111111111)", () => {
    expect(validateTaxId("11111111111", "CPF").valid).toBe(false);
  });

  it("rejects bad checksum", () => {
    expect(validateTaxId("12345678900", "CPF").valid).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateTaxId("123456789", "CPF").valid).toBe(false);
  });

  it("formats as XXX.XXX.XXX-XX", () => {
    expect(validateTaxId("12345678909", "CPF").formatted).toBe("123.456.789-09");
  });
});

describe("validateTaxId — BR CNPJ", () => {
  it("accepts a valid CNPJ", () => {
    // 11.222.333/0001-81 — known valid example
    expect(validateTaxId("11.222.333/0001-81", "CNPJ").valid).toBe(true);
  });

  it("rejects bad checksum", () => {
    expect(validateTaxId("11222333000180", "CNPJ").valid).toBe(false);
  });
});

describe("validateTaxId — MX RFC", () => {
  it("accepts persona física RFC (4 letters + YYMMDD + 3 alphanum)", () => {
    expect(validateTaxId("VECJ880326XXX", "RFC").valid).toBe(true);
  });

  it("accepts persona moral RFC (3 letters + YYMMDD + 3 alphanum)", () => {
    expect(validateTaxId("ABC890312XYZ", "RFC").valid).toBe(true);
  });

  it("rejects malformed RFCs", () => {
    expect(validateTaxId("12345678", "RFC").valid).toBe(false);
    expect(validateTaxId("ABCDE", "RFC").valid).toBe(false);
  });
});

describe("validateTaxId — CL RUT", () => {
  it("rejects bad checksum", () => {
    expect(validateTaxId("12345678-9", "RUT_CL").valid).toBe(false);
  });

  it("rejects too-short input", () => {
    expect(validateTaxId("1", "RUT_CL").valid).toBe(false);
  });

  it("rejects non-numeric body", () => {
    expect(validateTaxId("ABCDEFGH-5", "RUT_CL").valid).toBe(false);
  });

  it("accepts a self-generated valid RUT", () => {
    // Compute the check digit for body "1" — algorithm:
    // sum = 1*2 = 2; r = 11 - (2 % 11) = 9; expected = "9"
    expect(validateTaxId("1-9", "RUT_CL").valid).toBe(true);
  });
});

describe("validateTaxId — CO NIT", () => {
  it("rejects malformed (no check digit separator)", () => {
    expect(validateTaxId("900123456", "NIT").valid).toBe(false);
  });

  it("rejects bad checksum", () => {
    expect(validateTaxId("900123456-9", "NIT").valid).toBe(false);
  });
});

describe("validateTaxId — UY RUT", () => {
  it("rejects wrong length", () => {
    expect(validateTaxId("21111111111", "RUT_UY").valid).toBe(false); // 11 digits
    expect(validateTaxId("2111111111111", "RUT_UY").valid).toBe(false); // 13 digits
  });

  it("provides Spanish error message", () => {
    expect(validateTaxId("21111", "RUT_UY").error).toContain("12 dígitos");
  });
});

describe("validateTaxId — PE RUC", () => {
  it("rejects invalid prefix (must be 10/15/17/20)", () => {
    expect(validateTaxId("11100070970", "RUC").valid).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(validateTaxId("2010007097", "RUC").valid).toBe(false);
  });

  it("provides Spanish error", () => {
    expect(validateTaxId("11100070970", "RUC").error).toContain("Prefijo");
  });
});

describe("detectAndValidate", () => {
  it("AR detects DNI vs CUIT by length", () => {
    expect(detectAndValidate("12345678", "AR")?.type).toBe("DNI");
    expect(detectAndValidate("20-12345678-6", "AR")?.type).toBe("CUIT");
    expect(detectAndValidate("12345", "AR")).toBeNull();
  });

  it("BR detects CPF vs CNPJ by length", () => {
    expect(detectAndValidate("12345678909", "BR")?.type).toBe("CPF");
    expect(detectAndValidate("11.222.333/0001-81", "BR")?.type).toBe("CNPJ");
  });

  it("Other countries route directly", () => {
    expect(detectAndValidate("VECJ880326XXX", "MX")?.type).toBe("RFC");
    expect(detectAndValidate("12345678-5", "CL")?.type).toBe("RUT_CL");
  });
});
