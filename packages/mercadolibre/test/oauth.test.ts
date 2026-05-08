import { describe, it, expect, beforeEach } from "vitest";
import {
  buildAuthorizationUrl,
  exchangeAuthorizationCode,
  refreshTokens,
  ensureAccessToken,
  InMemoryOAuthStore,
} from "../src";
import { MeliAuthError } from "../src/errors";

describe("buildAuthorizationUrl", () => {
  it("constructs the canonical MLA auth URL", () => {
    const url = buildAuthorizationUrl({
      app: { clientId: "abc", clientSecret: "x", redirectUri: "https://x/cb" },
      site: "MLA",
      state: "nonce",
    });
    const u = new URL(url);
    expect(u.host).toBe("auth.mercadolibre.com.ar");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("client_id")).toBe("abc");
    expect(u.searchParams.get("redirect_uri")).toBe("https://x/cb");
    expect(u.searchParams.get("state")).toBe("nonce");
  });

  it("supports BR/MX/CL/CO/UY/PE site shortcuts", () => {
    expect(
      buildAuthorizationUrl({
        app: { clientId: "x", clientSecret: "y", redirectUri: "https://x" },
        site: "MLB",
        state: "n",
      }),
    ).toContain("auth.mercadolivre.com.br");
    expect(
      buildAuthorizationUrl({
        app: { clientId: "x", clientSecret: "y", redirectUri: "https://x" },
        site: "MLM",
        state: "n",
      }),
    ).toContain("auth.mercadolibre.com.mx");
  });

  it("throws on unknown site id", () => {
    expect(() =>
      buildAuthorizationUrl({
        app: { clientId: "x", clientSecret: "y", redirectUri: "https://x" },
        site: "MLZ" as never,
        state: "n",
      }),
    ).toThrow(MeliAuthError);
  });
});

describe("exchangeAuthorizationCode", () => {
  beforeEach(() => {
    // Reset global fetch to a controlled mock per test.
    (globalThis as { fetch: unknown }).fetch = makeTokenFetch({
      access_token: "AT",
      refresh_token: "RT",
      expires_in: 21600,
      user_id: 99,
      scope: "offline_access read write",
      token_type: "bearer",
    });
  });

  it("returns enriched tokens with computed expires_at", async () => {
    const before = Math.floor(Date.now() / 1000);
    const tokens = await exchangeAuthorizationCode(
      { clientId: "id", clientSecret: "secret", redirectUri: "https://x" },
      "the-code",
    );
    expect(tokens.access_token).toBe("AT");
    expect(tokens.refresh_token).toBe("RT");
    expect(tokens.user_id).toBe(99);
    expect(tokens.access_token_expires_at).toBeGreaterThanOrEqual(before + 21600);
  });
});

describe("ensureAccessToken with mutex coalescing", () => {
  it("returns stored tokens when still fresh", async () => {
    const store = new InMemoryOAuthStore();
    await store.write(7, {
      access_token: "fresh",
      refresh_token: "RT",
      expires_in: 21600,
      access_token_expires_at: Math.floor(Date.now() / 1000) + 1000,
      user_id: 7,
      scope: "x",
      token_type: "bearer",
    });
    let calls = 0;
    (globalThis as { fetch: unknown }).fetch = makeTokenFetch(() => {
      calls++;
      return {
        access_token: "AT2",
        refresh_token: "RT2",
        expires_in: 21600,
        user_id: 7,
        scope: "x",
        token_type: "bearer",
      };
    });
    const result = await ensureAccessToken({
      userId: 7,
      app: { clientId: "x", clientSecret: "y", redirectUri: "z" },
      store,
    });
    expect(result.access_token).toBe("fresh");
    expect(calls).toBe(0);
  });

  it("refreshes when access_token is near expiry", async () => {
    const store = new InMemoryOAuthStore();
    await store.write(8, {
      access_token: "stale",
      refresh_token: "RT_old",
      expires_in: 5,
      access_token_expires_at: Math.floor(Date.now() / 1000) + 5, // within preflight window
      user_id: 8,
      scope: "x",
      token_type: "bearer",
    });
    (globalThis as { fetch: unknown }).fetch = makeTokenFetch({
      access_token: "AT_new",
      refresh_token: "RT_new",
      expires_in: 21600,
      user_id: 8,
      scope: "x",
      token_type: "bearer",
    });
    const result = await ensureAccessToken({
      userId: 8,
      app: { clientId: "x", clientSecret: "y", redirectUri: "z" },
      store,
    });
    expect(result.access_token).toBe("AT_new");
    expect(result.refresh_token).toBe("RT_new");

    // Persisted to store.
    const stored = await store.read(8);
    expect(stored?.refresh_token).toBe("RT_new");
  });

  it("coalesces concurrent refreshes (single HTTP call across N callers)", async () => {
    const store = new InMemoryOAuthStore();
    // Use a unique userId per test to avoid lock state leaking from
    // earlier tests in this file.
    await store.write(2024, {
      access_token: "stale",
      refresh_token: "RT_old",
      expires_in: 5,
      access_token_expires_at: Math.floor(Date.now() / 1000) + 5,
      user_id: 2024,
      scope: "x",
      token_type: "bearer",
    });
    let calls = 0;
    (globalThis as { fetch: unknown }).fetch = makeTokenFetch(() => {
      calls++;
      return {
        access_token: `AT_${calls}`,
        refresh_token: `RT_${calls}`,
        expires_in: 21600,
        user_id: 2024,
        scope: "x",
        token_type: "bearer",
      };
    });
    const all = await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        ensureAccessToken({
          userId: 2024,
          app: { clientId: "x", clientSecret: "y", redirectUri: "z" },
          store,
        }),
      ),
    );
    // The first refresh wins, and subsequent ones see the freshened token.
    expect(calls).toBe(1);
    for (const r of all) {
      expect(r.access_token).toBe("AT_1");
      expect(r.refresh_token).toBe("RT_1");
    }
  });

  it("throws MeliAuthError when no tokens are stored for the user", async () => {
    const store = new InMemoryOAuthStore();
    await expect(
      ensureAccessToken({
        userId: 999,
        app: { clientId: "x", clientSecret: "y", redirectUri: "z" },
        store,
      }),
    ).rejects.toBeInstanceOf(MeliAuthError);
  });
});

describe("refreshTokens propagates server errors", () => {
  it("throws MeliAuthError on 400 invalid_grant", async () => {
    (globalThis as { fetch: unknown }).fetch = async () =>
      new Response(JSON.stringify({ error: "invalid_grant", message: "expired" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    await expect(
      refreshTokens(
        { clientId: "x", clientSecret: "y", redirectUri: "z" },
        "rt",
      ),
    ).rejects.toBeInstanceOf(MeliAuthError);
  });
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTokenFetch(
  responseOrFn:
    | Record<string, unknown>
    | (() => Record<string, unknown> | Promise<Record<string, unknown>>),
): typeof fetch {
  return (async () => {
    const body =
      typeof responseOrFn === "function" ? await responseOrFn() : responseOrFn;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;
}
