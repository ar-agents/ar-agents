# @ar-agents/core

Shared primitives for the `@ar-agents/*` family. Typed error base, telemetry hook contract, and composable tool middleware (metrics, retry, timeout, HITL approval). Zero runtime deps beyond the Vercel AI SDK tool shape.

```sh
pnpm add @ar-agents/core
```

## What's inside

### Typed errors

Every package in the family extends `ArAgentsError` so callers can write retry/fallback logic that's transferable across tools:

```ts
import {
  ArAgentsError,
  ArAgentsRateLimitError,
  ArAgentsValidationError,
  isArAgentsError,
} from "@ar-agents/core";

try {
  await tool.execute(args, ctx);
} catch (err) {
  if (isArAgentsError(err) && err.retryable) {
    await backoff();
    return retry();
  }
  if (err instanceof ArAgentsRateLimitError) {
    await sleep(err.retryAfterMs);
    return retry();
  }
  if (err instanceof ArAgentsValidationError) {
    surfaceToOperator(err.field, err.message);
  }
  throw err;
}
```

Every error carries `code: string`, `retryable: boolean`, and `context: Record<string, unknown>`. Subclasses (`ArAgentsAuthError`, `ArAgentsProtocolError`, etc.) populate them with sane defaults.

### Tool middleware

Composable wrappers around any Vercel AI SDK 6 tool. Mix and match:

```ts
import {
  compose,
  withMetrics,
  withRetry,
  withTimeout,
  withApproval,
  applyToAllTools,
  consoleTelemetryHook,
} from "@ar-agents/core";
import { mercadoPagoTools } from "@ar-agents/mercadopago";

const telemetry = consoleTelemetryHook();

const baseTools = mercadoPagoTools({ client, state, backUrl });

const tools = applyToAllTools(baseTools, (name) =>
  compose(
    // outermost first at runtime → HITL gate runs BEFORE retry
    withApproval(name, { approve: askUser }),
    withRetry({ maxAttempts: 3 }),
    withTimeout(name, 10_000),
    withMetrics(name, { telemetry }),
  ),
);
```

### Telemetry hooks

A tiny `TelemetryHook` interface keeps the family observability-agnostic. Plug your OTel exporter, Datadog shipper, Honeycomb, or console:

```ts
import { combineHooks, consoleTelemetryHook, type TelemetryHook } from "@ar-agents/core";

const myOtelHook: TelemetryHook = {
  onToolEvent(event) {
    span.setAttribute("tool.name", event.name);
    span.setAttribute("tool.ok", event.ok);
    // …
  },
};

const telemetry = combineHooks(consoleTelemetryHook(), myOtelHook);
```

A throwing hook never crashes the request — observability is best-effort by design.

### HITL approval gate

`withApproval` is the runtime enforcement of the `requiresConfirmation` flag in tools.manifest.json:

```ts
const tools = applyToAllTools(myTools, (name) =>
  withApproval(name, {
    approve: async (toolName, args) => {
      // Ask the user, call a policy engine, consult an allowlist…
      return await dialogConfirm(`Run ${toolName}?`, args);
    },
    refusedMessage: "Operator denied this operation.",
  }),
);
```

The gate runs BEFORE `execute`, so denied calls never burn the underlying API quota.

## Why a separate package

mercadopago shipped its own middleware + telemetry stack first. Lifting them to `@ar-agents/core` gives all 20+ packages the same primitives without each maintaining its own — the family looks coherent from the outside, and the shared concerns evolve in one place.

## License

MIT — Nazareno Clemente <naza@naza.ar>
