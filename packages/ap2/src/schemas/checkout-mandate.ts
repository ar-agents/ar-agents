import { z } from "zod";
import { Cnf } from "./jwk";
import { Constraint } from "./constraints";

// AP2 v0.2 — Checkout Mandate (open + closed).
//
// Spec reference: `code/sdk/schemas/ap2/checkout_mandate.json`,
// `code/sdk/schemas/ap2/open_checkout_mandate.json` from
// google-agentic-commerce/AP2.
//
// **CRITICAL versioning note:** the v0.2 spec collapsed Sept-2025's
// `IntentMandate` and `CartMandate` into a single Checkout Mandate
// (open + closed variants). The pre-v0.2 3-mandate model is dead;
// implementations MUST match `vct` exactly including the `.1` suffix.

// ---- Open Checkout Mandate (intent-style) --------------------------------

export const OpenCheckoutMandate = z.object({
  /** Versioned credential type per RFC 9901 SD-JWT VC. Exact match required. */
  vct: z.literal("mandate.checkout.open.1"),
  /**
   * Constraint set the closed checkout MUST satisfy. Per spec, includes at
   * least `checkout.line_items` (REQUIRED) and optionally
   * `checkout.allowed_merchants`.
   */
  constraints: z.array(Constraint).min(1),
  /**
   * RFC 7800 Proof-of-Possession key. The closed Checkout Mandate's KB-JWT
   * MUST be signed by the private key matching this `cnf.jwk`.
   */
  cnf: Cnf,
  /** Issued-at (Unix seconds). */
  iat: z.number().int().nonnegative().optional(),
  /** Expiration (Unix seconds). RECOMMENDED for autonomous flows. */
  exp: z.number().int().nonnegative().optional(),
});
export type OpenCheckoutMandate = z.infer<typeof OpenCheckoutMandate>;

// ---- Closed Checkout Mandate ----------------------------------------------
//
// The merchant-signed JWT containing the actual cart/order state is
// `checkout_jwt` (an inner JWT, base64url-encoded compact JWS). Its hash
// (`base64url(sha-256(checkout_jwt))`) is `checkout_hash`. The Payment
// Mandate's `transaction_id` MUST equal this `checkout_hash`.
//
// Per spec: `checkout_jwt` is signed with a NON-DETERMINISTIC scheme
// (ECDSA family). Ed25519 is forbidden.

const Base64UrlString = z
  .string()
  .regex(/^[A-Za-z0-9_-]+$/, "must be base64url");

export const ClosedCheckoutMandate = z.object({
  vct: z.literal("mandate.checkout.1"),
  /** Compact JWS (signed checkout payload). Selectively-disclosable. */
  checkout_jwt: z.string().min(1),
  /** base64url(sha-256(checkout_jwt)). Anti-mismatch + binds Payment Mandate. */
  checkout_hash: Base64UrlString,
  iat: z.number().int().nonnegative().optional(),
  exp: z.number().int().nonnegative().optional(),
});
export type ClosedCheckoutMandate = z.infer<typeof ClosedCheckoutMandate>;

// ---- Inner Checkout JWT payload ------------------------------------------
//
// The decoded payload of `checkout_jwt`. Open-shape — the spec keeps this
// merchant-defined. We carry the canonical fields the AP2 reference impl
// uses (`code/sdk/python/ap2/sdk/jwt_helper.py` examples).

export const CheckoutJwtPayload = z.object({
  /** Merchant's canonical order id. */
  order_id: z.string().min(1),
  /** Merchant identity. */
  merchant: z.object({
    id: z.string(),
    name: z.string().optional(),
    website: z.string().url().optional(),
  }),
  /** Cart items at the time of signing. */
  line_items: z.array(
    z.object({
      id: z.string(),
      product: z.object({
        id: z.string(),
        title: z.string(),
        price: z.number().nonnegative(),
        currency: z.string(),
      }),
      quantity: z.number().positive(),
    }),
  ),
  /** Total cart price as MAJOR units (per AP2 ref impl examples). */
  total_price: z.number().nonnegative(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  shipping_policy: z.string().optional(),
  return_policy: z.string().optional(),
  /** Free-form merchant metadata. */
  metadata: z.record(z.string(), z.unknown()).optional(),
});
export type CheckoutJwtPayload = z.infer<typeof CheckoutJwtPayload>;
