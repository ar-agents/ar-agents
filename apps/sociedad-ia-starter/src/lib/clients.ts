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
  MuralOffRampAdapter,
  RipioOffRampAdapter,
  MantecaOffRampAdapter,
  MURAL_PROD,
  RIPIO_PROD,
  type OffRampAdapter,
} from "@ar-agents/treasury";

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
 * The USDC->ARS off-ramp for the society's treasury. Tries Mural (MURAL_*), then
 * Ripio (RIPIO_*), then Manteca (MANTECA_*) — provider-optional, no lock-in.
 * Returns undefined when none is configured (the pure treasury tools still run;
 * only the off-ramp tools report available:false). The convert it performs is
 * IRREVERSIBLE and is gated by enforceRiskPolicy (art. 102) in the agent loop.
 */
export function getOffRamp(): OffRampAdapter | undefined {
  if (_offramp !== null) return _offramp === "missing" ? undefined : _offramp;

  const muralKey = have("MURAL_API_KEY");
  const muralTransfer = have("MURAL_TRANSFER_API_KEY");
  const muralAccount = have("MURAL_SOURCE_ACCOUNT_ID");
  const muralCvu = have("MURAL_CVU");
  const muralDoc = have("MURAL_DOCUMENT_NUMBER");
  if (muralKey && muralTransfer && muralAccount && muralCvu && muralDoc) {
    const owner = have("MURAL_BANK_ACCOUNT_OWNER") ?? "Sociedad Automatizada";
    const addr = have("MURAL_RECIPIENT_ADDRESS_JSON");
    const orgId = have("MURAL_ORGANIZATION_ID");
    _offramp = new MuralOffRampAdapter({
      apiKey: muralKey,
      transferApiKey: muralTransfer,
      sourceAccountId: muralAccount,
      ...(orgId ? { organizationId: orgId } : {}),
      bankName: have("MURAL_BANK_NAME") ?? "",
      bankAccountOwner: owner,
      cvu: muralCvu,
      cvuType: (have("MURAL_CVU_TYPE") as "CVU" | "CBU" | "ALIAS") ?? "CVU",
      documentNumber: muralDoc,
      recipient: {
        type: "business",
        name: owner,
        physicalAddress: addr ? JSON.parse(addr) : { country: "AR" },
      },
      baseUrl: have("MURAL_BASE_URL") ?? MURAL_PROD,
    });
    return _offramp;
  }

  const ripioId = have("RIPIO_CLIENT_ID");
  const ripioSecret = have("RIPIO_CLIENT_SECRET");
  const ripioCustomer = have("RIPIO_CUSTOMER_ID");
  const ripioFiat = have("RIPIO_FIAT_ACCOUNT_ID");
  if (ripioId && ripioSecret && ripioCustomer && ripioFiat) {
    _offramp = new RipioOffRampAdapter({
      clientId: ripioId,
      clientSecret: ripioSecret,
      customerId: ripioCustomer,
      fiatAccountId: ripioFiat,
      baseUrl: have("RIPIO_BASE_URL") ?? RIPIO_PROD,
    });
    return _offramp;
  }

  const mantecaKey = have("MANTECA_API_KEY");
  const mantecaUser = have("MANTECA_USER_ID");
  const mantecaBank = have("MANTECA_BANK_ACCOUNT_ID");
  if (mantecaKey && mantecaUser && mantecaBank) {
    const baseUrl = have("MANTECA_BASE_URL");
    _offramp = new MantecaOffRampAdapter({
      apiKey: mantecaKey,
      userId: mantecaUser,
      bankAccountId: mantecaBank,
      ...(baseUrl ? { baseUrl } : {}),
    });
    return _offramp;
  }

  _offramp = "missing";
  return undefined;
}

/** Diagnostic: reports which clients are wired vs. missing config. */
export function clientStatus(): Record<
  "mercadopago" | "whatsapp" | "wsfe" | "afip-padron" | "treasury-offramp",
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
      (have("MURAL_API_KEY") &&
        have("MURAL_TRANSFER_API_KEY") &&
        have("MURAL_SOURCE_ACCOUNT_ID") &&
        have("MURAL_CVU") &&
        have("MURAL_DOCUMENT_NUMBER")) ||
      (have("RIPIO_CLIENT_ID") &&
        have("RIPIO_CLIENT_SECRET") &&
        have("RIPIO_CUSTOMER_ID") &&
        have("RIPIO_FIAT_ACCOUNT_ID")) ||
      (have("MANTECA_API_KEY") && have("MANTECA_USER_ID") && have("MANTECA_BANK_ACCOUNT_ID"))
        ? "wired"
        : "missing-env",
  };
}
