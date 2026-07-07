/**
 * Mercado Pago OAuth flow — for marketplace integrations where YOUR app
 * cobra a través de cuentas MP de terceros (sellers in your platform).
 *
 * # The flow (3 legs)
 *
 * 1. **Authorize URL** — Redirect the seller to `buildAuthorizeUrl()`. They
 *    log in to MP and approve your app. MP redirects them back to your
 *    `redirect_uri` with `?code=AUTH_CODE&state=YOUR_STATE`.
 * 2. **Code exchange** — Your server POSTs to `/oauth/token` via
 *    `exchangeCodeForToken()` with the code. Returns `{ access_token,
 *    refresh_token, user_id, expires_in (~6h), ... }`. **Persist all of it.**
 * 3. **Token refresh** — Before `expires_in` runs out (or on 401), call
 *    `refreshAccessToken()` with the saved `refresh_token` to get a fresh
 *    access_token. The refresh_token does NOT expire and is the only way
 *    to keep the integration alive long-term.
 *
 * # Per-seller MercadoPagoClient
 *
 * Once you have an OAuth `access_token` for a seller, instantiate a
 * `MercadoPagoClient({ accessToken })` AS THAT SELLER. All API calls then
 * happen on the seller's behalf — payments, refunds, subscriptions,
 * everything.
 *
 * # Marketplace fee
 *
 * To take a fee while collecting on the seller's behalf, pass
 * `marketplace`, `marketplaceFee`, `collectorId` to `createPreference()`
 * or `createOrder()`. See `MarketplaceParams` for details.
 *
 * # Setup
 *
 * 1. Register your application in MP's dev panel
 *    (https://www.mercadopago.com.ar/developers/panel/applications) to get
 *    `clientId` (= application id) and `clientSecret`.
 * 2. Configure the `redirect_uri` whitelist in the same panel — MP rejects
 *    redirects to URIs not whitelisted.
 * 3. Pick a `marketplace` identifier (used in fee routing).
 */

import { MercadoPagoError } from "./errors";
import { OAuthTokenSchema, type OAuthToken } from "./types";

const DEFAULT_AUTHORIZE_URL = "https://auth.mercadopago.com.ar/authorization";
const DEFAULT_TOKEN_URL = "https://api.mercadopago.com/oauth/token";

/**
 * Build the URL the seller visits to authorize your app. Redirect them here.
 * On approval, MP redirects them to `redirect_uri?code=...&state=...`.
 *
 * @param state Optional opaque value echoed back in the redirect — use this
 *              to bind the OAuth round-trip to a specific user/session and
 *              prevent CSRF. Always set it in production.
 */
export function buildAuthorizeUrl(params: {
  /** Your app's client ID (= application id from MP dev panel). */
  clientId: string;
  /** Where MP redirects after approval. Must be whitelisted in MP panel. */
  redirectUri: string;
  /** CSRF / session-binding token, echoed back. Strongly recommended. */
  state?: string;
  /**
   * Override the authorize endpoint base. Default points to AR; for other
   * sites use `https://auth.mercadopago.com.{br,mx,co,cl,uy}/authorization`.
   */
  authorizeUrl?: string;
}): string {
  const url = new URL(params.authorizeUrl ?? DEFAULT_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("redirect_uri", params.redirectUri);
  if (params.state) url.searchParams.set("state", params.state);
  return url.toString();
}

/**
 * Exchange the authorization code (from the OAuth redirect) for an
 * `OAuthToken`. POSTs to `/oauth/token` with `grant_type=authorization_code`.
 *
 * **Persist the entire response** — the `refresh_token` is the only way to
 * keep the integration alive long-term, and `user_id` identifies the seller.
 */
export async function exchangeCodeForToken(params: {
  clientId: string;
  clientSecret: string;
  /** The `code` query param from the OAuth redirect. */
  code: string;
  /** Must match the `redirect_uri` used in `buildAuthorizeUrl`. */
  redirectUri: string;
  /** Override the token endpoint (testing). */
  tokenUrl?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
}): Promise<OAuthToken> {
  const url = params.tokenUrl ?? DEFAULT_TOKEN_URL;
  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: params.clientId,
      client_secret: params.clientSecret,
      code: params.code,
      redirect_uri: params.redirectUri,
    }).toString(),
  });
  return parseTokenResponse(res);
}

/**
 * Refresh an access_token using the saved refresh_token. Call this
 * proactively before `expires_in` runs out, or reactively on a 401 from a
 * per-seller MercadoPagoClient.
 *
 * The new response includes a fresh `refresh_token` — **always persist it,
 * replacing the old one**, even though MP often returns the same value.
 */
export async function refreshAccessToken(params: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  tokenUrl?: string;
  fetchImpl?: typeof fetch;
}): Promise<OAuthToken> {
  const url = params.tokenUrl ?? DEFAULT_TOKEN_URL;
  const fetchFn = params.fetchImpl ?? globalThis.fetch;
  const res = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: params.clientId,
      client_secret: params.clientSecret,
      refresh_token: params.refreshToken,
    }).toString(),
  });
  return parseTokenResponse(res);
}

async function parseTokenResponse(res: Response): Promise<OAuthToken> {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(
      `MP OAuth ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  // The body is provider-controlled input: a malformed (non-JSON) 2xx body
  // must surface as the package's typed error, not a raw SyntaxError.
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new MercadoPagoError(
      `MP OAuth ${res.status}: token response is not valid JSON: ${text.slice(0, 300)}`,
      res.status,
      "/oauth/token",
      text.slice(0, 300),
    );
  }
  return OAuthTokenSchema.parse(json);
}

/**
 * Compute when an access_token will expire, given the timestamp it was
 * issued and the `expires_in` value (in seconds).
 *
 * @returns A unix-ms timestamp.
 */
export function expirationTimeMs(
  issuedAtMs: number,
  expiresInSeconds: number | undefined,
): number {
  return issuedAtMs + (expiresInSeconds ?? 21_600) * 1000;
}

/**
 * Check whether an access_token is close to expiring. Use this to decide
 * whether to proactively refresh BEFORE making an API call.
 *
 * @param skewSeconds Buffer to refresh early (default 5 min). MP tokens
 *                    typically last 6h; refreshing in the last 5 min avoids
 *                    races with API calls that take a few seconds.
 */
export function isExpiringSoon(
  expirationMs: number,
  skewSeconds = 300,
): boolean {
  return Date.now() + skewSeconds * 1000 >= expirationMs;
}
