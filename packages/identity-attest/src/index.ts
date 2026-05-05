export {
  AttestationClient,
  type AttestationClientOptions,
} from "./client";

export {
  identityAttestTools,
  type IdentityAttestToolsOptions,
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

export {
  Auth0Adapter,
  type Auth0AdapterOptions,
} from "./adapters/auth0";

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
