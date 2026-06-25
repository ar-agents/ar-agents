import { describe, expect, it } from "vitest";
import {
  Auth0Adapter,
  MagicLinkSdkAdapter,
  MercadoPagoIdentityAdapter,
} from "../src";

describe("Auth0Adapter", () => {
  const adapter = new Auth0Adapter({
    domain: "test.auth0.com",
    clientId: "client123",
    clientSecret: "secret456",
    redirectUri: "https://app.test/callback",
  });

  it("declares correct id + trust level", () => {
    expect(adapter.id).toBe("auth0");
    expect(adapter.trustLevel).toBe(0.7);
  });

  it("generateSecret returns a verifier:challenge pair", () => {
    const secret = adapter.generateSecret();
    expect(secret).toMatch(/^[\w-]+:[\w-]+$/);
    const [verifier, challenge] = secret.split(":");
    expect(verifier!.length).toBeGreaterThan(20);
    expect(challenge!.length).toBeGreaterThan(20);
    expect(verifier).not.toBe(challenge);
  });

  it("buildVerificationUrl includes state, code_challenge, code_challenge_method=S256", () => {
    const secret = adapter.generateSecret();
    const url = adapter.buildVerificationUrl({ requestId: "req-abc", secret });
    expect(url).toMatch(/^https:\/\/test\.auth0\.com\/authorize\?/);
    const u = new URL(url);
    expect(u.searchParams.get("state")).toBe("req-abc");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("client123");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(u.searchParams.get("code_challenge")).toBeTruthy();
    expect(u.searchParams.get("redirect_uri")).toBe("https://app.test/callback");
    expect(u.searchParams.get("scope")).toBe("openid profile email");
  });

  it("includes acr_values when enforceMfa: true", () => {
    const adapter = new Auth0Adapter({
      domain: "test.auth0.com",
      clientId: "x",
      clientSecret: "y",
      redirectUri: "https://app.test/cb",
      enforceMfa: true,
    });
    const url = adapter.buildVerificationUrl({
      requestId: "req",
      secret: adapter.generateSecret(),
    });
    expect(url).toContain("acr_values=");
    expect(url).toContain("multi-factor");
  });

  it("verify returns false when no code submitted", async () => {
    const result = await adapter.verify({
      storedSecret: "verifier:challenge",
      submitted: {},
      subject: { type: "email", value: "test@x.com" },
    });
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/missing/i);
  });
});

describe("MagicLinkSdkAdapter", () => {
  it("declares correct id + trust level", () => {
    const adapter = new MagicLinkSdkAdapter({ secretKey: "sk_test_123" });
    expect(adapter.id).toBe("magic_link_sdk");
    expect(adapter.trustLevel).toBe(0.7);
  });

  it("buildVerificationUrl returns null (client-rendered)", () => {
    const adapter = new MagicLinkSdkAdapter({ secretKey: "sk_test_123" });
    expect(adapter.buildVerificationUrl()).toBeNull();
  });

  it("verify returns false when no didToken submitted", async () => {
    const adapter = new MagicLinkSdkAdapter({ secretKey: "sk_test_123" });
    const result = await adapter.verify({
      submitted: {},
      subject: { type: "email", value: "x@y.com" },
    });
    expect(result.verified).toBe(false);
    if (!result.verified) expect(result.reason).toMatch(/DIDToken/i);
  });
});

describe("MercadoPagoIdentityAdapter", () => {
  function makeMockFetch(payment: {
    status: string;
    transaction_amount: number;
    payer?: Record<string, unknown>;
  }): typeof fetch {
    return (async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/refunds")) {
        return new Response(JSON.stringify({ id: "refund_x" }), { status: 201 });
      }
      return new Response(JSON.stringify(payment), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof fetch;
  }

  it("declares correct id + trust level (0.5 — partial KYC)", () => {
    const adapter = new MercadoPagoIdentityAdapter({ accessToken: "TEST-x" });
    expect(adapter.id).toBe("mercadopago_identity");
    expect(adapter.trustLevel).toBe(0.5);
  });

  it("verifies an approved $1 payment and returns identification claims", async () => {
    const fetchImpl = makeMockFetch({
      status: "approved",
      transaction_amount: 1,
      payer: {
        id: 123,
        email: "lautaro@test.com",
        first_name: "Lautaro",
        last_name: "Codes",
        identification: { type: "DNI", number: "12345678" },
      },
    });
    const adapter = new MercadoPagoIdentityAdapter({
      accessToken: "TEST-x",
      fetchImpl,
    });
    // A DNI-subject request matches the payer's DNI identification.
    const result = await adapter.verify({
      submitted: { oauthCode: "p_123" },
      subject: { type: "dni", value: "12345678" },
    });
    expect(result.verified).toBe(true);
    if (!result.verified) throw new Error();
    expect(result.claims?.["sub"]).toBe("mp:123");
    expect(result.claims?.["email"]).toBe("lautaro@test.com");
    expect(result.claims?.["identification_type"]).toBe("DNI");
    expect(result.claims?.["identification_number"]).toBe("12345678");
    expect(result.claims?.["payment_id"]).toBe("p_123");
    // Binds to the payer's proven identity (DeepSec deferred HIGH).
    expect(result.verifiedSubject).toEqual({ type: "dni", value: "12345678" });
  });

  it("binds verifiedSubject to the requested type; forces a mismatch when MP can't prove it", async () => {
    const fetchImpl = makeMockFetch({
      status: "approved",
      transaction_amount: 1,
      payer: {
        id: 123,
        email: "lautaro@test.com",
        identification: { type: "DNI", number: "12345678" },
      },
    });
    const adapter = new MercadoPagoIdentityAdapter({ accessToken: "TEST-x", fetchImpl });
    // email request → proves the payer email
    const email = await adapter.verify({
      submitted: { oauthCode: "p_123" },
      subject: { type: "email", value: "lautaro@test.com" },
    });
    if (!email.verified) throw new Error();
    expect(email.verifiedSubject).toEqual({ type: "email", value: "lautaro@test.com" });
    // phone request → MP carries no payer phone → empty value forces a client-side mismatch
    const phone = await adapter.verify({
      submitted: { oauthCode: "p_123" },
      subject: { type: "phone", value: "5491112345678" },
    });
    if (!phone.verified) throw new Error();
    expect(phone.verifiedSubject).toEqual({ type: "phone", value: "" });
  });

  it("rejects when payment not approved", async () => {
    const fetchImpl = makeMockFetch({ status: "pending", transaction_amount: 1 });
    const adapter = new MercadoPagoIdentityAdapter({
      accessToken: "TEST-x",
      fetchImpl,
    });
    const result = await adapter.verify({
      submitted: { oauthCode: "p_123" },
      subject: { type: "phone", value: "5491112345678" },
    });
    expect(result.verified).toBe(false);
    if (result.verified) throw new Error();
    expect(result.reason).toMatch(/pending/i);
  });

  it("rejects when payment amount exceeds expected micro-charge", async () => {
    const fetchImpl = makeMockFetch({ status: "approved", transaction_amount: 100 });
    const adapter = new MercadoPagoIdentityAdapter({
      accessToken: "TEST-x",
      microChargeAmount: 1,
      fetchImpl,
    });
    const result = await adapter.verify({
      submitted: { oauthCode: "p_123" },
      subject: { type: "phone", value: "5491112345678" },
    });
    expect(result.verified).toBe(false);
    if (result.verified) throw new Error();
    expect(result.reason).toMatch(/exceeds expected/i);
  });

  it("rejects when payment_id missing", async () => {
    const adapter = new MercadoPagoIdentityAdapter({ accessToken: "TEST-x" });
    const result = await adapter.verify({
      submitted: {},
      subject: { type: "phone", value: "5491112345678" },
    });
    expect(result.verified).toBe(false);
    if (result.verified) throw new Error();
    expect(result.reason).toMatch(/payment_id/i);
  });
});
