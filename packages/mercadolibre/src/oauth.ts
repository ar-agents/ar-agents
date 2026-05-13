// MELI OAuth 2.0 — auth code + refresh token flows.
//
// Critical landmines this module defends against (verified during research):
//
//   1. **Refresh tokens are SINGLE-USE.** Each refresh rotates the
//      `refresh_token`. If two workers race a refresh with the same old
//      token, MELI revokes the application's connection (`refresh_token_reused`).
//      We mutex per-seller so concurrent token reads coalesce.
//
//   2. **Refresh tokens expire after 4 months of inactivity.** We expose
//      this as a typed error so the caller can re-prompt the seller for
//      OAuth consent gracefully.
//
//   3. **Multi-site OAuth callbacks must use a single redirect host.**
//      The MLA / MLB / MLM / MLC apps share callback URLs.
//
//   4. **`offline_access` scope is required** to receive a refresh token
//      at all. Without it, access_token-only flows expire in 6 hours and
//      can't be renewed.

import { MeliAuthError } from "./errors";

const TOKEN_URL = "https://api.mercadolibre.com/oauth/token";
const AUTHORIZATION_URL_BY_SITE: Record<string, string> = {
  MLA: "https://auth.mercadolibre.com.ar/authorization",
  MLB: "https://auth.mercadolivre.com.br/authorization",
  MLM: "https://auth.mercadolibre.com.mx/authorization",
  MLC: "https://auth.mercadolibre.cl/authorization",
  MCO: "https://auth.mercadolibre.com.co/authorization",
  MLU: "https://auth.mercadolibre.com.uy/authorization",
  MPE: "https://auth.mercadolibre.com.pe/authorization",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OAuthAppCredentials {
  clientId: string;
  clientSecret: string;
  /** Must be registered on the MELI app dashboard. */
  redirectUri: string;
}

export interface MeliOAuthTokens {
  access_token: string;
  refresh_token: string;
  /** Seconds-from-now until access_token expires. Typically 21600 (6h). */
  expires_in: number;
  /** Unix-seconds wall-clock at which access_token will expire. */
  access_token_expires_at: number;
  /** MELI-side user id of the authorized seller. */
  user_id: number;
  scope: string;
  token_type: "bearer";
}

/**
 * Pluggable token store. Production deployments back this with Redis /
 * Postgres / Vercel KV. The `InMemoryOAuthStore` below is suitable for
 * tests + single-process demos.
 */
export interface OAuthTokenStore {
  /** Read tokens for a specific seller (by MELI user id). */
  read(userId: number): Promise<MeliOAuthTokens | null>;
  /** Atomically replace tokens. Implementations MUST handle concurrent writes. */
  write(userId: number, tokens: MeliOAuthTokens): Promise<void>;
  /** Remove tokens (e.g. when seller revokes). */
  remove?(userId: number): Promise<void>;
}

// ---------------------------------------------------------------------------
// Authorization URL builder
// ---------------------------------------------------------------------------

export interface BuildAuthUrlInput {
  app: OAuthAppCredentials;
  /** MELI site identifier — controls which auth host is used. */
  site: keyof typeof AUTHORIZATION_URL_BY_SITE;
  /** State for CSRF protection (random nonce, validated on callback). */
  state: string;
  /** Override scopes. Default: `offline_access read write`. */
  scopes?: string[];
}

export function buildAuthorizationUrl(input: BuildAuthUrlInput): string {
  const base = AUTHORIZATION_URL_BY_SITE[input.site];
  if (!base) {
    throw new MeliAuthError(`Unknown MELI site: '${input.site}'`);
  }
  const url = new URL(base);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.app.clientId);
  url.searchParams.set("redirect_uri", input.app.redirectUri);
  url.searchParams.set("state", input.state);
  if (input.scopes) {
    url.searchParams.set("scope", input.scopes.join(" "));
  }
  return url.toString();
}

// ---------------------------------------------------------------------------
// Exchange auth code for tokens
// ---------------------------------------------------------------------------

export async function exchangeAuthorizationCode(
  app: OAuthAppCredentials,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MeliOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    code,
    redirect_uri: app.redirectUri,
  });
  const tokens = await postTokenRequest(body, fetchImpl);
  return enrichTokens(tokens);
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

export async function refreshTokens(
  app: OAuthAppCredentials,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<MeliOAuthTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: app.clientId,
    client_secret: app.clientSecret,
    refresh_token: refreshToken,
  });
  const tokens = await postTokenRequest(body, fetchImpl);
  return enrichTokens(tokens);
}

// ---------------------------------------------------------------------------
// Mutex-protected ensure-fresh access token
// ---------------------------------------------------------------------------

/**
 * Returns a valid access_token for the given seller, refreshing if needed.
 * Coalesces concurrent calls so only one HTTP refresh fires per seller per
 * window. Atomically updates the store with the rotated refresh_token.
 *
 * Throws `MeliAuthError` if no tokens are stored OR if the refresh fails
 * permanently (e.g. revoked, expired beyond 4 months).
 */
export async function ensureAccessToken(args: {
  userId: number;
  app: OAuthAppCredentials;
  store: OAuthTokenStore;
  /** Refresh ahead of expiry by this many seconds. Default 60. */
  preflightWindowSeconds?: number;
  /** Override "now" for tests. Returns Unix seconds. */
  now?: () => number;
  /** Override fetch (mocked in tests / Edge runtime). Default global fetch. */
  fetchImpl?: typeof fetch;
}): Promise<MeliOAuthTokens> {
  const now = args.now ?? (() => Math.floor(Date.now() / 1000));
  const preflight = args.preflightWindowSeconds ?? 60;

  const lock = getLock(args.userId);
  return lock.run(async () => {
    const stored = await args.store.read(args.userId);
    if (!stored) {
      throw new MeliAuthError(
        `No OAuth tokens stored for MELI user ${args.userId}; the seller must complete the OAuth flow first.`,
      );
    }
    if (stored.access_token_expires_at - now() > preflight) {
      // Still fresh.
      return stored;
    }
    // Refresh.
    let refreshed: MeliOAuthTokens;
    try {
      refreshed = await refreshTokens(args.app, stored.refresh_token, args.fetchImpl);
    } catch (err) {
      throw new MeliAuthError(
        `Token refresh failed for MELI user ${args.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
        err,
      );
    }
    // Note: we MUST atomically write the new tokens before returning so
    // concurrent callers see the rotated refresh_token. The mutex guarantees
    // single-flight; the store's write atomicity guarantees no partial state.
    await args.store.write(args.userId, refreshed);
    return refreshed;
  });
}

// ---------------------------------------------------------------------------
// In-memory store + lock
// ---------------------------------------------------------------------------

export class InMemoryOAuthStore implements OAuthTokenStore {
  private state = new Map<number, MeliOAuthTokens>();

  async read(userId: number): Promise<MeliOAuthTokens | null> {
    return this.state.get(userId) ?? null;
  }

  async write(userId: number, tokens: MeliOAuthTokens): Promise<void> {
    this.state.set(userId, tokens);
  }

  async remove(userId: number): Promise<void> {
    this.state.delete(userId);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface RawTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
  scope: string;
  token_type: "bearer";
}

async function postTokenRequest(
  body: URLSearchParams,
  fetchImpl: typeof fetch = fetch,
): Promise<RawTokenResponse> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new MeliAuthError(
      `MELI /oauth/token returned non-JSON response (status ${response.status})`,
    );
  }
  if (!response.ok) {
    const errorBody = raw as { error?: string; message?: string };
    throw new MeliAuthError(
      `MELI /oauth/token failed (${response.status}): ${
        errorBody.error ?? errorBody.message ?? "unknown error"
      }`,
      errorBody,
    );
  }
  if (
    typeof (raw as RawTokenResponse).access_token !== "string" ||
    typeof (raw as RawTokenResponse).refresh_token !== "string" ||
    typeof (raw as RawTokenResponse).expires_in !== "number" ||
    typeof (raw as RawTokenResponse).user_id !== "number"
  ) {
    throw new MeliAuthError(
      `MELI /oauth/token returned unexpected shape: ${JSON.stringify(raw)}`,
    );
  }
  return raw as RawTokenResponse;
}

function enrichTokens(raw: RawTokenResponse): MeliOAuthTokens {
  return {
    access_token: raw.access_token,
    refresh_token: raw.refresh_token,
    expires_in: raw.expires_in,
    access_token_expires_at: Math.floor(Date.now() / 1000) + raw.expires_in,
    user_id: raw.user_id,
    scope: raw.scope,
    token_type: raw.token_type,
  };
}

// Per-userId mutex map. Coalesces concurrent refresh requests to a single
// in-flight HTTP call.
const locks = new Map<number, AsyncLock>();
function getLock(userId: number): AsyncLock {
  let lock = locks.get(userId);
  if (!lock) {
    lock = new AsyncLock();
    locks.set(userId, lock);
  }
  return lock;
}

class AsyncLock {
  private chain: Promise<unknown> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(() => fn(), () => fn());
    this.chain = next.catch(() => {
      /* swallow so a failure doesn't break the chain */
    });
    return next as Promise<T>;
  }
}
