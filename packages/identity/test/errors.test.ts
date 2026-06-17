import { describe, expect, it } from "vitest";
import { ArAgentsError, isArAgentsError } from "@ar-agents/core";
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
    const err = new AfipCuitNotFoundError("20-12345678-6");
    expect(err.code).toBe("afip_cuit_not_found");
    expect(err.cuit).toBe("20-12345678-6");
    expect(err.message).toContain("20-12345678-6");
  });
});

describe("IdentityError — @ar-agents/core integration", () => {
  it("extends ArAgentsError so cross-package middleware can switch on it", () => {
    const err = new IdentityError("afip_unknown_error", "boom");
    expect(err).toBeInstanceOf(ArAgentsError);
    expect(isArAgentsError(err)).toBe(true);
  });

  it("flags retryable codes for withRetry middleware", () => {
    expect(new IdentityError("afip_rate_limited", "x").retryable).toBe(true);
    expect(new IdentityError("afip_service_unavailable", "x").retryable).toBe(
      true,
    );
    expect(new IdentityError("afip_cuit_not_found", "x").retryable).toBe(false);
    expect(new IdentityError("afip_not_configured", "x").retryable).toBe(false);
    expect(new IdentityError("afip_cert_invalid", "x").retryable).toBe(false);
  });

  it("preserves legacy `details` field AND mirrors it onto `context.details`", () => {
    const details = { httpStatus: 503, body: "<faultstring>down</faultstring>" };
    const err = new IdentityError("afip_service_unavailable", "down", details);
    expect(err.details).toBe(details); // legacy
    expect(err.context.details).toBe(details); // new
  });

  it("defaults context to empty object when no details", () => {
    const err = new IdentityError("afip_unknown_error", "x");
    expect(err.context).toEqual({});
    expect(err.details).toBeUndefined();
  });

  it("AfipNotConfiguredError is non-retryable (operator action required)", () => {
    expect(new AfipNotConfiguredError().retryable).toBe(false);
  });

  it("AfipCuitNotFoundError is non-retryable (definitive answer)", () => {
    expect(new AfipCuitNotFoundError("20-12345678-9").retryable).toBe(false);
  });
});
