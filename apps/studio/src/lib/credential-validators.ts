/**
 * Per-integration credential validation (ROADMAP.md M3-1). Two shapes:
 *
 *  - Live: one minimal, cheap call against the real upstream (Mercado Pago
 *    `/users/me`, Meta Graph `/{phoneNumberId}`, Anthropic `/v1/models`).
 *    A 200 means the credential authenticates; `verified: true`.
 *  - Local: no network call. AFIP cert/key are parsed and cross-checked
 *    with `node:crypto` (well-formed PEM, cert not expired, key matches the
 *    cert); the treasury off-ramp fields get a format-only check. Both
 *    return `verified: false` -- "saved, not verified against a live
 *    upstream" is an honest, different claim than "verified".
 *
 * Contract every validator here honors: never log the secret, never include
 * it in a returned or thrown message, and never save partial state on
 * failure (the caller in the API route only persists after `ok: true`).
 */

import { createPrivateKey, X509Certificate } from "node:crypto";
import { isValidCuit, normalizeCuit } from "./ui/cuit";

const TIMEOUT_MS = 10_000;

export type ValidationOutcome =
  | { ok: true; verified: boolean; note?: string }
  | { ok: false; message: string };

function networkErrorOutcome(): ValidationOutcome {
  return { ok: false, message: "No se pudo validar el dato (problema de red). Probá de nuevo en un rato." };
}

// ── Mercado Pago ────────────────────────────────────────────────────────

export async function validateMercadoPago(accessToken: string): Promise<ValidationOutcome> {
  const token = accessToken.trim();
  if (token.length < 10) {
    return { ok: false, message: "El access token de Mercado Pago no tiene un formato válido." };
  }
  try {
    const res = await fetch("https://api.mercadopago.com/users/me", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 200) return { ok: true, verified: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Mercado Pago rechazó el access token." };
    }
    return { ok: false, message: `Mercado Pago respondió con un error inesperado (${res.status}).` };
  } catch {
    return networkErrorOutcome();
  }
}

// ── WhatsApp (Meta Graph) ───────────────────────────────────────────────

export async function validateWhatsApp(
  accessToken: string,
  phoneNumberId: string,
): Promise<ValidationOutcome> {
  const token = accessToken.trim();
  const phone = phoneNumberId.trim();
  if (token.length < 10) {
    return { ok: false, message: "El token de acceso de WhatsApp no tiene un formato válido." };
  }
  if (!/^\d+$/.test(phone)) {
    return {
      ok: false,
      message: "El ID del número de teléfono debe ser numérico (no el número en sí).",
    };
  }
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phone)}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 200) return { ok: true, verified: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Meta rechazó el token o el ID del número de teléfono." };
    }
    if (res.status === 404) {
      return { ok: false, message: "Meta no encontró ese ID de número de teléfono." };
    }
    return { ok: false, message: `Meta respondió con un error inesperado (${res.status}).` };
  } catch {
    return networkErrorOutcome();
  }
}

// ── AFIP cert (WSFE + padrón share the same credential) ────────────────

export interface AfipCertInput {
  certPem: string;
  keyPem: string;
  cuit: string;
}

/** Local-only: no AFIP call (WSAA homologación/producción handshakes are not
 *  cheap enough to run synchronously from a save button). Parses the cert
 *  and key with `node:crypto`, confirms the key matches the cert, and
 *  confirms the cert has not expired. */
export function validateAfipCert(input: AfipCertInput): ValidationOutcome {
  if (!isValidCuit(input.cuit)) {
    return { ok: false, message: "El CUIT no es válido." };
  }
  const certPem = input.certPem.trim();
  const keyPem = input.keyPem.trim();
  if (!certPem || !keyPem) {
    return { ok: false, message: "Faltan el certificado o la clave privada." };
  }

  let cert: X509Certificate;
  try {
    cert = new X509Certificate(certPem);
  } catch {
    return { ok: false, message: "El certificado no es un PEM X.509 válido." };
  }

  const validTo = new Date(cert.validTo);
  if (Number.isNaN(validTo.getTime()) || validTo.getTime() < Date.now()) {
    return { ok: false, message: "El certificado está vencido." };
  }

  let keyObject: ReturnType<typeof createPrivateKey>;
  try {
    keyObject = createPrivateKey(keyPem);
  } catch {
    return { ok: false, message: "La clave privada no es un PEM válido." };
  }

  let matches: boolean;
  try {
    matches = cert.checkPrivateKey(keyObject);
  } catch {
    return { ok: false, message: "No se pudo verificar que la clave corresponda al certificado." };
  }
  if (!matches) {
    return { ok: false, message: "La clave privada no corresponde a este certificado." };
  }

  return { ok: true, verified: false, note: "validada localmente" };
}

// ── Model key (Anthropic, the key apps/sociedad-ia-starter's agent uses) ─

export async function validateModelKey(apiKey: string): Promise<ValidationOutcome> {
  const key = apiKey.trim();
  if (key.length < 10) {
    return { ok: false, message: "La clave de API no tiene un formato válido." };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 200) return { ok: true, verified: true };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Anthropic rechazó la clave de API." };
    }
    return { ok: false, message: `Anthropic respondió con un error inesperado (${res.status}).` };
  } catch {
    return networkErrorOutcome();
  }
}

// ── Treasury off-ramp (Manteca; see credential-integrations.ts) ─────────

export interface TreasuryOfframpInput {
  apiKey: string;
  userId: string;
  bankAccountId: string;
}

/** Format-only: there is no cheap live Manteca call to run from a save
 *  button, so a well-formed save is marked "saved, sin verificar". */
export function validateTreasuryOfframp(input: TreasuryOfframpInput): ValidationOutcome {
  if (!input.apiKey.trim()) return { ok: false, message: "Falta la API key de Manteca." };
  if (!input.userId.trim()) return { ok: false, message: "Falta el ID de usuario de Manteca." };
  if (!input.bankAccountId.trim()) {
    return { ok: false, message: "Falta la cuenta bancaria de Manteca." };
  }
  return { ok: true, verified: false, note: "sin verificar" };
}

export { normalizeCuit };
