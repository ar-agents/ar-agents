/**
 * x402 seller config for the landing's paid endpoints (/api/x402/cuit).
 *
 * Kept separate from the route handler so requirement-building is unit
 * testable and reusable when more paid endpoints land.
 *
 * Env contract:
 *   X402_PAYTO_ADDRESS    Base USDC receiving address (0x...). Unset means
 *                         the paid endpoints answer 503 "not configured yet"
 *                         instead of advertising a 402 nobody can settle.
 *   X402_FACILITATOR_URL  Facilitator base URL. Defaults to the x402.org
 *                         facilitator (the default in @ar-agents/x402 docs;
 *                         it settles base-sepolia only). For Base mainnet
 *                         settlement point this at the Coinbase CDP
 *                         facilitator instead.
 *   X402_NETWORK          "base" (default) or "base-sepolia".
 */
import type { PaymentRequirements } from "@ar-agents/x402";

/** $0.001 USDC in atomic units (USDC has 6 decimals). */
export const CUIT_PRICE_ATOMIC = "1000";

/**
 * $0.05 USDC in atomic units. The Constancia Oracle attestation is the real
 * product (a signed ARCA good-standing verdict, legal-evidence artifact), not
 * the free mod-11 check-digit — so it is priced ~50x the toy /cuit endpoint.
 * Overridable per-deployment via X402_CONSTANCIA_PRICE_ATOMIC.
 */
export const CONSTANCIA_PRICE_ATOMIC = "50000";

export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

/**
 * Canonical USDC deployments + their EIP-712 domain (the `extra` field the
 * "exact" scheme needs to build the EIP-3009 transferWithAuthorization).
 */
export const USDC_BY_NETWORK: Record<
  string,
  { asset: string; extra: { name: string; version: string } }
> = {
  base: {
    asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    extra: { name: "USD Coin", version: "2" },
  },
  "base-sepolia": {
    asset: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    extra: { name: "USDC", version: "2" },
  },
};

export interface X402Config {
  payTo: string;
  facilitatorUrl: string;
  network: string;
}

/** Read the env contract. Returns null when the endpoint isn't configured. */
export function readX402Config(
  env: Record<string, string | undefined> = process.env,
): X402Config | null {
  const payTo = env.X402_PAYTO_ADDRESS?.trim();
  if (!payTo) return null;
  return {
    payTo,
    facilitatorUrl: env.X402_FACILITATOR_URL?.trim() || DEFAULT_FACILITATOR_URL,
    network: env.X402_NETWORK?.trim() || "base",
  };
}

/**
 * Build the PaymentRequirements advertised by /api/x402/cuit.
 * `resource` must be the canonical URL of the protected endpoint
 * (origin + pathname, no query string).
 */
export function buildCuitRequirements(
  resource: string,
  cfg: X402Config,
): PaymentRequirements {
  const usdc = USDC_BY_NETWORK[cfg.network] ?? USDC_BY_NETWORK["base"]!;
  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: CUIT_PRICE_ATOMIC,
    asset: usdc.asset,
    payTo: cfg.payTo,
    resource,
    description:
      "Validate an Argentine CUIT/CUIL (AFIP mod-11 algorithm) and classify the person type. Returns JSON.",
    mimeType: "application/json",
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        paid: { type: "boolean" },
        result: {
          type: "object",
          description:
            "CuitParseResult: { valid, normalized, personType, error }",
        },
      },
    },
    maxTimeoutSeconds: 60,
    extra: usdc.extra,
  };
}

/** Read the Constancia attestation price (atomic USDC), env-overridable. */
export function constanciaPriceAtomic(
  env: Record<string, string | undefined> = process.env,
): string {
  const raw = env.X402_CONSTANCIA_PRICE_ATOMIC?.trim();
  return raw && /^[0-9]+$/.test(raw) && raw !== "0" ? raw : CONSTANCIA_PRICE_ATOMIC;
}

/**
 * Build the PaymentRequirements advertised by /api/x402/constancia — the
 * machine-payable Constancia Oracle: an Ed25519-signed ARCA good-standing
 * attestation for a CUIT, verifiable offline against
 * /.well-known/sociedad-ia/keys. This is "El Padrón" for a counterparty agent
 * that wants to check a party's standing before transacting.
 */
export function buildConstanciaRequirements(
  resource: string,
  cfg: X402Config,
  priceAtomic: string = constanciaPriceAtomic(),
): PaymentRequirements {
  const usdc = USDC_BY_NETWORK[cfg.network] ?? USDC_BY_NETWORK["base"]!;
  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: priceAtomic,
    asset: usdc.asset,
    payTo: cfg.payTo,
    resource,
    description:
      "Signed ARCA good-standing attestation for an Argentine CUIT (Ed25519, offline-verifiable). Returns the constancia verdict plus a portable attestation.",
    mimeType: "application/json",
    outputSchema: {
      type: "object",
      properties: {
        ok: { type: "boolean" },
        paid: { type: "boolean" },
        verdictAvailable: { type: "boolean" },
        goodStanding: {
          type: "object",
          description: "ConstanciaGoodStanding: { source, condicion, denominacion?, estado? }",
        },
        attestation: {
          type: "object",
          description: "Ed25519-signed ConstanciaAttestation, verifiable offline.",
        },
      },
    },
    maxTimeoutSeconds: 60,
    extra: usdc.extra,
  };
}
