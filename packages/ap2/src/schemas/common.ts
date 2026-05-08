import { z } from "zod";

// AP2 common types — shared by both mandate families and the constraint
// evaluators. These mirror `code/sdk/schemas/ap2/types/*.json` from the
// google-agentic-commerce/AP2 reference SDK.

// ---------------------------------------------------------------------------
// Amount — payment_amount on Payment Mandates and budget constraints.
// Per spec: integer minor units (e.g. 19900 USD = $199.00). Currency is ISO
// 4217 alpha-3, conventionally uppercase per AP2 example payloads (the AP2
// spec is silent on case, but examples use "USD"/"ARS"). We accept both for
// inter-op and uppercase on serialization.
// ---------------------------------------------------------------------------

export const CurrencyCode = z
  .string()
  .regex(/^[A-Za-z]{3}$/, "currency must be ISO 4217 (e.g. 'USD', 'ARS')");
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const Amount = z.object({
  /** Integer minor units. Use `0` for free items. */
  amount: z.number().int().nonnegative(),
  currency: CurrencyCode,
});
export type Amount = z.infer<typeof Amount>;

// Currencies with 0 minor units per ISO 4217 — when computing `amount` from
// a major-units value, multiply by 1 instead of 100.
export const ZERO_DECIMAL_CURRENCIES = new Set([
  "CLP",
  "PYG",
  "JPY",
  "KRW",
  "VND",
  "UGX",
  "RWF",
  "ISK",
  "HUF",
] as const);

export function divisorFor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(
    currency.toUpperCase() as "CLP" | "PYG" | "JPY" | "KRW" | "VND" | "UGX" | "RWF" | "ISK" | "HUF",
  )
    ? 1
    : 100;
}

// ---------------------------------------------------------------------------
// Merchant — payee on Payment Mandates and `checkout.allowed_merchants`.
// Open-vocabulary: the spec carries `id`, `name`, `website` only. LATAM hosts
// can stuff CUIT/CPF/RFC into `id` as a URN (e.g. `cuit:20-41758101-5`).
// ---------------------------------------------------------------------------

export const Merchant = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  website: z.string().url().optional(),
});
export type Merchant = z.infer<typeof Merchant>;

// ---------------------------------------------------------------------------
// PaymentInstrument — abstract payment method. `type` is open-vocabulary
// per spec (`code/sdk/schemas/ap2/types/payment_instrument.json`).
// Recommended values for LATAM:
//   "card", "pix", "spei", "transferencias_3", "mercadopago", "x402",
//   "dpc" (Digital Payment Credential), "UPI", "bank_account"
// ---------------------------------------------------------------------------

export const PaymentInstrument = z.object({
  id: z.string().min(1),
  type: z.string().min(1),
  description: z.string().optional(),
  /** Free-form per-type metadata (e.g. last4, network, brand). */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type PaymentInstrument = z.infer<typeof PaymentInstrument>;

// ---------------------------------------------------------------------------
// Pisp — Payment Initiation Service Provider. EU-PSD2 flavor in the spec
// (`legal_name`, `brand_name`, `domain_name as secured by [eIDAS] QWAC`).
// LATAM equivalents (BCB Iniciador de Pagamentos, BCRA PSPCP) reuse the same
// shape with `domain_name` as their regulator-issued certificate domain.
// ---------------------------------------------------------------------------

export const Pisp = z.object({
  id: z.string().min(1),
  legal_name: z.string().optional(),
  brand_name: z.string().optional(),
  domain_name: z.string().optional(),
});
export type Pisp = z.infer<typeof Pisp>;

// ---------------------------------------------------------------------------
// Item — minimal product reference for constraint evaluation. Used by
// `checkout.line_items` constraints inside Open Checkout Mandates. Mirrors
// the `Item` shape ACP also uses, but this is the AP2-side definition so
// AP2 can be used independently of ACP.
// ---------------------------------------------------------------------------

export const Item = z.object({
  id: z.string().min(1),
  name: z.string().optional(),
  unit_amount: z.number().int().nonnegative().optional(),
});
export type Item = z.infer<typeof Item>;

// ---------------------------------------------------------------------------
// Frequency — `payment.agent_recurrence` constraint values.
// ---------------------------------------------------------------------------

export const Frequency = z.enum([
  "ON_DEMAND",
  "DAILY",
  "WEEKLY",
  "BIWEEKLY",
  "MONTHLY",
  "QUARTERLY",
  "ANNUALLY",
]);
export type Frequency = z.infer<typeof Frequency>;
