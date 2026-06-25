export {
  AttestationClient,
  type AttestationClientOptions,
} from "./client";

export {
  identityAttestTools,
  type IdentityAttestToolsOptions,
  type IdentityAttestReadContext,
} from "./tools";

export {
  type AttestationStore,
  type InternalRequestState,
  InMemoryAttestationStore,
} from "./store";

export {
  handleAttestationCallback,
} from "./webhook";

export {
  type AttestAdapter,
  randomOtp,
  randomToken,
} from "./adapters/base";

export {
  WhatsAppOtpAdapter,
  type WhatsAppOtpAdapterOptions,
  type WhatsAppLikeClient,
} from "./adapters/whatsapp-otp";

export {
  EmailMagicLinkAdapter,
  type EmailMagicLinkAdapterOptions,
  type EmailSender,
} from "./adapters/email-magic-link";

/**
 * @deprecated v0.4.0 — Import from `@ar-agents/identity-attest/auth0` instead.
 * The Auth0 adapter uses `node:crypto` for PKCE; importing it from the main
 * barrel pulls Node-only modules into Edge bundles. The subpath isolation
 * keeps the main bundle Edge-Runtime safe. This re-export will be removed
 * in v1.0.0.
 */
export {
  Auth0Adapter,
  type Auth0AdapterOptions,
} from "./adapters/auth0";

/**
 * @deprecated v0.4.0 — Import from `@ar-agents/identity-attest/magic-link-sdk` instead.
 * The Magic.link SDK adapter pulls `@magic-sdk/admin` which depends on
 * Node-only modules (node:stream, node:http, node:crypto). The subpath
 * isolation keeps the main bundle Edge-Runtime safe. This re-export will
 * be removed in v1.0.0.
 */
export {
  MagicLinkSdkAdapter,
  type MagicLinkSdkAdapterOptions,
} from "./adapters/magic-link-sdk";

export {
  MercadoPagoIdentityAdapter,
  type MercadoPagoIdentityAdapterOptions,
} from "./adapters/mercadopago-identity";

export {
  IdentityAttestError,
  IdentityAttestConfigError,
  VerificationRequestNotFoundError,
  InvalidOtpCodeError,
  VerificationExpiredError,
  TooManyAttemptsError,
  SubjectMismatchError,
  InvalidAttestationSignatureError,
  AttestAdapterError,
} from "./errors";

export type {
  TrustLevel,
  VerificationMethod,
  VerificationStatus,
  VerificationSubject,
  VerificationRequest,
  Attestation,
  AttestationClaims,
} from "./types";
