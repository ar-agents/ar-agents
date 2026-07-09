/**
 * The fixed catalog of operating credentials a society's owner configures
 * from studio (ROADMAP.md M3-1). Each integration maps to the exact env var
 * names `apps/sociedad-ia-starter/src/lib/clients.ts` reads (those names are
 * canonical -- this file never invents its own).
 *
 * One deliberate merge: the starter's `clientStatus()` reports `wsfe` and
 * `afip-padron` as two separate keys, but both are derived from the exact
 * same three env vars (`AFIP_CERT_PEM`, `AFIP_KEY_PEM`, `AFIP_CUIT`) plus
 * `AFIP_ENV`. Asking the owner to paste the same certificate twice under two
 * different labels would be busywork with no effect, so this catalog has a
 * single `afip` integration that flips both starter status keys to "wired"
 * at once.
 *
 * `treasury_offramp` supports one provider (Manteca) for M3-1: the starter
 * supports three (Mural, Ripio, Manteca per `getOffRamp()`), each with a
 * different field set. Manteca has the smallest field set (3 required env
 * vars, no nested JSON), so it is the one this wizard exposes; see
 * docs/CONTRACT.md / ROADMAP.md for the follow-up to add the other two.
 *
 * `model_key` is not a starter `clientStatus()` entry (the starter has no
 * env-driven diagnostic for its own model) -- it configures
 * `ANTHROPIC_API_KEY`, the env var `apps/sociedad-ia-starter/src/lib/agent.ts`
 * passes to `@ai-sdk/anthropic`'s `anthropic()` provider call.
 */

export type IntegrationId =
  | "model_key"
  | "mercadopago"
  | "whatsapp"
  | "afip"
  | "treasury_offramp";

export const INTEGRATION_IDS: readonly IntegrationId[] = [
  "model_key",
  "mercadopago",
  "whatsapp",
  "afip",
  "treasury_offramp",
];

export function isIntegrationId(value: unknown): value is IntegrationId {
  return typeof value === "string" && (INTEGRATION_IDS as readonly string[]).includes(value);
}

/** The exact env var names set on the society's Vercel project for each
 *  integration, in the order the starter documents them (see its
 *  `.env.example` and `src/lib/clients.ts`). */
export const INTEGRATION_ENV_VARS: Record<IntegrationId, readonly string[]> = {
  model_key: ["ANTHROPIC_API_KEY"],
  mercadopago: ["MERCADOPAGO_ACCESS_TOKEN"],
  whatsapp: ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"],
  afip: ["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT", "AFIP_ENV"],
  treasury_offramp: ["MANTECA_API_KEY", "MANTECA_USER_ID", "MANTECA_BANK_ACCOUNT_ID"],
};

/** Which `clientStatus()` keys (apps/sociedad-ia-starter/src/lib/clients.ts)
 *  each integration is expected to flip to "wired" once configured. Used
 *  only in docs/tests to keep the mapping honest, never sent over the wire. */
export const INTEGRATION_STARTER_STATUS_KEYS: Record<IntegrationId, readonly string[]> = {
  model_key: [],
  mercadopago: ["mercadopago"],
  whatsapp: ["whatsapp"],
  afip: ["wsfe", "afip-padron"],
  treasury_offramp: ["treasury-offramp"],
};
