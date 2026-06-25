/**
 * Vercel Connect credential broker for the society's external services.
 *
 * Instead of storing a long-lived provider token in an env var, a society can
 * exchange its deployment's OIDC identity for a SCOPED, SHORT-LIVED token at
 * runtime (see https://vercel.com/blog/introducing-vercel-connect). Every token
 * is per-request, auto-refreshed, and the Connect audit log ties each call back
 * to this society — a much smaller blast radius than a static secret.
 *
 * Provider fit for ar-agents:
 *   - MercadoPago, WhatsApp/Meta  -> Connect generic-OAuth connectors (here).
 *   - AFIP/ARCA                   -> stays custom (cert-based WSAA, not OAuth);
 *                                    see clients.ts getWsfeClient/getAfipPadronAdapter.
 *
 * Activation (founder / Vercel-side, one-time per connector):
 *   vercel connect create <generic-oauth> --name mercadopago
 *   # then set MERCADOPAGO_CONNECT_CONNECTOR=mercadopago/<name> in the project.
 * Until a connector is configured this falls back to the long-lived env token,
 * so nothing breaks before Connect is switched on.
 */

import { getToken } from "@vercel/connect";

export interface ResolveServiceTokenInput {
  /** Vercel Connect connector name (e.g. "mercadopago/main"). When set, the
   *  token is fetched from Connect; the env fallback is ignored. */
  connector?: string | undefined;
  /** Long-lived fallback token from env, used only when no connector is set. */
  envToken?: string | undefined;
}

/**
 * Resolve a service credential, Connect-first. Returns the token string, or
 * null when neither a connector nor an env token is configured. The token is
 * short-lived when it comes from Connect — fetch it per use, never persist it.
 */
export async function resolveServiceToken(
  input: ResolveServiceTokenInput,
): Promise<string | null> {
  const connector = input.connector?.trim();
  if (connector) {
    // `subject: { type: "app" }` = act as the society itself (not an end user).
    return await getToken(connector, { subject: { type: "app" } });
  }
  const env = input.envToken?.trim();
  return env && env.length > 0 ? env : null;
}
