import { facturacionTools, WsfeClient } from "@ar-agents/facturacion";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/facturacion tool set from environment variables.
 *
 * AFIP cert + key + CUIT required (same as @ar-agents/identity, but the
 * service must be authorized for `wsfe` in addition to whatever padron
 * service identity uses). When the env vars are missing, the tools return
 * `{ available: false, error: <setup instructions> }` instead of crashing —
 * MCP host can show the user what to set.
 *
 * # Env vars
 *
 * - `AFIP_CUIT_REPRESENTADO` (required)
 * - `AFIP_CERT_PEM` + `AFIP_KEY_PEM` (preferred for serverless / MCP) OR
 * - `AFIP_CERT_PATH` + `AFIP_KEY_PATH` (for local dev)
 * - `AFIP_ENV` — "homo" | "prod" (default "prod")
 * - `WSFE_DEFAULT_PTOVTA` — default punto de venta (optional, recommended for
 *   single-PtoVta SaaS so agents don't have to remember it)
 * - `WSFE_TIMEOUT_MS` — default 30000
 * - `WSFE_MAX_RETRIES` — default 1
 */
export function buildFacturacionTools(): ToolSet {
  const wsfe = buildWsfeClient();
  const defaultPtoVta = Number(
    process.env.WSFE_DEFAULT_PTOVTA?.trim() ?? "0",
  );
  const opts: Parameters<typeof facturacionTools>[0] = {};
  if (wsfe) opts.wsfe = wsfe;
  if (Number.isFinite(defaultPtoVta) && defaultPtoVta > 0)
    opts.defaultPtoVta = defaultPtoVta;
  return facturacionTools(opts) as ToolSet;
}

function buildWsfeClient(): WsfeClient | undefined {
  const cuit = process.env.AFIP_CUIT_REPRESENTADO?.trim();
  if (!cuit) return undefined;
  const env = (process.env.AFIP_ENV?.trim() ?? "prod") as "homo" | "prod";
  const timeout = Number(process.env.WSFE_TIMEOUT_MS?.trim() ?? "30000");
  const retries = Number(process.env.WSFE_MAX_RETRIES?.trim() ?? "1");
  const certPem = process.env.AFIP_CERT_PEM;
  const keyPem = process.env.AFIP_KEY_PEM;
  if (certPem && keyPem) {
    return new WsfeClient({
      certPem,
      keyPem,
      cuit,
      env,
      requestTimeoutMs: Number.isFinite(timeout) ? timeout : 30_000,
      maxRetries: Number.isFinite(retries) ? retries : 1,
    });
  }
  const certPath = process.env.AFIP_CERT_PATH?.trim();
  const keyPath = process.env.AFIP_KEY_PATH?.trim();
  if (certPath && keyPath) {
    return new WsfeClient({
      certPath,
      keyPath,
      cuit,
      env,
      requestTimeoutMs: Number.isFinite(timeout) ? timeout : 30_000,
      maxRetries: Number.isFinite(retries) ? retries : 1,
    });
  }
  return undefined;
}

export function describeFacturacionConfig(): string {
  const cuit = process.env.AFIP_CUIT_REPRESENTADO?.trim();
  if (!cuit) return "no configurado (faltan AFIP_CUIT_REPRESENTADO + cert)";
  const certConfigured =
    !!process.env.AFIP_CERT_PEM || !!process.env.AFIP_CERT_PATH;
  if (!certConfigured) return "no configurado (falta AFIP_CERT_PEM o AFIP_CERT_PATH)";
  const ptovta = process.env.WSFE_DEFAULT_PTOVTA?.trim();
  return `WSFE habilitado (CUIT ${cuit}${ptovta ? `, PtoVta ${ptovta}` : ""})`;
}
