import { z } from "zod";
import { Address } from "./address";

// ACP `PaymentData` — provided by the agent on `complete`. The protocol is
// open about credential families — `spt` (Stripe Shared Payment Token),
// `vault_token`, network tokens, seller-backed credentials, etc.
//
// For LATAM-MP, the canonical credential is `mp_spt_*` (a token minted by
// our facilitator after a per-checkout MP preference is created and the
// agent confirmed it). x402 stablecoin / AP2 mandates layer on top in
// Phase 2.

export const PaymentCredential = z.object({
  // Open string. Well-known values: "spt", "vault_token", "mp_spt",
  // "x402", "ap2_mandate", "saved_card_token".
  type: z.string().min(1),
  token: z.string().min(1),
});
export type PaymentCredential = z.infer<typeof PaymentCredential>;

export const PaymentInstrument = z.object({
  // Open string. Well-known values: "card", "bank_account", "wallet",
  // "wallet_token", "seller_backed_saved_card", "pix", "spei", "mercadopago".
  type: z.string().min(1),
  credential: PaymentCredential,
  // Optional friendly description, e.g. "Visa ••••4242".
  description: z.string().optional(),
});
export type PaymentInstrument = z.infer<typeof PaymentInstrument>;

export const PaymentTerms = z.enum([
  "immediate",
  "net_15",
  "net_30",
  "net_60",
  "net_90",
]);
export type PaymentTerms = z.infer<typeof PaymentTerms>;

export const PaymentData = z
  .object({
    handler_id: z.string().optional(),
    instrument: PaymentInstrument.optional(),
    billing_address: Address.optional(),
    purchase_order_number: z.string().optional(),
    payment_terms: PaymentTerms.optional(),
    due_date: z.string().optional(),
    approval_required: z.boolean().optional(),
  })
  .refine(
    (p) =>
      (p.handler_id !== undefined && p.instrument !== undefined) ||
      p.purchase_order_number !== undefined,
    {
      message:
        "PaymentData requires either (handler_id + instrument) or purchase_order_number.",
    },
  );
export type PaymentData = z.infer<typeof PaymentData>;

// On `complete` request body. Marketing consents and authentication results
// are optional companion fields.
export const MarketingChannel = z.enum([
  "email",
  "sms",
  "push",
  "whatsapp",
  "phone",
]);
export type MarketingChannel = z.infer<typeof MarketingChannel>;

export const MarketingConsent = z.object({
  channel: z.union([MarketingChannel, z.string()]),
  opted_in: z.boolean(),
});
export type MarketingConsent = z.infer<typeof MarketingConsent>;

export const AuthenticationResult = z.object({
  type: z.string(),
  token: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type AuthenticationResult = z.infer<typeof AuthenticationResult>;
