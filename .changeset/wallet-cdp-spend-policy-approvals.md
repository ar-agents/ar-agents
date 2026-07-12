---
"@ar-agents/wallet-cdp": minor
---

New package (ROADMAP.md M2-4b): a Sociedad Automatizada's USDC wallet on
Coinbase CDP (Base), gated by two independent layers. `applySpendPolicy`
builds a CALLDATA-level CDP policy (`evmData` decoding `transfer(to, value)`)
instead of a plain `evmAddress` allowlist, closing the M2-4a finding that an
address allowlist matches the ERC-20 TOKEN CONTRACT, not the real recipient
buried in the calldata. `guardedTransferUsdc` requires an ar-agents
approvals-gate decision above a configurable threshold BEFORE the provider is
ever called, and CDP's own server-side policy remains a second, independent
layer regardless. Provider failures surface as typed `WalletCdpPolicyDeniedError`
(`code: "policy_denied"`, not retryable) vs `WalletCdpUpstreamError`
(`code: "upstream_error"`, retryable). `@ar-agents/wallet-cdp/tools` ships one
Vercel AI SDK 6 tool, `wallet_transfer_usdc`, whose name matches
`@ar-agents/core`'s risk-manifest "transfer" override for free.
