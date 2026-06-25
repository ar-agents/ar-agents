---
"@ar-agents/core": patch
---

Security: `withTimeout` now throws a NON-retryable timeout error. Previously it
marked the timeout `retryable: true` while NOT cancelling the underlying call,
so composing `withApproval` + `withRetry` + `withTimeout` could re-invoke a
still-running side-effectful tool after a timeout — turning one approved
money/fiscal/irreversible action into several (double-execution). An uncancelled
timeout must not be retried; retry-on-timeout is only safe once execution is
genuinely aborted (AbortSignal) or protected by a deterministic idempotency key.
(Found by a DeepSec audit; regression test added.)
