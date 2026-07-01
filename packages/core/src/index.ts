// Public API surface for @ar-agents/core.
//
// Shared primitives every @ar-agents/* package can build on:
// typed error base, telemetry hook contract, tool middleware.

export {
  ArAgentsError,
  ArAgentsValidationError,
  ArAgentsUnconfiguredError,
  ArAgentsAuthError,
  ArAgentsRateLimitError,
  ArAgentsProtocolError,
  isArAgentsError,
  type ArAgentsErrorInit,
} from "./errors";

export {
  type TelemetryHook,
  type ToolEvent,
  noopTelemetryHook,
  combineHooks,
  consoleTelemetryHook,
} from "./telemetry";

export {
  type AnyTool,
  type ToolMiddleware,
  compose,
  applyToAllTools,
  withMetrics,
  type WithMetricsOptions,
  withTimeout,
  withRetry,
  type WithRetryOptions,
  withApproval,
  type WithApprovalOptions,
} from "./middleware";

export {
  type RiskLevel,
  type ToolRiskInput,
  type EnforceRiskPolicyOptions,
  classifyTool,
  requiresApproval,
  levelRequiresApproval,
  enforceRiskPolicy,
} from "./risk-manifest";

export {
  type ToolApprovalCallInfo,
  type RiskToolApprovalStatus,
  type ToolApprovalFromRiskOptions,
  toolApprovalFromRisk,
} from "./tool-approval";

// Jurisdiction seam — global-first architecture. AR is jurisdiction #1, not the
// only one. Pure types + pure helpers; the host injects the real Registry/FiatRail.
export {
  type CountryCode,
  type SubdivisionCode,
  type CurrencyCode,
  type Jurisdiction,
  type JurisdictionRegistry,
  createJurisdictionRegistry,
  type FiatRail,
  type FiatRailQuote,
  type FiatRailReceipt,
  type FiatRailStatus,
  type FiatRailStatusReport,
  type Registry,
  type GoodStandingRecord,
  type GoodStandingAttestation,
  type PublicAnchor,
  type AttestationVerification,
  type TaxRule,
  type TaxableEvent,
  type TaxOwed,
} from "./jurisdiction";

export {
  type ArTaxRule,
  AR_CEDULAR,
  AR_MONOTRIBUTO,
  AR_TAX_RULES,
  createArJurisdiction,
} from "./jurisdictions/ar";

// USD-rail architecture (rail-neutral). The accounting_payload makes any USD
// stablecoin movement local-currency-correct; OpenUsdRail is the flagship FiatRail
// impl for Open USD (OUSD), MOCK-only until OUSD is live + legally cleared.
export {
  type FxRate,
  type FxOracle,
  type AccountingPayload,
  buildAccountingPayload,
  mockFxOracle,
} from "./rails/accounting";
export {
  OPEN_USD,
  type OpenUsdStatus,
  type OpenUsdRail,
  type OpenUsdRailOptions,
  type OpenUsdSettlementBackend,
  createOpenUsdRail,
  mockOpenUsdBackend,
} from "./rails/open-usd";
