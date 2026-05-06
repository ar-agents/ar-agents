import {
  bankingTools,
  BcraPublicApiAdapter,
  type BcraDeudaAdapter,
} from "@ar-agents/banking";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/banking tool set.
 *
 * Pure-algorithm tools (validate_cbu, lookup_bank_by_code, list_banks,
 * list_psps) are ALWAYS available — no env vars required.
 *
 * The BCRA Central de Deudores tool is wired to `BcraPublicApiAdapter`
 * by default (BCRA's public REST API needs no auth). To opt out, set
 * `AR_AGENTS_BCRA_DISABLED=1` in env — the tool then returns
 * `{ available: false, error: "<setup instructions>" }`.
 */
export function buildBankingTools(): ToolSet {
  const bcra = buildBcraAdapter();
  return bankingTools(bcra ? { bcra } : {}) as ToolSet;
}

function buildBcraAdapter(): BcraDeudaAdapter | undefined {
  if (process.env.AR_AGENTS_BCRA_DISABLED?.trim() === "1") return undefined;
  const timeout = Number(process.env.BCRA_TIMEOUT_MS?.trim() ?? "30000");
  const retries = Number(process.env.BCRA_MAX_RETRIES?.trim() ?? "1");
  return new BcraPublicApiAdapter({
    requestTimeoutMs: Number.isFinite(timeout) ? timeout : 30_000,
    maxRetries: Number.isFinite(retries) ? retries : 1,
  });
}

export function describeBankingConfig(): string {
  const bcraDisabled = process.env.AR_AGENTS_BCRA_DISABLED?.trim() === "1";
  return bcraDisabled
    ? "validate_cbu, lookup_bank_by_code, list_banks, list_psps (BCRA disabled)"
    : "validate_cbu, lookup_bank_by_code, list_banks, list_psps, lookup_credit_situation (BCRA public API)";
}
