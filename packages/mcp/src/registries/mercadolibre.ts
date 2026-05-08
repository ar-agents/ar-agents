import { MeliClient, type AuthMode } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/mercadolibre tools for the MCP server.
 *
 * Auth resolution priority:
 *   1. MELI_ACCESS_TOKEN — direct bearer token (shortest path).
 *   2. MELI_APP_ID + MELI_APP_SECRET + MELI_USER_ID — managed OAuth (needs an
 *      OAuthTokenStore implementation, omitted here since the MCP host is
 *      stateless).
 *   3. None — `auth: { kind: "none" }` for public endpoints only.
 *
 * For day-to-day MCP usage, MELI_ACCESS_TOKEN is what users will set.
 *
 * MELI_SITE_ID + MELI_SELLER_ID are read at tool-build time so prompts like
 * "list my unanswered questions" don't need the user to repeat their id.
 */
export function buildMercadoLibreTools(): ToolSet | null {
  const accessToken = process.env.MELI_ACCESS_TOKEN?.trim();
  const sellerId = Number.parseInt(process.env.MELI_SELLER_ID ?? "", 10);
  const siteId = (process.env.MELI_SITE_ID?.trim() ?? "MLA") as
    | "MLA"
    | "MLB"
    | "MLM"
    | "MLC"
    | "MCO"
    | "MLU"
    | "MPE";

  if (!accessToken) return null;
  if (!Number.isFinite(sellerId)) return null;

  const auth: AuthMode = { kind: "bearer", accessToken };
  const client = new MeliClient({ auth });
  return meliTools(client, { siteId, sellerId }) as ToolSet;
}

export function describeMercadoLibreConfig(): string {
  const accessToken = process.env.MELI_ACCESS_TOKEN?.trim();
  const sellerId = process.env.MELI_SELLER_ID?.trim();
  const siteId = process.env.MELI_SITE_ID?.trim() ?? "MLA";
  if (!accessToken || !sellerId) {
    return "not configured (set MELI_ACCESS_TOKEN + MELI_SELLER_ID; optionally MELI_SITE_ID)";
  }
  const tail = accessToken.slice(-6);
  return `site=${siteId} seller=${sellerId} token=…${tail}`;
}
