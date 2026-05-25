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
