---
"@ar-agents/uala": minor
"@ar-agents/iibb": minor
"@ar-agents/sicore": minor
"@ar-agents/iva-percepciones": minor
"@ar-agents/iva-retenciones": minor
---

Lift sweep: all 5 packages now extend `ArAgentsError` from `@ar-agents/core`.

The family error contract is now uniform across `uala`, `iibb`, `sicore`,
`iva-percepciones`, `iva-retenciones` (and `identity` from the previous
release). Every package's error base exposes:

- `code: string` — machine-readable
- `retryable: boolean` — for `@ar-agents/core` `withRetry` middleware
- `context: Record<string, unknown>` — structured ctx, never secrets

Backward-compatible:
- All existing public constructors are preserved (signature + behaviour).
- Existing extra fields (e.g. `UalaError.status`, `IibbError.details`,
  `SicoreRateNotFoundError.category`, etc.) are kept on the instance and
  also mirrored into `context` for new code that reads the
  `ArAgentsError` contract.
- `instanceof <PackageError>` continues to work; `isArAgentsError(e)`
  now additionally returns `true`.

`retryable` is currently `true` for `UalaError` codes `"api_error"` and
HTTP 5xx, and `false` everywhere else. Future refinements per package
are tracked in `internal/swarm-2026-05-26/01-progress.md`.
