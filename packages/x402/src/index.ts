// Public API surface for @ar-agents/x402.
//
// Buyer side: `x402Fetch` (pay-on-402 fetch wrapper) + `x402Tools` for
// Vercel AI SDK 6+ agents. Seller side: `paymentRequiredResponse`,
// `verifyPayment`, `settleAndRespond` (Web API Request/Response, Edge
// compatible). Wallets and signing stay OUTSIDE this package via the
// `X402Signer` callback. See README.md for usage and AGENTS.md for tool
// selection guidance from an agent-author's perspective.

export {
  x402Fetch,
  probePaymentRequirements,
  parsePaymentRequired,
  decodeSettlementHeader,
  encodePaymentHeader,
  FacilitatorClient,
  type X402FetchOptions,
  type X402FetchResult,
  type FacilitatorClientOptions,
} from "./client";

export {
  paymentRequiredResponse,
  extractPaymentPayload,
  verifyPayment,
  settleAndRespond,
  withSettlementHeader,
  type VerifyPaymentResult,
} from "./server";

export {
  x402Tools,
  type X402ToolsOptions,
  type X402ToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  X402Error,
  X402UnconfiguredError,
  X402ProtocolError,
  X402FacilitatorError,
  X402PaymentRejectedError,
} from "./errors";

export { encodeBase64Json, decodeBase64Json } from "./encoding";

export {
  X402_VERSION,
  X_PAYMENT_HEADER,
  X_PAYMENT_RESPONSE_HEADER,
  paymentRequirementsSchema,
  paymentRequiredBodySchema,
  paymentPayloadSchema,
  settlementResponseSchema,
  facilitatorRequestSchema,
  verifyResponseSchema,
  settleResponseSchema,
  supportedKindsSchema,
  type PaymentRequirements,
  type PaymentRequiredBody,
  type PaymentPayload,
  type SettlementResponse,
  type VerifyRequest,
  type VerifyResponse,
  type SettleRequest,
  type SettleResponse,
  type SupportedKinds,
  type X402Signer,
} from "./types";
