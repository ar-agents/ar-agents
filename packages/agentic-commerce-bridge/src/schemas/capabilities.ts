import { z } from "zod";
import { ApiVersion, Currency, Locale } from "./common";

// ACP §3 capability negotiation. Three sub-objects: `payment`, `interventions`,
// `extensions`. The agent declares its capabilities on the create-session
// request; the seller responds with the intersection plus seller-side payment
// handlers.

// Reverse-DNS-style handler IDs per spec. `dev.acp.tokenized.card` is the
// canonical card+SPT handler. Open string — extensions register their own.
export const PaymentHandler = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  display_name: z.string().optional(),
  version: ApiVersion,
  spec: z.string().url(),
  requires_delegate_payment: z.boolean(),
  requires_pci_compliance: z.boolean(),
  // Free-form PSP identifier: "stripe" | "adyen" | "mercadopago" | ...
  psp: z.string().min(1),
  config_schema: z.string().url(),
  instrument_schemas: z.array(z.string().url()),
  // Free-form per-handler config. Validated against `config_schema` at
  // implementation time; schema-of-schemas is out of scope.
  config: z.record(z.string(), z.unknown()),
  display_order: z.number().int().optional(),
});
export type PaymentHandler = z.infer<typeof PaymentHandler>;

// Interventions = step-up flows (3DS, biometric, address verification, OTP).
export const InterventionType = z.enum([
  "3ds",
  "biometric",
  "address_verification",
  "otp",
  "captcha",
  "passkey",
]);
export type InterventionType = z.infer<typeof InterventionType>;

export const DisplayContext = z.enum([
  "webview",
  "fullscreen",
  "embedded",
  "redirect",
  "native",
]);
export type DisplayContext = z.infer<typeof DisplayContext>;

export const RedirectContext = z.enum([
  "in_app",
  "external_browser",
  "iframe",
]);
export type RedirectContext = z.infer<typeof RedirectContext>;

export const InterventionEnforcement = z.enum([
  "always",
  "conditional",
  "never",
]);
export type InterventionEnforcement = z.infer<typeof InterventionEnforcement>;

export const InterventionCapabilities = z.object({
  supported: z.array(z.union([InterventionType, z.string()])).optional(),
  required: z.array(z.union([InterventionType, z.string()])).optional(),
  enforcement: InterventionEnforcement.optional(),
  display_context: DisplayContext.optional(),
  redirect_context: RedirectContext.optional(),
  max_redirects: z.number().int().nonnegative().optional(),
  max_interaction_depth: z.number().int().nonnegative().optional(),
});
export type InterventionCapabilities = z.infer<typeof InterventionCapabilities>;

// Extensions: agent declares ids on request, seller responds with full
// declaration objects.
export const ExtensionDeclaration = z.object({
  name: z.string(),
  spec: z.string().url(),
  schema: z.string().url(),
});
export type ExtensionDeclaration = z.infer<typeof ExtensionDeclaration>;

// On create-session request: `capabilities` is a *lightweight* shape (agent
// side). On response: `capabilities` is the *full* shape (seller side).
export const CapabilitiesRequest = z.object({
  payment: z
    .object({
      // Agents may declare which payment handlers they SUPPORT. Optional;
      // the seller responds with a full list keyed to its policies.
      handlers: z
        .array(
          z.object({
            id: z.string().min(1),
            instrument_schemas: z.array(z.string().url()).optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  interventions: InterventionCapabilities.optional(),
  // String list of extension IDs the agent supports.
  extensions: z.array(z.string()).optional(),
});
export type CapabilitiesRequest = z.infer<typeof CapabilitiesRequest>;

export const CapabilitiesResponse = z.object({
  payment: z
    .object({
      handlers: z.array(PaymentHandler),
    })
    .optional(),
  interventions: InterventionCapabilities.optional(),
  extensions: z.array(ExtensionDeclaration).optional(),
});
export type CapabilitiesResponse = z.infer<typeof CapabilitiesResponse>;

// Discovery doc payload (`/.well-known/acp.json`). RFC 8615.
export const DiscoveryResponse = z.object({
  protocol: z.object({
    name: z.literal("acp"),
    version: ApiVersion,
    supported_versions: z.array(ApiVersion),
    documentation_url: z.string().url().optional(),
  }),
  api_base_url: z.string().url(),
  transports: z.array(z.enum(["rest", "mcp"])),
  capabilities: z.object({
    services: z.array(
      z.enum(["checkout", "orders", "delegate_payment", "carts", "feed"]),
    ),
    extensions: z.array(ExtensionDeclaration).optional(),
    intervention_types: z
      .array(z.union([InterventionType, z.string()]))
      .optional(),
    supported_currencies: z.array(Currency).optional(),
    supported_locales: z.array(Locale).optional(),
  }),
});
export type DiscoveryResponse = z.infer<typeof DiscoveryResponse>;
