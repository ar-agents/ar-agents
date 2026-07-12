---
"@ar-agents/treasury": minor
---

ROADMAP.md M2-4d: `MoneyAuditKind` gains `"deposit"` -- an OBSERVED balance
increase on a society's own wallet (e.g. an owner's manual USDC top-up),
distinct from `"transfer"`/`"offramp_convert"` (actions the agent itself
took). `formatMoneyAuditSummary` renders it with direction-honest phrasing
("USDC 5.000000 recibido en la wallet ... ejecutada") instead of the
transfer/offramp "-> recipient" line, since a deposit has no counterparty to
report.
