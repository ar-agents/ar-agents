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

/** Diagnostic: reports which clients are wired vs. missing config. */
export function clientStatus(): Record<
  "mercadopago" | "whatsapp" | "wsfe" | "afip-padron",
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
  };
}
