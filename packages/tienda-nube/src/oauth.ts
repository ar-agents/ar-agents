/**
 * Tienda Nube OAuth helpers — pure functions, no network at build
 * time except for `exchangeCodeForToken`.
 *
 * # Flow
 *
 * 1. Build the authorize URL with `buildAuthorizeUrl({ appId, state })`
 * 2. Redirect the merchant there. They approve.
 * 3. Tienda Nube sends them back to your app's redirect_uri with a
 *    `?code=...&state=...` query string.
 * 4. Verify `state` matches what you stored, then exchange the code
 *    for an access token + store id.
 * 5. Persist the `OAuthTokenSet`; pass `{ storeId, accessToken }` to
 *    HttpTiendaNubeAdapter.
 *
 * Tienda Nube access tokens do NOT expire — there's no refresh flow.
 * They get invalidated when the merchant uninstalls the app (you
 * should listen for the `app/uninstalled` webhook to clean up).
 */

import type { OAuthAuthorizeArgs, OAuthExchangeArgs, OAuthTokenSet } from "./types";
import { TiendaNubeAuthError, TiendaNubeError } from "./errors";

/**
 * Compose the authorize URL the merchant gets redirected to. The
 * `appId` is the integer id of your Tienda Nube app (Partner Portal
 * → My Apps → Numeric id).
 */
export function buildAuthorizeUrl(args: OAuthAuthorizeArgs): string {
  const u = new URL(
    `https://www.tiendanube.com/apps/${encodeURIComponent(args.appId)}/authorize`,
  );
  u.searchParams.set("state", args.state);
  return u.toString();
}

/**
 * Exchange the `code` from the redirect callback for an access token
 * + store id. Tienda Nube uses a custom JSON-body exchange (not the
 * standard form-urlencoded shape).
 */
export async function exchangeCodeForToken(
  args: OAuthExchangeArgs,
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
): Promise<OAuthTokenSet> {
  const res = await fetchImpl("https://www.tiendanube.com/apps/authorize/token", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      client_id: args.appId,
      client_secret: args.clientSecret,
      grant_type: "authorization_code",
      code: args.code,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401 || res.status === 403) {
    throw new TiendaNubeAuthError(
      "Tienda Nube OAuth rejected client credentials.",
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new TiendaNubeError(
      `Tienda Nube OAuth exchange failed (HTTP ${res.status}): ${body.slice(0, 200)}`,
      { code: "oauth_failed", retryable: false, context: { status: res.status } },
    );
  }
  const raw = (await res.json()) as {
    access_token: string;
    user_id: number;
    scope: string;
  };
  return {
    accessToken: raw.access_token,
    storeId: raw.user_id,
    scope: raw.scope,
    receivedAt: new Date().toISOString(),
  };
}
