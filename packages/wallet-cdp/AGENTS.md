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

One tool ships in `@ar-agents/wallet-cdp/tools`:

| If the user asks... | Call this tool |
| --- | --- |
| "Send N USDC to address X" | `wallet_transfer_usdc` |
| "Pay a vendor in USDC" | `wallet_transfer_usdc` |

**Iron rule**: `wallet_transfer_usdc` is IRREVERSIBLE and moves real money. Its result has a `status` field: `"executed"` (it happened, `receipt` has the details) or `"deferred"` (an above-threshold transfer is waiting on a human approval — do NOT retry immediately in a loop; surface this to the user and let the normal agent re-invocation cycle retry once approved). A CDP policy denial does not come back as a tool result at all — it throws (`WalletCdpPolicyDeniedError`), which the host's error handling / audit middleware will already be catching around every tool call.

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

## Library functions (non-tool call sites: provisioning, ops scripts)

- `createSocietyWallet(cdp, societyId)` — call ONCE per society, at constitution time, not per message.
- `applySpendPolicy(cdp, account, opts)` — call whenever the policy needs to change (new recipient allowlist, new cap). Re-attaching replaces the account's active policy.
- `guardedTransferUsdc(opts)` is what `wallet_transfer_usdc` calls internally; use it directly only from non-tool orchestration code (e.g. a scheduled top-up), not from inside an agent loop that already has the tool available.
