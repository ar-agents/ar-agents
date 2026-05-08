import {
  gdeTadTools,
  UnconfiguredDomicilioAdapter,
  UnconfiguredTramitesAdapter,
} from "@ar-agents/gde-tad";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/gde-tad tool set.
 *
 * As of 2026-05, the read-side adapters (Domicilio Electrónico inbox,
 * Mis Trámites) require per-organism integration that's still rolling
 * out. The MCP bundle wires the unconfigured shims by default — the
 * `validate_igj_inscription` tool (algorithm-only, no auth) works
 * regardless; the read tools return `available: false` with a setup
 * hint until you wire your own DomicilioAdapter / TramitesAdapter.
 *
 * Set `AR_AGENTS_GDE_TAD_DISABLED=1` to omit the entire surface from
 * the MCP server.
 */
export function buildGdeTadTools(): ToolSet {
  if (process.env.AR_AGENTS_GDE_TAD_DISABLED?.trim() === "1") {
    return {} as ToolSet;
  }
  return gdeTadTools({
    domicilio: new UnconfiguredDomicilioAdapter(),
    tramites: new UnconfiguredTramitesAdapter(),
  }) as ToolSet;
}

export function describeGdeTadConfig(): string {
  if (process.env.AR_AGENTS_GDE_TAD_DISABLED?.trim() === "1") {
    return "disabled (AR_AGENTS_GDE_TAD_DISABLED=1)";
  }
  return "validate_igj_inscription (algorithm-only) wired; DEC inbox + Mis Trámites in unconfigured stub mode (RFC-001 § 3.4)";
}
