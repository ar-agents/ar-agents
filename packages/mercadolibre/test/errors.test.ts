import { describe, it, expect } from "vitest";
import { MeliApiError, isMeliError } from "../src";

describe("MeliApiError", () => {
  it("extracts MELI's standard error envelope", () => {
    const err = new MeliApiError(
      "MELI API 429 on GET /items/MLA1",
      429,
      "https://api.mercadolibre.com/items/MLA1",
      {
        error: "rate_limited",
        message: "Too many requests",
        status: 429,
      },
      "req-abc-123",
    );
    expect(err.meliCode).toBe("rate_limited");
    expect(err.meliMessage).toBe("Too many requests");
    expect(err.isRateLimited()).toBe(true);
    expect(err.isForbidden()).toBe(false);
    expect(err.isUnauthorized()).toBe(false);
    expect(err.requestId).toBe("req-abc-123");
  });

  it("isRateLimited fires on 429 even without body", () => {
    const err = new MeliApiError(
      "MELI API 429",
      429,
      "https://api.mercadolibre.com/foo",
      null,
    );
    expect(err.isRateLimited()).toBe(true);
    expect(err.meliCode).toBeNull();
  });

  it("extracts post-purchase variant {error_code, description}", () => {
    const err = new MeliApiError(
      "MELI API 400",
      400,
      "https://api.mercadolibre.com/post-purchase/v1/claims/1/evidences",
      {
        error_code: "evidence_window_closed",
        description: "Cannot upload evidence past the SLA window",
      },
      undefined,
    );
    expect(err.meliCode).toBe("evidence_window_closed");
    expect(err.meliMessage).toContain("evidence past the SLA");
    expect(err.isValidationError()).toBe(true);
  });

  it("extracts validation `cause` array", () => {
    const err = new MeliApiError(
      "MELI API 400",
      400,
      "https://api.mercadolibre.com/items",
      {
        error: "validation_error",
        message: "Bad input",
        status: 400,
        cause: [
          { code: "missing_attribute", message: "BRAND is required" },
          { code: "invalid_price", message: "Price must be positive" },
        ],
      },
    );
    expect(err.meliCauses).toHaveLength(2);
    expect(err.meliCauses[0]?.code).toBe("missing_attribute");
    expect(err.isValidationError()).toBe(true);
  });

  it("isUnauthorized fires on 401 OR invalid_token slug", () => {
    const a = new MeliApiError("a", 401, "u", null);
    const b = new MeliApiError("b", 200, "u", { error: "invalid_token" });
    expect(a.isUnauthorized()).toBe(true);
    expect(b.isUnauthorized()).toBe(true);
  });

  it("isForbidden fires on 403 OR forbidden slug", () => {
    const a = new MeliApiError("a", 403, "u", null);
    const b = new MeliApiError("b", 200, "u", { error: "forbidden" });
    expect(a.isForbidden()).toBe(true);
    expect(b.isForbidden()).toBe(true);
  });

  it("back-compat: meliErrorCode() still returns the slug", () => {
    const err = new MeliApiError(
      "x",
      400,
      "u",
      { error: "rate_limited" },
    );
    expect(err.meliErrorCode()).toBe("rate_limited");
  });

  it("isMeliError narrows correctly", () => {
    const err = new MeliApiError("x", 500, "u", null);
    expect(isMeliError(err)).toBe(true);
    expect(isMeliError(new Error("not ours"))).toBe(false);
  });
});
