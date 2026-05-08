import { z } from "zod";

// ACP `Address` — spec section "Address (B.4)". `country` is ISO 3166-1
// alpha-2; `state` is locality-defined (US two-letter, AR province name,
// BR two-letter, etc. — the spec does not constrain).
export const Address = z.object({
  name: z.string().min(1),
  line_one: z.string().min(1),
  line_two: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  country: z
    .string()
    .regex(/^[A-Z]{2}$/, "country must be ISO 3166-1 alpha-2 (e.g. 'AR', 'BR')"),
  postal_code: z.string().min(1),
  // Added in 2026-04-17 for B2B contexts.
  company: z.string().optional(),
});
export type Address = z.infer<typeof Address>;
