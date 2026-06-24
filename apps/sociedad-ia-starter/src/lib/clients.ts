/**
 * Lazy, env-var-driven client construction for the sociedad-IA starter.
 *
 * Each client is built at most once per process; missing env vars degrade
 * gracefully — the agent loop uses unconfigured shims that return
 * `available: false` instead of throwing, so the rest of the app stays
 * up and the user sees a useful error instead of a 500.
 */

import { MercadoPagoClient } from "@ar-agents/mercadopago";
import { WhatsAppClient } from "@ar-agents/whatsapp";
import { WsfeClient } from "@ar-agents/facturacion";
import {
  type AfipPadronAdapter,
  UnconfiguredAfipPadronAdapter,
} from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import {
  MantecaOffRampAdapter,
  RipioOffRampAdapter,
  RIPIO_PROD,
  type OffRampAdapter,
} from "@ar-agents/treasury";
import {
  X402Receiver,
  HostedFacilitatorClient,
  type SupportedNetwork,
} from "@ar-agents/x402";

const have = (key: string): string | null => {
  const v = process.env[key]?.trim();
  return v && v.length > 0 ? v : null;
};

let _mp: MercadoPagoClient | null | "missing" = null;
export function getMpClient(): MercadoPagoClient | null {
  if (_mp !== null) return _mp === "missing" ? null : _mp;
  const token = have("MERCADOPAGO_ACCESS_TOKEN");
  if (!token) {
    _mp = "missing";
    return null;
  }
  _mp = new MercadoPagoClient({ accessToken: token });
  return _mp;
}

let _wa: WhatsAppClient | null | "missing" = null;
export function getWhatsAppClient(): WhatsAppClient | null {
  if (_wa !== null) return _wa === "missing" ? null : _wa;
  const token = have("WHATSAPP_ACCESS_TOKEN");
  const phoneNumberId = have("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) {
    _wa = "missing";
    return null;
  }
  _wa = new WhatsAppClient({ accessToken: token, phoneNumberId });
  return _wa;
}

let _wsfe: WsfeClient | null | "missing" = null;
export function getWsfeClient(): WsfeClient | null {
  if (_wsfe !== null) return _wsfe === "missing" ? null : _wsfe;
  const certPem = have("AFIP_CERT_PEM");
  const keyPem = have("AFIP_KEY_PEM");
  const cuit = have("AFIP_CUIT");
  const env = (have("AFIP_ENV") ?? "homo") as "prod" | "homo";
  if (!certPem || !keyPem || !cuit) {
    _wsfe = "missing";
    return null;
  }
  _wsfe = new WsfeClient({ certPem, keyPem, cuit, env });
  return _wsfe;
}

let _afip: AfipPadronAdapter | null = null;
export function getAfipPadronAdapter(): AfipPadronAdapter {
  if (_afip) return _afip;
  const certPem = have("AFIP_CERT_PEM");
  const keyPem = have("AFIP_KEY_PEM");
  const cuit = have("AFIP_CUIT");
  const env = (have("AFIP_ENV") ?? "homo") as "prod" | "homo";
  if (!certPem || !keyPem || !cuit) {
    _afip = new UnconfiguredAfipPadronAdapter();
    return _afip;
  }
  _afip = new WsaaWscdcAfipPadronAdapter({
    certPem,
    keyPem,
    cuitRepresentado: cuit,
    env,
  });
  return _afip;
}

let _offramp: OffRampAdapter | null | "missing" = null;
/**
 * The registered-PSAV off-ramp for USDC->ARS payout to the society's CVU. Tries
 * Ripio B2B first (RIPIO_*), then Manteca (MANTECA_*) — provider-optional, no
 * single-PSAV lock-in. Returns undefined when neither is configured; the pure
 * treasury tools still run, only the off-ramp tools report available:false.
 */
export function getOffRamp(): OffRampAdapter | undefined {
  if (_offramp !== null) return _offramp === "missing" ? undefined : _offramp;

  // Ripio B2B (OAuth2 client-credentials) — the soonest live path (open sandbox).
  // Defaults to the prod host; set RIPIO_BASE_URL to the sandbox while testing.
  const clientId = have("RIPIO_CLIENT_ID");
  const clientSecret = have("RIPIO_CLIENT_SECRET");
  const customerId = have("RIPIO_CUSTOMER_ID");
  const fiatAccountId = have("RIPIO_FIAT_ACCOUNT_ID");
  if (clientId && clientSecret && customerId && fiatAccountId) {
    _offramp = new RipioOffRampAdapter({
      clientId,
      clientSecret,
      customerId,
      fiatAccountId,
      baseUrl: have("RIPIO_BASE_URL") ?? RIPIO_PROD,
    });
    return _offramp;
  }

  // Manteca PSAV (md-api-key) — sell-from-balance off-ramp.
  const apiKey = have("MANTECA_API_KEY");
  const userId = have("MANTECA_USER_ID");
  const bankAccountId = have("MANTECA_BANK_ACCOUNT_ID");
  if (apiKey && userId && bankAccountId) {
    const baseUrl = have("MANTECA_BASE_URL");
    _offramp = new MantecaOffRampAdapter({
      apiKey,
      userId,
      bankAccountId,
      ...(baseUrl ? { baseUrl } : {}),
    });
    return _offramp;
  }

  _offramp = "missing";
  return undefined;
}

let _x402:
  | { receiver: X402Receiver; payTo: `0x${string}`; network: SupportedNetwork }
  | null
  | "missing" = null;
/**
 * x402 crypto intake (rail 1): the receiver + the society's receiving address +
 * network, from env. Returns undefined when X402_PAY_TO is unset. Default
 * facilitator = the free x402.org testnet; set X402_FACILITATOR_URL (+ CDP creds)
 * for mainnet.
 */
export function getX402():
  | { receiver: X402Receiver; payTo: `0x${string}`; network: SupportedNetwork }
  | undefined {
  if (_x402 !== null) return _x402 === "missing" ? undefined : _x402;
  const payTo = have("X402_PAY_TO");
  if (!payTo) {
    _x402 = "missing";
    return undefined;
  }
  const network = (have("X402_NETWORK") ?? "base-sepolia") as SupportedNetwork;
  const url = have("X402_FACILITATOR_URL");
  _x402 = {
    receiver: new X402Receiver({
      facilitator: new HostedFacilitatorClient(url ? { url } : {}),
    }),
    payTo: payTo as `0x${string}`,
    network,
  };
  return _x402;
}

/** Diagnostic: reports which clients are wired vs. missing config. */
export function clientStatus(): Record<
  "mercadopago" | "whatsapp" | "wsfe" | "afip-padron" | "treasury-offramp" | "x402-intake",
  "wired" | "missing-env"
> {
  return {
    mercadopago: have("MERCADOPAGO_ACCESS_TOKEN") ? "wired" : "missing-env",
    whatsapp:
      have("WHATSAPP_ACCESS_TOKEN") && have("WHATSAPP_PHONE_NUMBER_ID")
        ? "wired"
        : "missing-env",
    wsfe:
      have("AFIP_CERT_PEM") && have("AFIP_KEY_PEM") && have("AFIP_CUIT")
        ? "wired"
        : "missing-env",
    "afip-padron":
      have("AFIP_CERT_PEM") && have("AFIP_KEY_PEM") && have("AFIP_CUIT")
        ? "wired"
        : "missing-env",
    "treasury-offramp":
      (have("RIPIO_CLIENT_ID") &&
        have("RIPIO_CLIENT_SECRET") &&
        have("RIPIO_CUSTOMER_ID") &&
        have("RIPIO_FIAT_ACCOUNT_ID")) ||
      (have("MANTECA_API_KEY") && have("MANTECA_USER_ID") && have("MANTECA_BANK_ACCOUNT_ID"))
        ? "wired"
        : "missing-env",
    "x402-intake": have("X402_PAY_TO") ? "wired" : "missing-env",
  };
}
