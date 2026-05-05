import {
  InMemoryStateAdapter,
  MercadoPagoClient,
  mercadoPagoTools,
} from "@ar-agents/mercadopago";
import type { ToolSet } from "ai";

/**
 * Build @ar-agents/mercadopago tools if MP_ACCESS_TOKEN is set.
 * Returns null when not configured.
 */
export function buildMercadoPagoTools(): ToolSet | null {
  const accessToken = process.env.MP_ACCESS_TOKEN?.trim();
  if (!accessToken) return null;
  const client = new MercadoPagoClient({ accessToken });
  const backUrl = process.env.MP_BACK_URL?.trim() ?? "https://example.com/done";
  return mercadoPagoTools(client, {
    state: new InMemoryStateAdapter(),
    backUrl,
  }) as ToolSet;
}

export function describeMercadoPagoConfig(): string {
  const token = process.env.MP_ACCESS_TOKEN?.trim();
  if (!token) return "not configured (set MP_ACCESS_TOKEN)";
  const isTest = token.startsWith("TEST-");
  const backUrl = process.env.MP_BACK_URL?.trim();
  return `${isTest ? "TEST" : "PROD"} mode${backUrl ? ` · back_url=${backUrl}` : " · using default back_url"}`;
}
