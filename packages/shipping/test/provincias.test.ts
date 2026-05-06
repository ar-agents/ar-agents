import { describe, expect, it } from "vitest";
import { isValidCPA, lookupProvincia, PROVINCIAS } from "../src/provincias";

describe("PROVINCIAS", () => {
  it("includes the 23 provincias + CABA", () => {
    expect(PROVINCIAS).toHaveLength(24);
  });

  it("CABA has iso=C and afipCode=0", () => {
    const caba = PROVINCIAS.find((p) => p.iso === "C")!;
    expect(caba.afipCode).toBe(0);
    expect(caba.aliases).toContain("CABA");
  });

  it("Buenos Aires has iso=B and afipCode=1", () => {
    const ba = PROVINCIAS.find((p) => p.iso === "B")!;
    expect(ba.afipCode).toBe(1);
  });
});

describe("lookupProvincia", () => {
  it("looks up by ISO code (1 char)", () => {
    expect(lookupProvincia("C")?.name).toContain("Buenos Aires");
    expect(lookupProvincia("X")?.name).toBe("Córdoba");
  });

  it("looks up by AFIP numeric code", () => {
    expect(lookupProvincia(1)?.iso).toBe("B");
    expect(lookupProvincia(8)?.name).toBe("La Pampa");
  });

  it("looks up by full name (accent-insensitive)", () => {
    expect(lookupProvincia("córdoba")?.iso).toBe("X");
    expect(lookupProvincia("CORDOBA")?.iso).toBe("X");
    expect(lookupProvincia("Tierra del Fuego")?.iso).toBe("V");
  });

  it("looks up by alias", () => {
    expect(lookupProvincia("CABA")?.iso).toBe("C");
    expect(lookupProvincia("PBA")?.iso).toBe("B");
    expect(lookupProvincia("TDF")?.iso).toBe("V");
  });

  it("returns null for unknown input", () => {
    expect(lookupProvincia("Pampero del Norte")).toBeNull();
    expect(lookupProvincia(999)).toBeNull();
  });
});

describe("isValidCPA", () => {
  it("accepts 4-digit legacy CPs >= 1000", () => {
    expect(isValidCPA("1842")).toBe(true);
    expect(isValidCPA("1000")).toBe(true);
    expect(isValidCPA("9999")).toBe(true);
  });

  it("rejects 4-digit CPs < 1000", () => {
    expect(isValidCPA("0999")).toBe(false);
    expect(isValidCPA("0000")).toBe(false);
  });

  it("accepts extended CPA (Letter + 4 digits + 3 letters)", () => {
    expect(isValidCPA("B1842ZAB")).toBe(true);
    expect(isValidCPA("c1414aaa")).toBe(true); // case-insensitive
  });

  it("rejects malformed inputs", () => {
    expect(isValidCPA("12345")).toBe(false);
    expect(isValidCPA("ABC1234")).toBe(false);
    expect(isValidCPA("")).toBe(false);
  });
});
