// Public API surface for @ar-agents/bind.
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool
// collection. Pair with `Experimental_Agent` (or any caller of `tool()`)
// and an adapter of your choice. See README.md for usage and AGENTS.md
// for tool selection guidance from an agent-author's perspective.

export {
  type BindAdapter,
  type HttpBindAdapterOptions,
  UnconfiguredBindAdapter,
  HttpBindAdapter,
  SANDBOX_BASE_URL,
  BIND_BANK_ID,
} from "./adapter";

export {
  bindTools,
  type BindToolsOptions,
  type BindToolName,
  type GatedOperation,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  BindError,
  BindAuthError,
  BindApiError,
  BindValidationError,
} from "./errors";

export {
  bindOk,
  bindErr,
  bindAccountSchema,
  bindMovementSchema,
  bindTransferRequestSchema,
  bindTransferResultSchema,
  bindDebinRequestSchema,
  bindDebinResultSchema,
  bindEcheqSchema,
  cbuOwnershipSchema,
  accountOwnerSchema,
  accountRoutingSchema,
} from "./types";

export type {
  BindResult,
  BindAccount,
  BindMovement,
  BindTransferRequest,
  BindTransferResult,
  BindDebinRequest,
  BindDebinResult,
  BindEcheq,
  CbuOwnership,
  GetCbuOwnerArgs,
  GetMovementsArgs,
  GetEcheqsArgs,
} from "./types";
