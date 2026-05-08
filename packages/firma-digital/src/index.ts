// Public API surface for @ar-agents/firma-digital.
//
// VERIFICATION primitives for Argentine Firma Digital (Ley 25.506 / ONTI).
// Does NOT sign — signing requires hardware tokens or managed-CSP services.
//
// See README.md for usage and AGENTS.md for tool selection guidance.

// Public types.
export type {
  ChainVerificationResult,
  CmsSignatureVerificationResult,
  ParsedCert,
} from "./types";

// X.509 primitives.
export { parseCert, parseCertChain, verifyChain } from "./x509";

// CMS / PKCS#7 detached signature.
export { verifyDetachedCmsSignature } from "./cms";

// Trust anchors + heuristics.
export {
  AR_FIRMA_DIGITAL_DN_PATTERNS,
  AR_ROOT_CN_PATTERNS,
  AR_TRUSTED_FINGERPRINTS_SHA256,
  type TrustStore,
  looksLikeArFirmaDigitalIssuer,
  looksLikeArRoot,
} from "./anchors";

// Vercel AI SDK tool collection.
export {
  firmaDigitalTools,
  type FirmaDigitalToolName,
  type FirmaDigitalToolsOptions,
} from "./tools";

// Errors.
export {
  FirmaDigitalError,
  type FirmaDigitalErrorCode,
} from "./errors";
