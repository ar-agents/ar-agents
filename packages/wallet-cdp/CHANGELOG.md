# @ar-agents/wallet-cdp

## 0.2.0

### Minor Changes

- [#197](https://github.com/ar-agents/ar-agents/pull/197) [`f41e618`](https://github.com/ar-agents/ar-agents/commit/f41e6187a23728232a9a60a18f09bd767cb1384a) Thanks [@naza00000](https://github.com/naza00000)! - New package (ROADMAP.md M2-4b): a Sociedad Automatizada's USDC wallet on
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

- [#204](https://github.com/ar-agents/ar-agents/pull/204) [`f6fc9ca`](https://github.com/ar-agents/ar-agents/commit/f6fc9ca5bcd13e19cf082b95c73f9ea86453a5cb) Thanks [@naza00000](https://github.com/naza00000)! - ROADMAP.md M2-4d: `getUsdcBalanceAtomic` reads a society's on-chain USDC
  balance (defensive parsing across CDP's `listTokenBalances()` response
  shapes -- a nested `{amount:{amount,decimals}}` object on some responses, a
  bare value on others, following the same unwrap-before-`BigInt` rule the
  M2-4a spike found necessary). `checkBalanceAndDetectTopUp` compares the
  current balance against the last one seen (via an injectable
  `LastBalanceStore`, same "package defines the interface + an in-memory
  default, host injects a durable adapter" convention as
  `@ar-agents/mercadopago`'s `SubscriptionStateAdapter`) and reports an
  increase/decrease/none delta -- the v0 owner top-up detection: no
  chain-scanning, no per-transaction attribution, an aggregated delta between
  two checks. `@ar-agents/wallet-cdp/tools` ships a second tool,
  `wallet_check_balance` (read-only, classifies as `"read"`, never gated),
  returning `depositDetected: true` only on a genuine increase since a PRIOR
  check (the wallet's very first funding is the baseline, not itself a
  detected deposit).
