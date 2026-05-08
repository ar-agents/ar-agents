import {
  boletinOficialTools,
  InMemoryBoSubscriptionAdapter,
  LiveBoFetcher,
  UnconfiguredBoFetcher,
  type BoFetcher,
} from "@ar-agents/boletin-oficial";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/boletin-oficial tool set.
 *
 * The Boletín Oficial is a public website with no auth — `LiveBoFetcher`
 * is enabled by default. Set `AR_AGENTS_BO_DISABLED=1` to opt out (the
 * tools then return `available: false` via `UnconfiguredBoFetcher`).
 *
 * Subscription storage defaults to in-memory (fine for single-process
 * stdio MCP). For shared subscriptions across instances, implement
 * `BoSubscriptionAdapter` against your store and wire directly via the
 * library API.
 */
export function buildBoletinOficialTools(): ToolSet {
  const fetcher = buildFetcher();
  return boletinOficialTools({
    fetcher,
    subscriptions: new InMemoryBoSubscriptionAdapter(),
  }) as ToolSet;
}

function buildFetcher(): BoFetcher {
  if (process.env.AR_AGENTS_BO_DISABLED?.trim() === "1") {
    return new UnconfiguredBoFetcher();
  }
  return new LiveBoFetcher();
}

export function describeBoletinOficialConfig(): string {
  if (process.env.AR_AGENTS_BO_DISABLED?.trim() === "1") {
    return "disabled (AR_AGENTS_BO_DISABLED=1; subscriptions still callable but search returns empty)";
  }
  return "search + subscribe via LiveBoFetcher (boletinoficial.gob.ar)";
}
