import { describe, expect, it } from "vitest";
import {
  classifyError,
  MercadoPagoAccountTypeMismatchError,
  MercadoPagoAuthError,
  MercadoPagoAuthorizeForbiddenError,
  MercadoPagoBackUrlInvalidError,
  MercadoPagoError,
  MercadoPagoRateLimitError,
  MercadoPagoSelfPaymentError,
} from "../src";

describe("classifyError", () => {
  it("maps 401 to MercadoPagoAuthError", () => {
    const err = classifyError(401, "/preapproval", { message: "unauthorized" });
    expect(err).toBeInstanceOf(MercadoPagoAuthError);
  });

  it("maps 429 to MercadoPagoRateLimitError", () => {
    const err = classifyError(429, "/preapproval", { message: "too many" });
    expect(err).toBeInstanceOf(MercadoPagoRateLimitError);
  });

  it("maps 'back_url' + 'not a valid URL' to MercadoPagoBackUrlInvalidError", () => {
    const err = classifyError(400, "/preapproval", {
      message: "back_url is not a valid URL",
    });
    expect(err).toBeInstanceOf(MercadoPagoBackUrlInvalidError);
  });

  it("maps 'Cannot operate between different countries' to MercadoPagoAccountTypeMismatchError", () => {
    const err = classifyError(400, "/preapproval", {
      message: "Cannot operate between different countries",
    });
    expect(err).toBeInstanceOf(MercadoPagoAccountTypeMismatchError);
  });

  it("maps 'only the payer can' to MercadoPagoAuthorizeForbiddenError when context has preapprovalId", () => {
    const err = classifyError(
      400,
      "/preapproval/abc",
      { message: "You cannot authorize a preapproval, only the payer can" },
      { preapprovalId: "abc" },
    );
    expect(err).toBeInstanceOf(MercadoPagoAuthorizeForbiddenError);
  });

  it("maps payer===seller email to MercadoPagoSelfPaymentError when 400 with no other match", () => {
    const err = classifyError(
      400,
      "/preapproval",
      { message: "generic 400 with no specific marker" },
      { payerEmail: "Same@example.com", sellerEmail: "same@example.com" },
    );
    expect(err).toBeInstanceOf(MercadoPagoSelfPaymentError);
  });

  it("falls back to generic MercadoPagoError when no pattern matches", () => {
    const err = classifyError(500, "/preapproval", { message: "server error" });
    expect(err).toBeInstanceOf(MercadoPagoError);
    expect(err).not.toBeInstanceOf(MercadoPagoAuthError);
    expect(err.status).toBe(500);
    expect(err.endpoint).toBe("/preapproval");
  });

  it("preserves the response body on the error for debugging", () => {
    const body = { message: "back_url is not a valid URL", error: "bad_request" };
    const err = classifyError(400, "/preapproval", body);
    expect(err.mpResponse).toEqual(body);
  });
});
