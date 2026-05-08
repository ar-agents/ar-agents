import { z } from "zod";

// ACP `Link` — CheckoutSession.links[]. Surfaces terms-of-use, privacy,
// help-center, refund-policy, etc.
export const LinkType = z.enum([
  "terms_of_use",
  "privacy_policy",
  "shipping_policy",
  "return_policy",
  "refund_policy",
  "help_center",
  "support",
  "seller_terms",
  "marketplace_terms",
  "other",
]);
export type LinkType = z.infer<typeof LinkType>;

export const Link = z.object({
  type: z.union([LinkType, z.string()]),
  url: z.string().url(),
  display_text: z.string().optional(),
});
export type Link = z.infer<typeof Link>;

// ACP `MessageInfo` / `MessageWarning` / `MessageError` — surfaced on
// CheckoutSession.messages[]. These are 200-OK warnings/info; for terminal
// errors, see `error.ts` (HTTP 4xx/5xx body).
const messageBase = {
  // Free-form code; spec keeps this open.
  code: z.string().optional(),
  // Human-readable text shown to the buyer.
  content: z.string(),
  // Path into the session (e.g. `line_items[0]`, `payment_data`) the message
  // applies to. Optional.
  path: z.string().optional(),
};

export const MessageInfo = z.object({
  type: z.literal("info"),
  ...messageBase,
});
export type MessageInfo = z.infer<typeof MessageInfo>;

export const MessageWarning = z.object({
  type: z.literal("warning"),
  ...messageBase,
});
export type MessageWarning = z.infer<typeof MessageWarning>;

export const MessageError = z.object({
  type: z.literal("error"),
  ...messageBase,
});
export type MessageError = z.infer<typeof MessageError>;

export const Message = z.discriminatedUnion("type", [
  MessageInfo,
  MessageWarning,
  MessageError,
]);
export type Message = z.infer<typeof Message>;

export const Messages = z.array(Message);
export type Messages = z.infer<typeof Messages>;

// Disclosure surfaces small notices on a line item (e.g. "items ship from
// Argentina, customs may apply"). Cosmetic.
export const Disclosure = z.object({
  display_text: z.string(),
  type: z.string().optional(),
  link: z.string().url().optional(),
});
export type Disclosure = z.infer<typeof Disclosure>;
