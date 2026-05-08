import { firmaDigitalTools } from "@ar-agents/firma-digital";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/firma-digital tool set. All tools are pure
 * verification primitives — no env vars required. Always enabled, unless
 * `AR_AGENTS_FIRMA_DIGITAL_DISABLED=1`.
 */
export function buildFirmaDigitalTools(): ToolSet | null {
  if (process.env.AR_AGENTS_FIRMA_DIGITAL_DISABLED?.trim() === "1") {
    return null;
  }
  return firmaDigitalTools() as ToolSet;
}

export function describeFirmaDigitalConfig(): string {
  if (process.env.AR_AGENTS_FIRMA_DIGITAL_DISABLED?.trim() === "1") {
    return "disabled (AR_AGENTS_FIRMA_DIGITAL_DISABLED=1)";
  }
  return "X.509 + CMS verification (no I/O, pure primitives)";
}
