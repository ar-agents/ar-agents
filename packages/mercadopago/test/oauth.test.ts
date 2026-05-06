import { describe, expect, it } from "vitest";
import "./setup";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  expirationTimeMs,
  isExpiringSoon,
  refreshAccessToken,
} from "../src";

describe("buildAuthorizeUrl", () => {
  it("builds the canonical AR authorize URL", () => {
    const url = buildAuthorizeUrl({
      clientId: "MP_APP_ID",
      redirectUri: "https://app.test/oauth/callback",
      state: "session-token-abc",
    });
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      "https://auth.mercadopago.com.ar/authorization",
    );
    expect(parsed.searchParams.get("client_id")).toBe("MP_APP_ID");
    expect(parsed.searchParams.get("response_type")).toBe("code");
    expect(parsed.searchParams.get("platform_id")).toBe("mp");
    expect(parsed.searchParams.get("redirect_uri")).toBe(
      "https://app.test/oauth/callback",
    );
    expect(parsed.searchParams.get("state")).toBe("session-token-abc");
  });

  it("omits state when not provided", () => {
    const url = buildAuthorizeUrl({
      clientId: "MP_APP_ID",
      redirectUri: "https://app.test/oauth/callback",
    });
    expect(new URL(url).searchParams.has("state")).toBe(false);
  });

  it("respects authorizeUrl override (for non-AR sites)", () => {
    const url = buildAuthorizeUrl({
      clientId: "MP_APP_ID",
      redirectUri: "https://app.test/oauth/callback",
      authorizeUrl: "https://auth.mercadopago.com.br/authorization",
    });
    expect(url).toContain("auth.mercadopago.com.br");
  });
});

describe("exchangeCodeForToken", () => {
  it("returns OAuthToken with user_id, access_token, refresh_token", async () => {
    const token = await exchangeCodeForToken({
      clientId: "MP_APP_ID",
      clientSecret: "MP_SECRET",
      code: "TG-test-code",
      redirectUri: "https://app.test/oauth/callback",
    });
    expect(token.access_token).toMatch(/^APP_USR-/);
    expect(token.user_id).toBe("987654321");
    expect(token.refresh_token).toMatch(/^TG-/);
    expect(token.expires_in).toBe(21600);
  });

  it("throws on 400 (bad code)", async () => {
    await expect(
      exchangeCodeForToken({
        clientId: "MP_APP_ID",
        clientSecret: "MP_SECRET",
        code: "BAD_CODE",
        redirectUri: "https://app.test/oauth/callback",
      }),
    ).rejects.toThrow(/MP OAuth 400/);
  });
});

describe("refreshAccessToken", () => {
  it("returns a fresh OAuthToken with rotated refresh_token", async () => {
    const token = await refreshAccessToken({
      clientId: "MP_APP_ID",
      clientSecret: "MP_SECRET",
      refreshToken: "TG-old-refresh",
    });
    expect(token.access_token).toBe("APP_USR-refreshed-access-token");
    expect(token.refresh_token).toBe("TG-test-refresh-token-rotated");
  });
});

describe("expirationTimeMs", () => {
  it("computes the expiration as issued + expires_in*1000", () => {
    const issued = 1_700_000_000_000;
    expect(expirationTimeMs(issued, 3600)).toBe(issued + 3_600_000);
  });

  it("defaults expires_in to 6 hours when undefined", () => {
    const issued = 1_700_000_000_000;
    expect(expirationTimeMs(issued, undefined)).toBe(issued + 21_600_000);
  });
});

describe("isExpiringSoon", () => {
  it("returns true within the skew window", () => {
    const expirationMs = Date.now() + 60_000; // 1 min from now
    expect(isExpiringSoon(expirationMs, 300)).toBe(true);
  });

  it("returns false when comfortably in the future", () => {
    const expirationMs = Date.now() + 3600 * 1000;
    expect(isExpiringSoon(expirationMs, 300)).toBe(false);
  });
});
