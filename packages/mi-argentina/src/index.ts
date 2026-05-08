// Public API surface for @ar-agents/mi-argentina.
//
// Drop into a Vercel AI SDK 6+ Agent setup as a tool collection, or use the
// MiArgentinaClient directly from any server-side handler. Web Crypto only
// — runs on Edge Runtime, Cloudflare Workers, Deno, Node 20+.
//
// See README.md for usage, AGENTS.md for tool selection guidance.

// OIDC client + endpoint presets.
export {
  MiArgentinaClient,
  MI_ARGENTINA_ENDPOINTS_PROD,
  MI_ARGENTINA_ENDPOINTS_SANDBOX,
  type MiArgentinaClientOptions,
} from "./oidc";

// PKCE primitives — pure functions, safe to call in any environment.
export {
  generateCodeVerifier,
  computeCodeChallenge,
  generateRandomToken,
  base64UrlEncode,
  base64UrlDecode,
} from "./pkce";

// JWT verification.
export {
  decodeJwt,
  verifyIdToken,
  type RsaJwk,
  type JwksDocument,
  type VerifyOptions,
} from "./jwt";

// State adapters.
export {
  InMemoryStateAdapter,
  VercelKVStateAdapter,
  type VercelKVLike,
} from "./state";

// Tool collection.
export {
  miArgentinaTools,
  type MiArgentinaToolName,
  type MiArgentinaToolsOptions,
} from "./tools";

// Public types.
export type {
  AuthorizationRequest,
  AuthorizationUrlResult,
  MiArgentinaConfig,
  MiArgentinaStateAdapter,
  MiArgentinaUserProfile,
  OidcEndpoints,
  StoredAuthState,
  TokenResponse,
  VerifiedIdToken,
} from "./types";

// Errors for programmatic handling.
export {
  ConfigMissingError,
  IdTokenInvalidError,
  MiArgentinaError,
  StateMismatchError,
  type MiArgentinaErrorCode,
} from "./errors";
