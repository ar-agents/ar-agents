import { describe, expect, it, vi } from "vitest";
import { ArAgentsResponseValidationError } from "@ar-agents/core";
import {
  ConfigMissingError,
  InMemoryStateAdapter,
  MiArgentinaClient,
  MiArgentinaError,
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

    // The first fetch is the token POST (a later one is the JWKS fetch during
    // ID-token verification). HttpClient normalizes header names to
    // lowercase, so assert against `content-type`.
    const tokenCall = fakeFetch.mock.calls.find((call) =>
      String(call[0]).includes("/oidc/token"),
    );
    expect(tokenCall).toBeTruthy();
    const init = tokenCall![1]! as RequestInit;
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers as HeadersInit);
    expect(headers.get("content-type")).toBe("application/x-www-form-urlencoded");
    const body = String(init.body);
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

// A complete, valid token body — the ID token is a real-looking-but-unsigned
// JWT so the flow reaches JWT verification (which then fails on signature).
const VALID_TOKEN_BODY = {
  access_token: "at",
  token_type: "Bearer",
  expires_in: 3600,
  id_token: "header.payload.sig",
  scope: "openid",
};

describe("core-HttpClient migration: fail-loud + one-shot grants", () => {
  it("token exchange with a malformed body (no access_token) fails LOUD, never a blank token", async () => {
    const state = new InMemoryStateAdapter();
    const fakeFetch = vi.fn(async () =>
      // 200 but missing the required `access_token` — the old blind cast would
      // have fabricated a TokenResponse with accessToken: "".
      new Response(JSON.stringify({ token_type: "Bearer", scope: "openid" }), {
        status: 200,
      }),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const auth = await c.getAuthorizationUrl({ scope: ["openid"] });
    await expect(
      c.exchangeCode({ code: "code123", state: auth.state }),
    ).rejects.toBeInstanceOf(ArAgentsResponseValidationError);
  });

  it("userinfo with a body missing `sub` fails LOUD, never a profile with sub: ''", async () => {
    const state = new InMemoryStateAdapter();
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ cuil: "20123456786", name: "Juan Pérez" }), {
        status: 200,
      }),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(c.getUserInfo("access-token")).rejects.toBeInstanceOf(
      ArAgentsResponseValidationError,
    );
  });

  it("token grant is one-shot: a transient 5xx is NOT retried (fetch called once)", async () => {
    const state = new InMemoryStateAdapter();
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "server_error" }), { status: 503 }),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const auth = await c.getAuthorizationUrl({ scope: ["openid"] });
    await expect(
      c.exchangeCode({ code: "code123", state: auth.state }),
    ).rejects.toMatchObject({ code: "code_exchange_failed" });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("refresh maps a 5xx to refresh_failed (also one-shot, single fetch)", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response("upstream down", { status: 502 }),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(c.refreshToken("rt")).rejects.toMatchObject({
      code: "refresh_failed",
    });
    expect(fakeFetch).toHaveBeenCalledTimes(1);
  });

  it("a network failure on the token POST maps to network_error", async () => {
    const state = new InMemoryStateAdapter();
    const fakeFetch = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const c = new MiArgentinaClient({
      config: baseConfig,
      state,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const auth = await c.getAuthorizationUrl({ scope: ["openid"] });
    await expect(
      c.exchangeCode({ code: "code123", state: auth.state }),
    ).rejects.toMatchObject({ code: "network_error" });
  });

  it("userinfo 401 maps to userinfo_failed carrying the status", async () => {
    const fakeFetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "invalid_token" }), { status: 401 }),
    );
    const c = new MiArgentinaClient({
      config: baseConfig,
      state: new InMemoryStateAdapter(),
      fetch: fakeFetch as unknown as typeof fetch,
    });
    await expect(c.getUserInfo("bad")).rejects.toMatchObject({
      code: "userinfo_failed",
    });
    try {
      await c.getUserInfo("bad");
    } catch (e) {
      expect(e).toBeInstanceOf(MiArgentinaError);
      expect((e as MiArgentinaError).details).toMatchObject({ status: 401 });
    }
  });

  it("a valid, complete token body passes the schema (reaches JWT verify)", async () => {
    const state = new InMemoryStateAdapter();
    const fakeFetch = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes("/oidc/token")) {
        return new Response(JSON.stringify(VALID_TOKEN_BODY), { status: 200 });
      }
      // JWKS fetch during verification.
      return new Response(JSON.stringify({ keys: [] }), { status: 200 });
    });
    const c = new MiArgentinaClient({
      config: baseConfig,
      state,
      fetch: fakeFetch as unknown as typeof fetch,
    });
    const auth = await c.getAuthorizationUrl({ scope: ["openid"] });
    // Fails at JWT verification (fake signature) — NOT at schema validation,
    // proving the complete body was accepted.
    await expect(
      c.exchangeCode({ code: "code123", state: auth.state }),
    ).rejects.not.toBeInstanceOf(ArAgentsResponseValidationError);
  });
});
