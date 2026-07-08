import { describe, expect, it } from "vitest";
import { formatArs, formatTokenCount, formatUsd, microUsdToUsd } from "../src/lib/ui/money";

describe("microUsdToUsd", () => {
  it("converts micro-USD to USD", () => {
    expect(microUsdToUsd(1_000_000)).toBe(1);
    expect(microUsdToUsd(500_000)).toBe(0.5);
  });
});

describe("formatUsd", () => {
  it("formats amounts of a cent or more with 2 decimals", () => {
    expect(formatUsd(2_500_000)).toBe("US$ 2.50");
    expect(formatUsd(0)).toBe("US$ 0.00");
  });

  it("keeps 4 decimals for sub-cent amounts instead of rounding to zero", () => {
    expect(formatUsd(3_200)).toBe("US$ 0.0032");
  });
});

describe("formatTokenCount", () => {
  it("adds es-AR thousands separators", () => {
    expect(formatTokenCount(1234567)).toBe("1.234.567");
  });
});

describe("formatArs", () => {
  it("formats a whole-peso amount as ARS currency", () => {
    expect(formatArs(100000)).toContain("100.000");
  });
});
