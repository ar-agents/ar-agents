---
"@ar-agents/treasury": minor
---

New `./audit` primitive (ROADMAP.md M2-4c): both the crypto leg (a wallet-cdp
`TransferReceipt`, matched structurally to avoid a package cycle) and the
fiat leg (an `OffRampReceipt`, reused verbatim) now append to ONE
HMAC-SHA256, hash-chained `TreasuryAuditEntry` log instead of two separate
schemas. `appendWalletTransfer` and `appendOffRampConversion` build entries
with a shared shape (amountUsd, counterparty, idempotencyKey, the original
receipt for forensics); `verifyAuditChain` re-signs every entry and checks
the prevHash links, catching both field tampering and reordered/replaced
entries. `TreasuryAuditLog` is a convenience stateful wrapper mirroring
`InMemoryOffRampAdapter`'s style for callers that want the chain kept for
them.
