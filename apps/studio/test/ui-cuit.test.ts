import { describe, expect, it } from "vitest";
import {
  formatCuit,
  isCuitFormatValid,
  isValidCuit,
  normalizeCuit,
} from "../src/lib/ui/cuit";

// Fictional CUITs only (mod-11 valid, no real PII), per project convention.
const VALID_CUITS = [
  "20-12345678-6",
  "30-71000000-6",
  "27-98765432-0",
  "20-00000001-9",
  "27-12345678-0",
];

describe("normalizeCuit", () => {
  it("strips separators, keeping only digits", () => {
    expect(normalizeCuit("20-12345678-6")).toBe("20123456786");
    expect(normalizeCuit("20.123.456.78-6")).toBe("20123456786");
    expect(normalizeCuit("  20 12345678 6  ")).toBe("20123456786");
  });
});

describe("isCuitFormatValid", () => {
  it("accepts exactly 11 digits after normalizing", () => {
    expect(isCuitFormatValid("20-12345678-6")).toBe(true);
  });

  it("rejects too few or too many digits", () => {
    expect(isCuitFormatValid("123")).toBe(false);
    expect(isCuitFormatValid("201234567890")).toBe(false);
  });
});

describe("isValidCuit", () => {
  it.each(VALID_CUITS)("accepts the fictional valid CUIT %s", (cuit) => {
    expect(isValidCuit(cuit)).toBe(true);
  });

  it("rejects a CUIT with a wrong check digit", () => {
    expect(isValidCuit("20-12345678-0")).toBe(false);
  });

  it("rejects malformed input (wrong length, letters, empty)", () => {
    expect(isValidCuit("20-1234-6")).toBe(false);
    expect(isValidCuit("2A123456786")).toBe(false);
    expect(isValidCuit("")).toBe(false);
  });

  it("validates regardless of separator style", () => {
    expect(isValidCuit("20123456786")).toBe(true);
    expect(isValidCuit("20.12345678.6")).toBe(true);
  });
});

describe("formatCuit", () => {
  it("formats 11 raw digits as XX-XXXXXXXX-X", () => {
    expect(formatCuit("20123456786")).toBe("20-12345678-6");
  });

  it("returns the input unchanged when not exactly 11 digits", () => {
    expect(formatCuit("123")).toBe("123");
  });
});
