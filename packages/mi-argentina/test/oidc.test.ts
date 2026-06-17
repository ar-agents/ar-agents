import { describe, expect, it, vi } from "vitest";
import {
  ConfigMissingError,
  InMemoryStateAdapter,
  MiArgentinaClient,
  StateMismatchError,
  type MiArgentinaConfig,
} from "../src";

const baseConfig: MiArgentinaConfig = {
  clientId: "test-client",
  clientSecret: "secret",
  redirectUri: "https://app.test/cb",
  provider: "miargentina_sandbox",
};

describe("MiArgentinaClient construction", () => {
  it("throws ConfigMissingError when clientId is empty", () => {
    expect(
      () =>
        new MiArgentinaClient({
          config: { ...baseConfig, clientId: "" },
          state: new InMemoryStateAdapter(),
        }),
    ).toThrow(ConfigMissingError);
  });

  it("uses sandbox endpoints when preset is miargentina_sandbox", () => {
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
    });
    const e = c.getEndpoints();
    expect(e.authorizationEndpoint).toContain("sandbox.miargentina.gob.ar");
  });

  it("requires explicit endpoints when provider is custom", () => {
    expect(
      () =>
        new MiArgentinaClient({
          config: { ...baseConfig, provider: "custom" },
          state: new InMemoryStateAdapter(),
        }),
    ).toThrow(/custom.*endpoints/i);
  });
});

describe("getAuthorizationUrl", () => {
  it("includes PKCE challenge, state, nonce, and scopes", async () => {
    const state = new InMemoryStateAdapter();
    const c = new MiArgentinaClient({ config: baseConfig, state });
    const r = await c.getAuthorizationUrl({ scope: ["openid", "cuil"] });
    const url = new URL(r.url);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://app.test/cb");
    expect(url.searchParams.get("scope")).toBe("openid cuil");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url.searchParams.get("state")).toBe(r.state);
    expect(url.searchParams.get("nonce")).toBe(r.nonce);
    expect(state.size()).toBe(1);
  });

  it("threads through prompt, ui_locales, login_hint", async () => {
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
    });
    const r = await c.getAuthorizationUrl({
      prompt: "login",
      uiLocales: "es-AR",
      loginHint: "20-12345678-6",
    });
    const url = new URL(r.url);
    expect(url.searchParams.get("prompt")).toBe("login");
    expect(url.searchParams.get("ui_locales")).toBe("es-AR");
    expect(url.searchParams.get("login_hint")).toBe("20-12345678-6");
  });

  it("falls back to default scopes when none provided", async () => {
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
    });
    const r = await c.getAuthorizationUrl();
    expect(r.scope).toEqual(["openid", "profile", "email"]);
  });
});

describe("exchangeCode", () => {
  it("throws StateMismatchError when state has no stored entry", async () => {
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
    });
    await expect(
      c.exchangeCode({ code: "c", state: "missing" }),
    ).rejects.toThrow(StateMismatchError);
  });

  it("posts client_id, client_secret, code, code_verifier, redirect_uri", async () => {
    const state = new InMemoryStateAdapter();
    const fakeFetch = vi.fn(async () => {
      // We never get here in this test — we want to assert the request shape.
      return new Response(
        JSON.stringify({
          access_token: "at",
          id_token: "header.payload.sig",
          token_type: "Bearer",
          expires_in: 3600,
          scope: "openid",
        }),
        { status: 200 },
      );
    });

    const c = new MiArgentinaClient({
      config: baseConfig,
      state,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const auth = await c.getAuthorizationUrl({ scope: ["openid"] });

    // ID-token verification will throw because the JWT is fake; we just
    // need to verify the token endpoint receives the right body.
    await expect(
      c.exchangeCode({ code: "code123", state: auth.state }),
    ).rejects.toThrow();

    expect(fakeFetch).toHaveBeenCalledWith(
      expect.stringContaining("/oidc/token"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
      }),
    );
    const body = String(fakeFetch.mock.calls[0]![1]!.body);
    const params = new URLSearchParams(body);
    expect(params.get("grant_type")).toBe("authorization_code");
    expect(params.get("code")).toBe("code123");
    expect(params.get("client_id")).toBe("test-client");
    expect(params.get("client_secret")).toBe("secret");
    expect(params.get("redirect_uri")).toBe("https://app.test/cb");
    expect(params.get("code_verifier")).toBeTruthy();
  });
});

describe("buildLogoutUrl", () => {
  it("returns the end_session URL with id_token_hint", () => {
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
    });
    const url = c.buildLogoutUrl({
      idTokenHint: "abc",
      postLogoutRedirectUri: "https://app.test/bye",
    });
    expect(url).toContain("/oidc/logout");
    expect(url).toContain("id_token_hint=abc");
    expect(url).toContain("post_logout_redirect_uri=");
  });
});

describe("discover", () => {
  it("updates endpoints from a discovery doc", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(
        JSON.stringify({
          issuer: "https://example.test",
          authorization_endpoint: "https://example.test/auth",
          token_endpoint: "https://example.test/token",
          userinfo_endpoint: "https://example.test/userinfo",
          jwks_uri: "https://example.test/jwks",
        }),
        { status: 200 },
      ),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const e = await c.discover();
    expect(e.tokenEndpoint).toBe("https://example.test/token");
    expect(c.getEndpoints().tokenEndpoint).toBe("https://example.test/token");
  });

  it("throws when discovery doc is missing required fields", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ issuer: "x" }), { status: 200 }),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(c.discover()).rejects.toThrow(/missing required endpoints/);
  });
});
