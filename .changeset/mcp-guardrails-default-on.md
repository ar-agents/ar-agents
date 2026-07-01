---
"@ar-agents/mcp": minor
---

**Guardrails: spending caps + amount-aware approval + a registry kill-switch.** These extend the art. 102 gate (they do not replace it).

- **Spending caps (opt-in, amount-aware, FAIL-SAFE).** Pass `createServer({ governance: { caps: { perOpMax, dailyMax, currency, extractAmount } } })`. A MONEY tool whose amount is WITHIN the per-op + daily limits AUTO-APPROVES (so an autonomous entity can make small payments without a human on each one); anything else falls back to the human `approve` hook. Safety is built in: amount-based auto-approval REQUIRES an operator-supplied, tool-aware `caps.extractAmount` that returns the TRUE charge for each of your money tools (e.g. MercadoPago `create_payment` → `args.amount_ars`; a payment preference → `sum(items[].unit_price * quantity)`). We deliberately do NOT guess the amount from generic arg keys — a caller could add a small decoy `amount` key (stripped by the tool's schema before execution) to auto-approve a large real charge. Any doubt (no `extractAmount`, an empty caps object with no limit set, an unreadable/negative/NaN amount, or a throwing extractor) → the human approve hook. **Default behaviour is unchanged:** with no `caps`, every money tool still needs the approve hook (fail-closed); non-money tools are never affected. The running daily total uses an in-memory per-process tally by default; supply your own via `governance.tally`.

- **`goodStandingHalt` kill-switch wired to the registry.** `createServer({ governance: { isHalted: goodStandingHalt({ entityId }) } })` makes the ar-agents registry able to REMOTELY halt this entity: once it is `suspended`/`revoked` in the registry good-standing oracle, every tool refuses. Best-effort (a transient oracle error does not halt by default; set `haltOnUnreachable: true` for a stricter posture).

- New exports: `decideSpending`, `inMemoryTally`, `goodStandingHalt`, and the `SpendingCaps` / `SpendingTally` / `SpendingDecision` types. The boot summary line shows the active caps.

MINOR (not patch): a server configured with `caps` + a correct `extractAmount` will auto-execute in-limit money tools that a no-caps server would have refused. Review your limits and your extractor before enabling.
