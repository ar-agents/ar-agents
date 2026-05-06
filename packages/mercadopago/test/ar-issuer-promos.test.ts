import { describe, expect, it } from "vitest";
import {
  AHORA_PROGRAM_PROMOS,
  AR_ISSUER_PROMOS,
  findApplicablePromos,
} from "../src/ar-issuer-promos";

describe("AR_ISSUER_PROMOS catalog", () => {
  it("includes Galicia + Naranja + Santander + Macro + BBVA + ICBC", () => {
    const issuers = new Set(AR_ISSUER_PROMOS.map((p) => p.issuer));
    expect(issuers.has("Banco Galicia")).toBe(true);
    expect(issuers.has("Naranja X")).toBe(true);
    expect(issuers.has("Banco Santander")).toBe(true);
    expect(issuers.has("Banco Macro")).toBe(true);
    expect(issuers.has("BBVA Banco Francés")).toBe(true);
    expect(issuers.has("ICBC")).toBe(true);
  });

  it("AHORA program covers 3, 6, 12, 18, 24 cuotas", () => {
    const installments = new Set(AHORA_PROGRAM_PROMOS.map((p) => p.installments));
    [3, 6, 12, 18, 24].forEach((n) => expect(installments.has(n)).toBe(true));
  });
});

describe("findApplicablePromos", () => {
  it("filters by issuer", () => {
    const promos = findApplicablePromos({ issuer: "Banco Galicia" });
    // All non-program promos must be Galicia OR have wildcard issuer
    expect(promos.every((p) => p.issuer === "Banco Galicia" || p.issuer === "*")).toBe(true);
  });

  it("filters by paymentMethodId", () => {
    const promos = findApplicablePromos({ paymentMethodId: "naranja" });
    expect(promos.every((p) => p.paymentMethodId === "naranja" || p.paymentMethodId === "*")).toBe(true);
  });

  it("filters by day of week", () => {
    // Thursday: 2026-05-07
    const date = new Date("2026-05-07T12:00:00Z");
    const promos = findApplicablePromos({
      issuer: "Banco Galicia",
      paymentMethodId: "visa",
      date,
    });
    // Should include the Galicia "12 cuotas en supermercados los jueves"
    expect(promos.some((p) => p.installments === 12 && p.description.includes("supermercados"))).toBe(true);
  });

  it("excludes promos outside their day of week", () => {
    // Wednesday: 2026-05-06
    const date = new Date("2026-05-06T12:00:00Z");
    const promos = findApplicablePromos({
      issuer: "Banco Galicia",
      paymentMethodId: "visa",
      category: "supermarket",
      date,
    });
    // The Thursday-only promo shouldn't appear
    const galiciaSupermarket = promos.filter(
      (p) => p.issuer === "Banco Galicia" && p.daysOfWeek?.includes("thu"),
    );
    expect(galiciaSupermarket.length).toBe(0);
  });

  it("includes Ahora program by default; can be excluded", () => {
    const withAhora = findApplicablePromos({ category: "appliances" });
    const withoutAhora = findApplicablePromos({
      category: "appliances",
      includeAhoraProgram: false,
    });
    expect(withAhora.length).toBeGreaterThan(withoutAhora.length);
    expect(withoutAhora.every((p) => p.issuer !== "*")).toBe(true);
  });
});
