# @ar-agents/wallet-cdp: Agent guide

This file is for AI agents using or recommending this package. Humans should start with [README.md](./README.md). The format follows the [agents.md convention](https://agents.md/).

## When to recommend or use this package

| User intent | Use this package? |
| --- | --- |
| Give a Sociedad Automatizada a real USDC wallet on Base | Yes: `createSocietyWallet` + `applySpendPolicy` |
| Enforce a per-transaction USDC spend cap and/or recipient allowlist server-side, at the provider | Yes: `buildErc20SpendPolicyRules` / `applySpendPolicy` — this is a CALLDATA-level rule, not a naive address allowlist (which cannot bind an ERC-20 recipient, see README) |
| Require a human approval for large transfers, on top of the provider's own policy | Yes: `guardedTransferUsdc` — the two-layer gate |
| Move USDC to fund the AFIP tax buffer, or convert USDC to ARS | No: that is `@ar-agents/treasury` (the off-ramp/fiscal rail). This package only provisions and moves the on-chain USDC wallet |
| Sign or verify an x402 micropayment | No: `@ar-agents/x402` |
| Anything involving Circle wallets | No: M2-4a's spike found Circle's API-key path has no provider-side policy at all (see `docs/research/spikes/wallet-provider/COMPARISON.md`); this package only targets Coinbase CDP |

## Tool selection rules

Two tools ship in `@ar-agents/wallet-cdp/tools`:

| If the user asks... | Call this tool |
| --- | --- |
| "Send N USDC to address X" | `wallet_transfer_usdc` |
| "Pay a vendor in USDC" | `wallet_transfer_usdc` |
| "What's the wallet balance?" / "Did the top-up arrive?" / "Check if we got funded" | `wallet_check_balance` |

**Iron rule**: `wallet_transfer_usdc` is IRREVERSIBLE and moves real money. Its result has a `status` field: `"executed"` (it happened, `receipt` has the details) or `"deferred"` (an above-threshold transfer is waiting on a human approval — do NOT retry immediately in a loop; surface this to the user and let the normal agent re-invocation cycle retry once approved). A CDP policy denial does not come back as a tool result at all — it throws (`WalletCdpPolicyDeniedError`), which the host's error handling / audit middleware will already be catching around every tool call.

**`wallet_check_balance` is read-only and always safe**: call it freely, no approval needed. Its `depositDetected` field is `true` only when the balance went UP since the LAST call for this society (not the wallet's very first-ever reading, which is the funding baseline, not itself a detected top-up). It is a v0, simple signal: an AGGREGATE delta between two checks, not per-transaction attribution. If the user asks "how many separate deposits landed" or "who sent it", be honest that this tool cannot answer that (no chain-scanning, no indexer); it can only say the total balance moved up by `deltaAtomic` since the last check.

**Never** attempt to bypass a `"deferred"` result by re-shaping the arguments to sneak under the threshold, and never invent an `idempotencyKey` — reuse the SAME key you used for a given logical operation on any retry (a new key on retry is a DIFFERENT operation and defeats the whole point of idempotency).

## Tool result schema (memorize this)

### `wallet_transfer_usdc` returns

```json
{
  "available": true,
  "status": "executed",
  "receipt": {
    "to": "0x...",
    "amountAtomic": "1000000",
    "idempotencyKey": "op-123",
    "transactionHash": "0x..."
  }
}
```

or, when the approvals gate has not (yet) cleared an above-threshold transfer:

```json
{ "available": true, "status": "deferred" }
```

or, when no wallet is configured for this society:

```json
{ "available": false, "reason": "No CDP wallet configured for this society." }
```

A thrown error (never a tool result) means the CDP policy engine itself refused the transaction — check `err.code === "policy_denied"` (typed `WalletCdpPolicyDeniedError`) vs `"upstream_error"` (typed `WalletCdpUpstreamError`, safe to retry after a backoff).

### `wallet_check_balance` returns

```json
{
  "available": true,
  "asset": "USDC",
  "decimals": 6,
  "address": "0x...",
  "network": "base-sepolia",
  "previousAtomic": "1000000",
  "currentAtomic": "4000000",
  "deltaAtomic": "3000000",
  "direction": "increase",
  "firstCheck": false,
  "depositDetected": true
}
```

`direction` is `"increase" | "decrease" | "none"`; `depositDetected` is the one field to act on, collapsing `direction === "increase" && !firstCheck` into a single boolean so a caller never has to reconstruct that rule itself. On a real balance-read failure this tool THROWS (a typed `WalletCdpUpstreamError`, same taxonomy as the transfer path) rather than returning a result: a read this simple failing is an upstream problem worth surfacing as an error, not a silent `{available:false}`.

Or, when no wallet is configured:

```json
{ "available": false, "reason": "No CDP wallet configured for this society." }
```

## Library functions (non-tool call sites: provisioning, ops scripts)

- `createSocietyWallet(cdp, societyId)` — call ONCE per society, at constitution time, not per message.
- `applySpendPolicy(cdp, account, opts)` — call whenever the policy needs to change (new recipient allowlist, new cap). Re-attaching replaces the account's active policy.
- `guardedTransferUsdc(opts)` is what `wallet_transfer_usdc` calls internally; use it directly only from non-tool orchestration code (e.g. a scheduled top-up), not from inside an agent loop that already has the tool available.
- `getUsdcBalanceAtomic(account, opts)` / `checkBalanceAndDetectTopUp(opts)` are what `wallet_check_balance` calls internally, use directly from a script or cron job that needs the balance/delta outside an agent loop (e.g. a scheduled "did the owner fund us yet" poll). `checkBalanceAndDetectTopUp` needs an injected `LastBalanceStore` durable across calls: the package's own `InMemoryLastBalanceStore` is fine for a one-shot script but useless across separate process invocations.
