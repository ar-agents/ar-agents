import { describe, expect, it } from "vitest";
import {
  AfipCuitNotFoundError,
  AfipNotConfiguredError,
  IdentityError,
} from "../src";

describe("IdentityError", () => {
  it("base class carries code + message", () => {
    const err = new IdentityError("afip_unknown_error", "boom");
    expect(err.code).toBe("afip_unknown_error");
    expect(err.message).toBe("boom");
    expect(err.name).toBe("IdentityError");
  });

  it("AfipNotConfiguredError sets the right code + actionable message", () => {
    const err = new AfipNotConfiguredError();
    expect(err.code).toBe("afip_not_configured");
    expect(err.message).toMatch(/AFIP_CERT_PATH/);
    expect(err.message).toMatch(/AFIP_KEY_PATH/);
    expect(err).toBeInstanceOf(IdentityError);
  });

  it("AfipCuitNotFoundError carries the CUIT in the message", () => {
    const err = new AfipCuitNotFoundError("20-41758101-5");
    expect(err.code).toBe("afip_cuit_not_found");
    expect(err.cuit).toBe("20-41758101-5");
    expect(err.message).toContain("20-41758101-5");
  });
});
