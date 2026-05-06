import {
  AndreaniAdapter,
  CorreoAdapter,
  OcaAdapter,
  shippingTools,
  type ShippingAdapter,
} from "@ar-agents/shipping";
import type { ToolSet } from "ai";

/**
 * Build the @ar-agents/shipping tool set from environment variables.
 *
 * Each carrier is wired independently — set the env vars for whichever
 * carriers you have credentials for. Without any credentials, the tools
 * return `{ available: false, error }` instead of crashing.
 *
 * # Env vars
 *
 * **Andreani** (full REST API):
 * - `ANDREANI_USERNAME` (required)
 * - `ANDREANI_PASSWORD` (required)
 * - `ANDREANI_CLIENT_NUMBER` (required)
 * - `ANDREANI_ENV` ("homo" | "prod", default "prod")
 *
 * **OCA** (Tarifador only in v0.1):
 * - `OCA_CUIT` (required)
 * - `OCA_OPERATIVA` (required)
 *
 * **Correo Argentino** (public REST, no creds needed):
 * - Auto-wired (no env vars).
 * - Set `AR_AGENTS_CORREO_DISABLED=1` to opt out.
 *
 * **Common**:
 * - `SHIPPING_DEFAULT_CARRIER` ("andreani" | "oca" | "correo_argentino")
 *   — when an agent doesn't specify a carrier, this is used.
 */
export function buildShippingTools(): ToolSet {
  const adapters: Partial<Record<"andreani" | "oca" | "correo_argentino", ShippingAdapter>> = {};

  const andreaniUser = process.env.ANDREANI_USERNAME?.trim();
  const andreaniPass = process.env.ANDREANI_PASSWORD?.trim();
  const andreaniClient = process.env.ANDREANI_CLIENT_NUMBER?.trim();
  if (andreaniUser && andreaniPass && andreaniClient) {
    adapters.andreani = new AndreaniAdapter({
      username: andreaniUser,
      password: andreaniPass,
      clientNumber: andreaniClient,
      env: (process.env.ANDREANI_ENV?.trim() ?? "prod") as "homo" | "prod",
    });
  }

  const ocaCuit = process.env.OCA_CUIT?.trim();
  const ocaOperativa = process.env.OCA_OPERATIVA?.trim();
  if (ocaCuit && ocaOperativa) {
    adapters.oca = new OcaAdapter({ cuit: ocaCuit, operativa: ocaOperativa });
  }

  if (process.env.AR_AGENTS_CORREO_DISABLED?.trim() !== "1") {
    adapters.correo_argentino = new CorreoAdapter();
  }

  const defaultCarrier = process.env.SHIPPING_DEFAULT_CARRIER?.trim() as
    | "andreani"
    | "oca"
    | "correo_argentino"
    | undefined;

  return shippingTools({
    adapters,
    ...(defaultCarrier ? { defaultCarrier } : {}),
  }) as ToolSet;
}

export function describeShippingConfig(): string {
  const enabled: string[] = [];
  if (process.env.ANDREANI_USERNAME?.trim()) enabled.push("andreani");
  if (process.env.OCA_CUIT?.trim()) enabled.push("oca");
  if (process.env.AR_AGENTS_CORREO_DISABLED?.trim() !== "1") enabled.push("correo_argentino");
  if (enabled.length === 0) return "no carriers configurados";
  return `carriers activos: ${enabled.join(", ")}`;
}
