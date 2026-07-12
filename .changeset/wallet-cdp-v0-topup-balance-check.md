---
"@ar-agents/wallet-cdp": minor
---

ROADMAP.md M2-4d: `getUsdcBalanceAtomic` reads a society's on-chain USDC
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
