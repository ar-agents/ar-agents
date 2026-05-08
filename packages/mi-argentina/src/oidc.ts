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
  ConfigMissingError,
  IdTokenInvalidError,
  MiArgentinaError,
  StateMismatchError,
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
    const res = await this.fetchImpl(url, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      throw new MiArgentinaError(
        "discovery_failed",
        `OIDC discovery failed: ${res.status} ${res.statusText} at ${url}`,
      );
    }
    const doc = (await res.json()) as Record<string, unknown>;
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
    const res = await this.fetchImpl(this.endpoints.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new MiArgentinaError(
        "code_exchange_failed",
        `Token exchange failed: HTTP ${res.status} ${res.statusText}`,
        { status: res.status, body: await safeText(res) },
      );
    }
    const json = (await res.json()) as Record<string, unknown>;
    const tokens: TokenResponse = {
      accessToken: String(json["access_token"] ?? ""),
      tokenType: String(json["token_type"] ?? "Bearer"),
      expiresIn: Number(json["expires_in"] ?? 0),
      idToken: String(json["id_token"] ?? ""),
      scope: String(json["scope"] ?? stored.scope.join(" ")),
    };
    if (json["refresh_token"]) tokens.refreshToken = String(json["refresh_token"]);
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
    const res = await this.fetchImpl(this.endpoints.userinfoEndpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
    if (!res.ok) {
      throw new MiArgentinaError(
        "userinfo_failed",
        `Userinfo failed: HTTP ${res.status} ${res.statusText}`,
        { status: res.status, body: await safeText(res) },
      );
    }
    const raw = (await res.json()) as Record<string, unknown>;
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
    const res = await this.fetchImpl(this.endpoints.tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    if (!res.ok) {
      throw new MiArgentinaError(
        "refresh_failed",
        `Refresh failed: HTTP ${res.status} ${res.statusText}`,
        { status: res.status, body: await safeText(res) },
      );
    }
    const json = (await res.json()) as Record<string, unknown>;
    const out: TokenResponse = {
      accessToken: String(json["access_token"] ?? ""),
      tokenType: String(json["token_type"] ?? "Bearer"),
      expiresIn: Number(json["expires_in"] ?? 0),
      idToken: String(json["id_token"] ?? ""),
      scope: String(json["scope"] ?? ""),
    };
    if (json["refresh_token"]) out.refreshToken = String(json["refresh_token"]);
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

  private async getJwks(): Promise<JwksDocument> {
    const fiveMinutes = 5 * 60 * 1000;
    if (this.cachedJwks && Date.now() - this.cachedJwksAt < fiveMinutes) {
      return this.cachedJwks;
    }
    const res = await this.fetchImpl(this.endpoints.jwksUri, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new MiArgentinaError(
        "discovery_failed",
        `JWKS fetch failed: HTTP ${res.status} ${res.statusText}`,
      );
    }
    const json = (await res.json()) as JwksDocument;
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

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
