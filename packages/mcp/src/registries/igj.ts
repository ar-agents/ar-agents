import { igjTools, LiveCkanFetcher, UnconfiguredIgjFetcher, type IgjFetcher } from "@ar-agents/igj";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/igj tool set. The CKAN endpoint at
 * datos.jus.gob.ar requires no auth — `LiveCkanFetcher` is enabled by
 * default. Set `AR_AGENTS_IGJ_DISABLED=1` to opt out (tools then return
 * empty results via `UnconfiguredIgjFetcher`).
 */
export function buildIgjTools(): ToolSet {
  const fetcher = buildFetcher();
  return igjTools({ fetcher }) as ToolSet;
}

function buildFetcher(): IgjFetcher {
  if (process.env.AR_AGENTS_IGJ_DISABLED?.trim() === "1") {
    return new UnconfiguredIgjFetcher();
  }
  return new LiveCkanFetcher();
}

export function describeIgjConfig(): string {
  if (process.env.AR_AGENTS_IGJ_DISABLED?.trim() === "1") {
    return "disabled (AR_AGENTS_IGJ_DISABLED=1)";
  }
  return "search + fetch via datos.jus.gob.ar CKAN (sample dataset, not real-time)";
}
