---
"@ar-agents/treasury": minor
---

New `MoneyAuditEvent`/`formatMoneyAuditSummary` in a pure `./audit` module
(ROADMAP.md M2-4c): a common, cross-leg money-audit schema shared by the
crypto leg (`@ar-agents/wallet-cdp` transfers) and this package's own fiat
leg (`OffRampAdapter` conversions), so both land in the same signed audit log
with the same shape instead of two ad hoc summaries. `leg: "crypto" | "fiat"`,
`kind: "transfer" | "offramp_convert"`, `outcome: "executed" | "deferred" |
"denied" | "failed"`; `formatMoneyAuditSummary` renders it into the short,
public-safe, es-AR one-line string the local audit rail expects (redacted-safe
by construction: only typed fields, no raw args/output, capped at 280 chars).
