/**
 * OIDC client for Mi Argentina. Wraps the four flows an agent / web app
 * needs:
 *
 *   1. `getAuthorizationUrl` — generates the redirect URL + side-effects:
 *      stores PKCE verifier, state, nonce in the configured state adapter.
 *   2. `exchangeCode` — completes the callback: verifies state, exchanges
 *      authorization code for tokens, verifies the ID token signature
 *      and claims, and returns the user's verified profile.
 *   3. `refreshToken` — exchanges a refresh token for a new access token.
 *   4. `getUserInfo` — fetches the OIDC userinfo endpoint with a bearer.
 *
 * # Endpoints
 *
 * Provider preset `"miargentina"` ships documented endpoints. Set
 * `provider: "custom"` and pass `endpoints` for sandboxes / staging.
 * For maximum resilience, use `discover()` to fetch the OIDC discovery
 * document at runtime — survives provider URL changes.
 */

import {
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  HttpClient,
  type HttpRequest,
} from "@ar-agents/core";
import { z } from "zod";
import {
  ConfigMissingError,
  IdTokenInvalidError,
  MiArgentinaError,
  StateMismatchError,
  type MiArgentinaErrorCode,
} from "./errors";
import { verifyIdToken, type JwksDocument } from "./jwt";
import { computeCodeChallenge, generateCodeVerifier, generateRandomToken } from "./pkce";
import type {
  AuthorizationRequest,
  AuthorizationUrlResult,
  MiArgentinaConfig,
  MiArgentinaStateAdapter,
  MiArgentinaUserProfile,
  OidcEndpoints,
  StoredAuthState,
  TokenResponse,
  VerifiedIdToken,
} from "./types";

/**
 * Per-request timeout for all OIDC HTTP calls (token exchange, refresh,
 * userinfo, JWKS, discovery). Before the core-HttpClient migration these
 * fetches were entirely un-timed — a hung provider socket would hang the
 * whole login flow forever.
 */
const OIDC_TIMEOUT_MS = 10_000;

/**
 * Response schema for the OIDC `/token` endpoint (code exchange + refresh).
 * `access_token` and `token_type` are required by RFC 6749 §5.1; a JSON body
 * that omits them (a partial/proxy-mangled response) now fails LOUD
 * (`ArAgentsResponseValidationError`) instead of being blind-cast into a
 * clean-looking-but-empty `TokenResponse` with `accessToken: ""`. A non-JSON
 * body (an HTML error/maintenance page served with a 200) fails loud even
 * earlier — the client rejects it as a non-JSON body before this schema runs.
 */
const tokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().min(1),
    expires_in: z.union([z.number(), z.string()]).optional(),
    id_token: z.string().optional(),
    refresh_token: z.string().optional(),
    scope: z.string().optional(),
  })
  .passthrough();

/**
 * Response schema for the OIDC userinfo endpoint. `sub` is the one claim OIDC
 * guarantees and the stable per-user key; a userinfo body missing it is not a
 * usable identity and must fail loud rather than yield a profile with
 * `sub: ""`.
 */
const userInfoSchema = z
  .object({
    sub: z.string().min(1),
  })
  .passthrough();

/**
 * Documented Mi Argentina endpoints. Verify against
 * https://argob.github.io/mi-argentina-docs/ — they may evolve. When in
 * doubt, call `MiArgentinaClient.discover()` to refresh from the
 * `.well-known/openid-configuration` endpoint.
 */
export const MI_ARGENTINA_ENDPOINTS_PROD: OidcEndpoints = {
  issuer: "https://miargentina.gob.ar",
  authorizationEndpoint: "https://miargentina.gob.ar/oidc/authorize",
  tokenEndpoint: "https://miargentina.gob.ar/oidc/token",
  userinfoEndpoint: "https://miargentina.gob.ar/oidc/userinfo",
  jwksUri: "https://miargentina.gob.ar/oidc/jwks",
  endSessionEndpoint: "https://miargentina.gob.ar/oidc/logout",
};

export const MI_ARGENTINA_ENDPOINTS_SANDBOX: OidcEndpoints = {
  issuer: "https://sandbox.miargentina.gob.ar",
  authorizationEndpoint: "https://sandbox.miargentina.gob.ar/oidc/authorize",
  tokenEndpoint: "https://sandbox.miargentina.gob.ar/oidc/token",
  userinfoEndpoint: "https://sandbox.miargentina.gob.ar/oidc/userinfo",
  jwksUri: "https://sandbox.miargentina.gob.ar/oidc/jwks",
  endSessionEndpoint: "https://sandbox.miargentina.gob.ar/oidc/logout",
};

const DEFAULT_SCOPES = ["openid", "profile", "email"] as const;
const STATE_TTL_SECONDS = 10 * 60;

export interface MiArgentinaClientOptions {
  config: MiArgentinaConfig;
  state: MiArgentinaStateAdapter;
  /**
   * Override the global fetch — useful for tests, custom retries, edge
   * proxies. Defaults to the platform `fetch`.
   */
  fetch?: typeof fetch;
}

export class MiArgentinaClient {
  private endpoints: OidcEndpoints;
  private cachedJwks: JwksDocument | null = null;
  private cachedJwksAt = 0;
  private readonly fetchImpl: typeof fetch;

  constructor(private opts: MiArgentinaClientOptions) {
    const missing: string[] = [];
    if (!opts.config.clientId) missing.push("clientId");
    if (!opts.config.clientSecret) missing.push("clientSecret");
    if (!opts.config.redirectUri) missing.push("redirectUri");
    if (missing.length > 0) throw new ConfigMissingError(missing);

    this.fetchImpl = opts.fetch ?? globalThis.fetch.bind(globalThis);
    this.endpoints = resolveEndpoints(opts.config);
  }

  /**
   * OIDC discovery. Fetches `<issuer>/.well-known/openid-configuration`
   * and updates the cached endpoints. Call once at boot for resilience
   * against provider URL changes.
   */
  async discover(): Promise<OidcEndpoints> {
    const issuer = this.opts.config.issuer ?? this.endpoints.issuer;
    const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
    const doc = await this.httpJson<Record<string, unknown>>(
      url,
      { method: "GET" },
      "discovery_failed",
      "OIDC discovery",
    );
    const next: OidcEndpoints = {
      issuer: String(doc["issuer"] ?? issuer),
      authorizationEndpoint: String(doc["authorization_endpoint"] ?? ""),
      tokenEndpoint: String(doc["token_endpoint"] ?? ""),
      userinfoEndpoint: String(doc["userinfo_endpoint"] ?? ""),
      jwksUri: String(doc["jwks_uri"] ?? ""),
    };
    if (doc["end_session_endpoint"]) {
      next.endSessionEndpoint = String(doc["end_session_endpoint"]);
    }
    if (!next.authorizationEndpoint || !next.tokenEndpoint || !next.jwksUri) {
      throw new MiArgentinaError(
        "discovery_failed",
        `OIDC discovery doc at ${url} is missing required endpoints`,
      );
    }
    this.endpoints = next;
    this.cachedJwks = null;
    return next;
  }

  /**
   * Build the authorization URL the browser will be redirected to. Stores
   * a `StoredAuthState` keyed by the generated `state` value — the callback
   * will consume it.
   */
  async getAuthorizationUrl(
    req: AuthorizationRequest = {},
  ): Promise<AuthorizationUrlResult> {
    const state = req.state ?? generateRandomToken();
    const nonce = req.nonce ?? generateRandomToken();
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await computeCodeChallenge(codeVerifier);
    const scope = req.scope ?? this.opts.config.defaultScopes ?? [...DEFAULT_SCOPES];

    await this.opts.state.put(
      state,
      {
        nonce,
        codeVerifier,
        redirectUri: this.opts.config.redirectUri,
        scope,
        createdAt: Date.now(),
      },
      STATE_TTL_SECONDS,
    );

    const params = new URLSearchParams({
      response_type: "code",
      client_id: this.opts.config.clientId,
      redirect_uri: this.opts.config.redirectUri,
      scope: scope.join(" "),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });
    if (req.prompt) params.set("prompt", req.prompt);
    if (req.uiLocales) params.set("ui_locales", req.uiLocales);
    if (req.loginHint) params.set("login_hint", req.loginHint);

    return {
      url: `${this.endpoints.authorizationEndpoint}?${params.toString()}`,
      state,
      nonce,
      codeVerifier,
      scope,
    };
  }

  /**
   * Complete the OAuth callback. Verifies state, exchanges code for tokens,
   * verifies the ID token. Returns tokens + verified ID token claims +
   * (optionally) the userinfo profile.
   *
   * `code` and `state` come from the callback querystring. The state must
   * match an entry stored by a prior `getAuthorizationUrl()` — this is the
   * CSRF defense. The PKCE verifier is consumed atomically; replays fail.
   */
  async exchangeCode(args: {
    code: string;
    state: string;
    fetchUserInfo?: boolean;
  }): Promise<{
    tokens: TokenResponse;
    idToken: VerifiedIdToken;
    profile?: MiArgentinaUserProfile;
    storedAuth: StoredAuthState;
  }> {
    const stored = await this.opts.state.consume(args.state);
    if (!stored) {
      throw new StateMismatchError();
    }

    const body = new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: stored.redirectUri,
      client_id: this.opts.config.clientId,
      client_secret: this.opts.config.clientSecret,
      code_verifier: stored.codeVerifier,
    });
    const json = await this.postTokenEndpoint(
      body.toString(),
      "code_exchange_failed",
      "Token exchange",
    );
    const tokens: TokenResponse = {
      accessToken: json.access_token,
      tokenType: json.token_type,
      expiresIn: Number(json.expires_in ?? 0),
      idToken: String(json.id_token ?? ""),
      scope: String(json.scope ?? stored.scope.join(" ")),
    };
    if (json.refresh_token) tokens.refreshToken = json.refresh_token;
    if (!tokens.idToken) {
      throw new IdTokenInvalidError("no id_token in token response");
    }

    const idToken = await this.verifyIdToken(tokens.idToken, stored.nonce);

    if (args.fetchUserInfo) {
      const profile = await this.getUserInfo(tokens.accessToken);
      return { tokens, idToken, profile, storedAuth: stored };
    }
    return { tokens, idToken, storedAuth: stored };
  }

  /**
   * Verify an ID token against the configured issuer/audience. Resolves
   * the signing key from JWKS (cached for 5 minutes).
   */
  async verifyIdToken(jwt: string, expectedNonce?: string): Promise<VerifiedIdToken> {
    const jwks = await this.getJwks();
    const verifyOpts: Parameters<typeof verifyIdToken>[2] = {
      expectedIssuer: this.opts.config.issuer ?? this.endpoints.issuer,
      expectedAudience: this.opts.config.clientId,
    };
    if (expectedNonce !== undefined) verifyOpts.expectedNonce = expectedNonce;
    return verifyIdToken(jwt, jwks, verifyOpts);
  }

  /** Fetch the userinfo endpoint with a Bearer access token. */
  async getUserInfo(accessToken: string): Promise<MiArgentinaUserProfile> {
    const raw = await this.httpJson<Record<string, unknown>>(
      this.endpoints.userinfoEndpoint,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        schema: userInfoSchema,
      },
      "userinfo_failed",
      "Userinfo",
    );
    return mapUserInfo(raw);
  }

  /**
   * Exchange a refresh token for a new access token (and possibly a new
   * refresh token, per provider policy). Throws if the refresh token is
   * revoked or expired — the user must restart the login flow.
   */
  async refreshToken(refreshToken: string): Promise<TokenResponse> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: this.opts.config.clientId,
      client_secret: this.opts.config.clientSecret,
    });
    const json = await this.postTokenEndpoint(
      body.toString(),
      "refresh_failed",
      "Refresh",
    );
    const out: TokenResponse = {
      accessToken: json.access_token,
      tokenType: json.token_type,
      expiresIn: Number(json.expires_in ?? 0),
      idToken: String(json.id_token ?? ""),
      scope: String(json.scope ?? ""),
    };
    if (json.refresh_token) out.refreshToken = json.refresh_token;
    return out;
  }

  /** Build the end-session URL when the provider supports it. */
  buildLogoutUrl(args: { idTokenHint?: string; postLogoutRedirectUri?: string } = {}): string | null {
    const endpoint = this.endpoints.endSessionEndpoint;
    if (!endpoint) return null;
    const params = new URLSearchParams();
    if (args.idTokenHint) params.set("id_token_hint", args.idTokenHint);
    if (args.postLogoutRedirectUri) {
      params.set("post_logout_redirect_uri", args.postLogoutRedirectUri);
    }
    const qs = params.toString();
    return qs ? `${endpoint}?${qs}` : endpoint;
  }

  /** Currently-resolved endpoints. After `discover()` they're refreshed. */
  getEndpoints(): OidcEndpoints {
    return this.endpoints;
  }

  /**
   * POST the token endpoint with a form-urlencoded body and validate the
   * response against {@link tokenResponseSchema}. A malformed body fails loud
   * (`ArAgentsResponseValidationError` → surfaced as-is). Token grants are
   * one-shot and MUST NOT be retried — a duplicate `authorization_code` /
   * `refresh_token` submission can burn the grant server-side. We disable
   * retry (`retry: false`) rather than rely on POST-not-retried defaults.
   */
  private async postTokenEndpoint(
    body: string,
    failCode: MiArgentinaErrorCode,
    label: string,
  ): Promise<z.infer<typeof tokenResponseSchema>> {
    const { client, path } = this.clientFor(this.endpoints.tokenEndpoint);
    try {
      return await client.request({
        method: "POST",
        path,
        body,
        // HttpClient sends a string body as-is and will not override an
        // explicit content-type — token endpoints are form-urlencoded.
        headers: { "content-type": "application/x-www-form-urlencoded" },
        schema: tokenResponseSchema,
        timeoutMs: OIDC_TIMEOUT_MS,
        retry: false,
      });
    } catch (err) {
      throw this.mapCoreError(err, failCode, label);
    }
  }

  /**
   * GET/POST an OIDC endpoint (given as an absolute URL) through the shared
   * HttpClient and return the parsed JSON. When a `schema` is supplied on
   * `extra`, the body is validated and a malformed body fails loud; otherwise
   * the raw JSON is returned (used for discovery + JWKS, whose shapes are
   * validated downstream by their own consumers).
   */
  private async httpJson<T>(
    endpointUrl: string,
    extra: Pick<HttpRequest<T>, "method" | "headers" | "schema">,
    failCode: MiArgentinaErrorCode,
    label: string,
  ): Promise<T> {
    const { client, path } = this.clientFor(endpointUrl);
    try {
      return (await client.request<T>({
        path,
        timeoutMs: OIDC_TIMEOUT_MS,
        ...extra,
      })) as T;
    } catch (err) {
      throw this.mapCoreError(err, failCode, label);
    }
  }

  /**
   * Build an HttpClient bound to the ORIGIN of an absolute OIDC endpoint URL
   * and return the request path relative to it. Endpoints are full URLs (they
   * can be swapped per provider or refreshed by `discover()`), while
   * HttpClient wants `{ baseUrl, path }` — so we split at request time.
   */
  private clientFor(endpointUrl: string): { client: HttpClient; path: string } {
    const u = new URL(endpointUrl);
    const client = new HttpClient({
      baseUrl: u.origin,
      fetch: this.fetchImpl,
      timeoutMs: OIDC_TIMEOUT_MS,
    });
    return { client, path: `${u.pathname}${u.search}` };
  }

  /**
   * Map a core transport error into the Mi Argentina taxonomy, preserving the
   * existing `code` values callers switch on.
   *
   * - `ArAgentsResponseValidationError` (malformed body) → surface LOUD as-is,
   *   never swallowed into a fabricated clean token/profile.
   * - `ArAgentsAuthError` (401/403) → the operation's `*_failed` auth error,
   *   carrying the status so callers can branch relogin-on-401.
   * - `ArAgentsRateLimitError` (429) → the operation's `*_failed` with status.
   * - `ArAgentsProtocolError`: `.status` a number → `*_failed` with status +
   *   body; `.status` null (network / timeout) → `network_error`.
   */
  private mapCoreError(
    err: unknown,
    failCode: MiArgentinaErrorCode,
    label: string,
  ): unknown {
    if (err instanceof ArAgentsResponseValidationError) {
      return err;
    }
    if (err instanceof ArAgentsAuthError) {
      const status = err.context["status"];
      return new MiArgentinaError(failCode, `${label} rejected: not authorized`, {
        status,
        body: err.context["body"],
      });
    }
    if (err instanceof ArAgentsRateLimitError) {
      return new MiArgentinaError(failCode, `${label} rate-limited`, {
        status: 429,
        retryAfterMs: err.retryAfterMs,
        body: err.context["body"],
      });
    }
    if (err instanceof ArAgentsProtocolError) {
      if (err.status === null) {
        return new MiArgentinaError(
          "network_error",
          `${label} failed: network error or timeout`,
          { cause: err.message },
        );
      }
      return new MiArgentinaError(
        failCode,
        `${label} failed: HTTP ${err.status}`,
        { status: err.status, body: err.context["body"] },
      );
    }
    return err;
  }

  private async getJwks(): Promise<JwksDocument> {
    const fiveMinutes = 5 * 60 * 1000;
    if (this.cachedJwks && Date.now() - this.cachedJwksAt < fiveMinutes) {
      return this.cachedJwks;
    }
    const json = await this.httpJson<JwksDocument>(
      this.endpoints.jwksUri,
      { method: "GET" },
      "discovery_failed",
      "JWKS fetch",
    );
    this.cachedJwks = json;
    this.cachedJwksAt = Date.now();
    return json;
  }
}

function resolveEndpoints(config: MiArgentinaConfig): OidcEndpoints {
  if (config.endpoints) return config.endpoints;
  switch (config.provider ?? "miargentina") {
    case "miargentina":
      return MI_ARGENTINA_ENDPOINTS_PROD;
    case "miargentina_sandbox":
      return MI_ARGENTINA_ENDPOINTS_SANDBOX;
    case "custom":
      throw new MiArgentinaError(
        "config_missing",
        "provider: 'custom' requires explicit `endpoints` to be set in MiArgentinaConfig.",
      );
  }
}

function mapUserInfo(raw: Record<string, unknown>): MiArgentinaUserProfile {
  const profile: MiArgentinaUserProfile = {
    sub: String(raw["sub"] ?? ""),
    raw,
  };
  if (typeof raw["cuil"] === "string") profile.cuil = raw["cuil"];
  if (typeof raw["dni"] === "string") profile.dni = raw["dni"];
  if (typeof raw["nombres"] === "string") profile.nombres = raw["nombres"];
  if (typeof raw["apellidos"] === "string") profile.apellidos = raw["apellidos"];
  if (typeof raw["name"] === "string") profile.name = raw["name"];
  if (typeof raw["email"] === "string") profile.email = raw["email"];
  if (typeof raw["email_verified"] === "boolean") profile.emailVerified = raw["email_verified"];
  if (typeof raw["phone_number"] === "string") profile.phoneNumber = raw["phone_number"];
  if (typeof raw["fecha_nacimiento"] === "string") profile.fechaNacimiento = raw["fecha_nacimiento"];
  if (raw["sexo"] === "M" || raw["sexo"] === "F") profile.sexo = raw["sexo"];
  if (raw["domicilio"] && typeof raw["domicilio"] === "object") {
    profile.domicilio = raw["domicilio"] as NonNullable<MiArgentinaUserProfile["domicilio"]>;
  }
  return profile;
}
