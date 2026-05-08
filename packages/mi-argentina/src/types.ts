/**
 * Public types for `@ar-agents/mi-argentina`.
 *
 * Mi Argentina implements OpenID Connect 1.0 over OAuth 2.0. The endpoints
 * exposed here mirror the OIDC standard plus the AR-specific claim shape
 * (cuil, dni, nombres, apellidos, etc.).
 */

export interface MiArgentinaConfig {
  /** OAuth 2.0 client_id, registered with Mi Argentina developer portal. */
  clientId: string;
  /** OAuth 2.0 client_secret. Server-side only — never ship to the browser. */
  clientSecret: string;
  /**
   * Redirect URI registered with Mi Argentina. Must EXACTLY match the value
   * configured in the developer portal — including trailing slashes and
   * `http`/`https` scheme. Mi Argentina rejects mismatches without an
   * informative error, so verify carefully.
   */
  redirectUri: string;
  /**
   * Provider preset. `"miargentina"` uses Mi Argentina's documented
   * endpoints; `"custom"` requires `endpoints` to be set explicitly. Useful
   * for swapping in a sandbox / staging tenant or for other AR OIDC
   * providers that share the same shape (e.g., Cl@ve once it lands).
   *
   * Default: `"miargentina"`.
   */
  provider?: "miargentina" | "miargentina_sandbox" | "custom";
  /**
   * Override the OIDC endpoints. Required when `provider: "custom"`. When
   * omitted, the package uses the documented Mi Argentina endpoints. You
   * can also leave `endpoints` undefined and let the client discover them
   * from `<issuer>/.well-known/openid-configuration` — that's the most
   * resilient path against endpoint changes.
   */
  endpoints?: OidcEndpoints;
  /**
   * Default scopes requested in the authorization URL. Defaults to
   * `["openid", "profile", "email"]`. Mi Argentina also supports
   * AR-specific scopes (e.g., `cuil`, `dni`, `domicilio`, `educacion`).
   * Request only what you need — Mi Argentina shows users a consent
   * screen listing each scope.
   */
  defaultScopes?: string[];
  /**
   * Optional ID-token issuer override. When set, the JWT verifier requires
   * `iss` to match exactly. Defaults to the provider preset's issuer.
   */
  issuer?: string;
}

/**
 * OIDC endpoints. Discoverable via `<issuer>/.well-known/openid-configuration`
 * — this type matches the standard discovery document shape.
 */
export interface OidcEndpoints {
  /** OAuth 2.0 authorization endpoint. User-agent redirects here. */
  authorizationEndpoint: string;
  /** OAuth 2.0 token endpoint. Server-side POST to exchange code for tokens. */
  tokenEndpoint: string;
  /** OIDC userinfo endpoint. GET with Bearer access token. */
  userinfoEndpoint: string;
  /** RFC 7517 JWKS endpoint for ID-token signature verification. */
  jwksUri: string;
  /** End-session endpoint, when supported. Optional — not all providers have one. */
  endSessionEndpoint?: string;
  /** ID token issuer; matched against the `iss` claim during verification. */
  issuer: string;
}

/** Authorization-URL builder input. */
export interface AuthorizationRequest {
  /** Override the configured scopes for this single request. */
  scope?: string[];
  /**
   * Opaque caller-supplied state. When omitted, a 16-byte random value is
   * generated. Stored alongside the PKCE verifier; the callback handler
   * MUST verify the returned `state` matches.
   */
  state?: string;
  /**
   * OIDC nonce. When omitted, a 16-byte random value is generated and
   * stored. The callback verifies the ID token's `nonce` claim matches.
   */
  nonce?: string;
  /** OIDC `prompt` parameter (none, login, consent, select_account). */
  prompt?: "none" | "login" | "consent" | "select_account";
  /** Optional locale hint. Mi Argentina supports `es-AR` (default) and `en`. */
  uiLocales?: string;
  /** Optional `login_hint` to pre-fill the form. */
  loginHint?: string;
}

/** Output of `client.getAuthorizationUrl()`. */
export interface AuthorizationUrlResult {
  /** Fully-qualified URL to redirect the user-agent to. */
  url: string;
  /** Opaque state value the caller must compare against the callback. */
  state: string;
  /** Nonce value the verifier will require in the ID token. */
  nonce: string;
  /** PKCE code verifier — kept server-side, swapped for tokens at exchange. */
  codeVerifier: string;
  /** Scopes requested. */
  scope: string[];
}

/** Token response from the OIDC `/token` endpoint. */
export interface TokenResponse {
  accessToken: string;
  /** Always "Bearer" in practice. */
  tokenType: string;
  /** Lifetime in seconds. */
  expiresIn: number;
  /** Compact JWT. Verify before trusting any claim. */
  idToken: string;
  /** Optional refresh token; present when `offline_access` scope was requested. */
  refreshToken?: string;
  /** Space-separated scopes that were actually granted. */
  scope: string;
}

/**
 * Subset of OIDC + Mi Argentina claims exposed on the userinfo response.
 * Always tied to a verified ID token — never trust without verification.
 */
export interface MiArgentinaUserProfile {
  /** Stable per-user identifier within Mi Argentina. */
  sub: string;
  /** CUIL (Clave Única de Identificación Laboral). 11 bare digits. */
  cuil?: string;
  /** DNI (Documento Nacional de Identidad). 7-8 digits. */
  dni?: string;
  /** Given names. */
  nombres?: string;
  /** Family names. */
  apellidos?: string;
  /** Full display name. */
  name?: string;
  email?: string;
  emailVerified?: boolean;
  phoneNumber?: string;
  /** Birth date in ISO 8601 (`YYYY-MM-DD`). */
  fechaNacimiento?: string;
  /** Sexo (M / F). */
  sexo?: "M" | "F";
  /** Domicilio claim — when scope `domicilio` was granted. */
  domicilio?: {
    calle?: string;
    numero?: string;
    piso?: string;
    departamento?: string;
    localidad?: string;
    provincia?: string;
    codigoPostal?: string;
  };
  /** Raw claims as returned, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** Verified ID token result. */
export interface VerifiedIdToken {
  header: { alg: string; kid?: string; typ?: string };
  claims: {
    iss: string;
    sub: string;
    aud: string | string[];
    exp: number;
    iat: number;
    nonce?: string;
    [key: string]: unknown;
  };
}

/**
 * Storage for the OAuth state, nonce, and PKCE code_verifier between the
 * authorization redirect and the callback. Pluggable — the package ships
 * an `InMemoryStateAdapter` for dev and tests; production should use
 * `VercelKVStateAdapter` or implement against your own store.
 *
 * Keys are the OAuth `state` value (cryptographically random, 32+ chars).
 */
export interface MiArgentinaStateAdapter {
  put(state: string, value: StoredAuthState, ttlSeconds: number): Promise<void>;
  /** Returns null when the entry has expired or never existed. Atomically deletes on read. */
  consume(state: string): Promise<StoredAuthState | null>;
}

export interface StoredAuthState {
  nonce: string;
  codeVerifier: string;
  redirectUri: string;
  scope: string[];
  /** Optional caller payload (e.g., return-to URL after login). */
  payload?: Record<string, unknown>;
  createdAt: number;
}
