import {
  InMemoryStateAdapter,
  MiArgentinaClient,
  miArgentinaTools,
} from "@ar-agents/mi-argentina";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/mi-argentina tool set from environment variables.
 *
 * The OAuth flow needs a registered client. Returns null when the env vars
 * are missing — server start logs the absence and the tool isn't exposed.
 *
 * Required:
 *   MI_ARGENTINA_CLIENT_ID
 *   MI_ARGENTINA_CLIENT_SECRET
 *   MI_ARGENTINA_REDIRECT_URI
 *
 * Optional:
 *   MI_ARGENTINA_PROVIDER ("miargentina" | "miargentina_sandbox", default "miargentina")
 *
 * State storage uses in-memory by default (fine for single-process stdio
 * MCP). For multi-instance, swap to VercelKVStateAdapter directly via the
 * library API.
 */
export function buildMiArgentinaTools(): ToolSet | null {
  const clientId = process.env.MI_ARGENTINA_CLIENT_ID?.trim();
  const clientSecret = process.env.MI_ARGENTINA_CLIENT_SECRET?.trim();
  const redirectUri = process.env.MI_ARGENTINA_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) return null;

  const provider =
    (process.env.MI_ARGENTINA_PROVIDER?.trim() as
      | "miargentina"
      | "miargentina_sandbox"
      | undefined) ?? "miargentina";

  const client = new MiArgentinaClient({
    config: { clientId, clientSecret, redirectUri, provider },
    state: new InMemoryStateAdapter(),
  });
  return miArgentinaTools(client) as ToolSet;
}

export function describeMiArgentinaConfig(): string {
  const clientId = process.env.MI_ARGENTINA_CLIENT_ID?.trim();
  if (!clientId)
    return "not configured (set MI_ARGENTINA_CLIENT_ID + _SECRET + _REDIRECT_URI)";
  const provider = process.env.MI_ARGENTINA_PROVIDER?.trim() ?? "miargentina";
  return `client_id=${clientId.slice(0, 6)}… provider=${provider}`;
}
