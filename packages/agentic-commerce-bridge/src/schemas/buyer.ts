import { z } from "zod";
import { ISODateTime } from "./common";

// ACP carries no first-class CUIT/CPF/RFC slot. For LATAM tax IDs, use the
// generic `company.tax_id` (untyped string) for B2B and stash buyer-side IDs
// in the merchant-internal CheckoutSession metadata. AR-fiscal helpers in
// `compliance/` resolve this automatically when @ar-agents/facturacion is
// installed.
export const CompanyInfo = z.object({
  name: z.string().min(1),
  tax_id: z.string().optional(),
  department: z.string().optional(),
  cost_center: z.string().optional(),
});
export type CompanyInfo = z.infer<typeof CompanyInfo>;

export const TaxExemption = z.object({
  certificate_id: z.string(),
  certificate_type: z.enum(["resale", "exempt_organization", "government"]),
  exempt_regions: z.array(z.string()).optional(),
  expires_at: ISODateTime.optional(),
});
export type TaxExemption = z.infer<typeof TaxExemption>;

export const LoyaltyInfo = z.object({
  program_id: z.string().optional(),
  member_id: z.string().optional(),
  tier: z.string().optional(),
  points_balance: z.number().nonnegative().optional(),
});
export type LoyaltyInfo = z.infer<typeof LoyaltyInfo>;

export const Buyer = z.object({
  // Only `email` is required.
  email: z.string().email(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  full_name: z.string().optional(),
  phone_number: z.string().optional(),
  customer_id: z.string().optional(),
  account_type: z.enum(["guest", "registered", "business"]).optional(),
  authentication_status: z
    .enum(["authenticated", "guest", "requires_signin"])
    .optional(),
  company: CompanyInfo.optional(),
  loyalty: LoyaltyInfo.optional(),
  tax_exemption: TaxExemption.optional(),
});
export type Buyer = z.infer<typeof Buyer>;
