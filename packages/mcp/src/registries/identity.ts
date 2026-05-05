import { identityTools, type AfipPadronAdapter } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/identity tool set from environment variables.
 * Returns null when AFIP env vars are missing (the algorithm-only `validate_cuit`
 * is always available; lookup_cuit_afip falls back to UnconfiguredAfipPadronAdapter).
 */
export function buildIdentityTools(): ToolSet {
  const afip = buildAfipAdapter();
  return identityTools(afip ? { afip } : {}) as ToolSet;
}

function buildAfipAdapter(): AfipPadronAdapter | undefined {
  const cuit = process.env.AFIP_CUIT_REPRESENTADO?.trim();
  if (!cuit) return undefined;
  const env = (process.env.AFIP_ENV?.trim() ?? "prod") as "homo" | "prod";
  const certPem = process.env.AFIP_CERT_PEM;
  const keyPem = process.env.AFIP_KEY_PEM;
  if (certPem && keyPem) {
    return new WsaaWscdcAfipPadronAdapter({ certPem, keyPem, cuitRepresentado: cuit, env });
  }
  const certPath = process.env.AFIP_CERT_PATH?.trim();
  const keyPath = process.env.AFIP_KEY_PATH?.trim();
  if (certPath && keyPath) {
    return new WsaaWscdcAfipPadronAdapter({ certPath, keyPath, cuitRepresentado: cuit, env });
  }
  return undefined;
}

export function describeIdentityConfig(): string {
  const cuit = process.env.AFIP_CUIT_REPRESENTADO?.trim();
  if (!cuit) return "validate_cuit only (no AFIP cert configured)";
  const certConfigured =
    !!process.env.AFIP_CERT_PEM || !!process.env.AFIP_CERT_PATH;
  return certConfigured
    ? `validate_cuit + lookup_cuit_afip (AFIP cert configured for CUIT ${cuit})`
    : `validate_cuit only (cert not configured)`;
}
