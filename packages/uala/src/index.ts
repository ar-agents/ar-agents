// Public API surface for @ar-agents/uala.
//
// Designed to drop into a Vercel AI SDK 6+ Agent setup as a tool
// collection. Pair with `Experimental_Agent` (or any caller of `tool()`)
// and an adapter of your choice. See README.md for usage and AGENTS.md
// for tool selection guidance from an agent-author's perspective.

export {
  type UalaAdapter,
  type UalaApiAdapterOptions,
  type InMemoryUalaAdapterOptions,
  UnconfiguredUalaAdapter,
  UalaApiAdapter,
  InMemoryUalaAdapter,
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} from "./adapter";

export {
  ualaTools,
  type UalaToolsOptions,
  type UalaToolName,
  ALL_TOOL_NAMES,
} from "./tools";

export {
  UalaError,
  UalaUnconfiguredError,
  UalaAuthError,
  UalaApiError,
  UalaValidationError,
} from "./errors";

export type {
  Currency,
  PaymentLink,
  PaymentLinkStatus,
  CreatePaymentLinkArgs,
  Transaction,
  TransactionKind,
  ListTransactionsArgs,
  ListTransactionsResult,
  Payout,
  PayoutStatus,
  CreatePayoutArgs,
  BalanceSnapshot,
  OAuthAuthorizeArgs,
  OAuthTokenSet,
  OAuthExchangeArgs,
  OAuthRefreshArgs,
} from "./types";
