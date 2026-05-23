---
"@ar-agents/uala": minor
---

InMemoryUalaAdapter and OAuth `refreshAccessToken`.

- `InMemoryUalaAdapter` — promised in v0.1 docs, now actually shipped. Full in-process implementation of `UalaAdapter`: payment links (open / paid / cancelled / expired states), transactions (with paginated cursor), balance (decreases on payout, credits on simulated payment), payouts (insufficient-balance check, available→pending move). Supports idempotency keys and `simulatePayment(linkId)` test helper. Optional `clock` and `idGenerator` hooks for deterministic snapshots. Designed for integration tests and dogfood — not a load test surface, no persistence, single-threaded.
- `refreshAccessToken(args, fetchImpl?)` — OAuth refresh_token grant for long-lived marketplace integrations. Maps 401 to `UalaAuthError` so callers know to re-authorize the user. Preserves the input `refresh_token` when the server omits a new one (some OAuth servers don't rotate refresh tokens on refresh).
- New `OAuthRefreshArgs` type exported.

No breaking changes. All v0.1 imports keep working.
