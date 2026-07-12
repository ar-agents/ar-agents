# @ar-agents/wallet-cdp

A Sociedad Automatizada's USDC wallet on **Coinbase CDP** (Base), with a two-layer spend gate. ROADMAP.md M2-4a chose CDP over Circle after running both live on Base Sepolia (Circle's API-key-authenticated path has no provider-side policy at all; CDP's does). This package (M2-4b) wires that provider policy AND the existing ar-agents human-approval gate onto the same transfer, so a real spend needs both to clear.

## The gap this closes

For a native ETH transfer, the transaction's `to` field IS the recipient. For an ERC-20 USDC transfer, `to` is the **USDC contract**; the real recipient sits inside the `transfer(to, amount)` calldata. A plain address allowlist on `to` cannot tell a good USDC recipient from a bad one, since both go to the same contract. This package builds CDP's `evmData` policy criterion instead, which decodes the calldata and constrains the DECODED recipient and amount, closing the gap.

## What it does

- **`createSocietyWallet`**, provision (or reuse) one CDP account per society, name derived deterministically from the society id.
- **`buildErc20SpendPolicyRules` / `applySpendPolicy`**, the CALLDATA-level policy: an `evmAddress` rule pinning the contract to USDC, an `evmData` rule decoding `transfer(to, value)` to enforce a recipient allowlist (optional) and a per-tx cap, plus a default reject rule for native ETH. Attached server-side on CDP; enforced by CDP itself before signing, independent of anything this package's caller does.
- **`transferUsdc`**, execute a transfer; provider failures surface as one of two typed errors: `WalletCdpPolicyDeniedError` (`code: "policy_denied"`, not retryable, the policy engine said no) or `WalletCdpUpstreamError` (`code: "upstream_error"`, retryable, anything else).
- **`guardedTransferUsdc`**, the two-layer gate M2-4b asks for: above a configurable threshold, an ar-agents approvals-gate decision is required BEFORE the provider is ever called (below threshold, the gate is skipped and CDP's own policy is the only check); either layer can block the transfer independently of the other.
- **`encodeErc20TransferCalldata` / `decodeErc20TransferCalldata`**, the exact bytes (`viem`-backed): 4-byte selector, recipient right-aligned in a 32-byte slot, amount right-aligned in a 32-byte slot. Ground truth for what the `evmData` policy criterion is actually deciding on.
- **`@ar-agents/wallet-cdp/tools`**, `walletCdpTools()`: one Vercel AI SDK 6 tool, `wallet_transfer_usdc`. Its name matches `@ar-agents/core`'s risk-manifest "transfer" override, so a host that wires it through `enforceRiskPolicy` (the way `apps/sociedad-ia-starter` wires every package) gets the categorical art. 102 gate for free, in addition to this package's own amount-based threshold.

## Entry points

- `@ar-agents/wallet-cdp`, the wallet/policy/guard core + `createCdpClient`. No `ai`/`zod` deps.
- `@ar-agents/wallet-cdp/tools`, the AI SDK tool wrapper (needs the `ai` + `zod` peers).

## The two layers, precisely

```
guardedTransferUsdc(to, amountAtomic, ...)
  1. classify "wallet_transfer_usdc" via the risk manifest -> "money"
  2. if amountAtomic >= thresholdAtomic:
       approved = await approve("wallet_transfer_usdc", {to, amountAtomic, idempotencyKey})
       if !approved -> return {status:"deferred"}   <- provider NEVER called
  3. transferUsdc(account, {to, amountAtomic, idempotencyKey})
       -> CDP's own policy (attached via applySpendPolicy) evaluates the
          decoded calldata server-side, before signing
       -> throws WalletCdpPolicyDeniedError if IT says no, even though
          step 2 already approved
```

`approve` is the exact same `(toolName, args) => Promise<boolean>` callback `@ar-agents/core`'s `withApproval` takes, so a host wires it to the SAME async consume-or-queue rail already live at `apps/sociedad-ia-starter/src/lib/governance.ts` -> `POST /api/approvals/gate`. No separate `approvalId` hand-off is introduced: the queue already dedupes on `(society, tool, argsHash)`.

## Configuration

Real usage needs `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET` (from the CDP Portal, https://portal.cdp.coinbase.com, see `createCdpClient`'s doc comment). Never logged; `createCdpClient` throws a typed, value-free `ArAgentsUnconfiguredError` naming only which keys are missing.

## Status

`0.1.0`, first ship, 40 tests (unit, mocked CDP client) plus one FULL LIVE proof on Base Sepolia (2026-07-12, `scripts/wallet-cdp-live-check.mjs`, real account + real `createPolicy`/`updateAccount` + real funded transfers):

- The `evmData` recipient/amount rule shape was reconstructed from CDP's documentation first, then corrected against the **installed SDK's own client-side zod schema** (`@coinbase/cdp-sdk/src/policies/evmSchema.ts`) after a first live attempt came back with a `ZodError` naming the exact expected shape (`values`, plural, for the `"in"` recipient condition, not `value`). See `src/policy.ts`'s header for the full paper trail.
- With the corrected shape, `applySpendPolicy` attached the policy server-side successfully.
- A transfer ABOVE the cap was rejected by CDP itself: `WalletCdpPolicyDeniedError: ... The request is forbidden due to violating at least one configured policy.`
- A transfer AT the cap, to the same allowlisted recipient, executed on-chain (tx `0x9f95e747516c72be2e759279e92a6cbba82e0fa317832eef6c754237ac15fd7f`, Base Sepolia).

This is the strongest form of proof available: not "the SDK accepted the shape" but "CDP's server enforced the decoded-calldata amount bound against a real transaction." See `docs/research/spikes/wallet-provider/COMPARISON.md` for the M2-4a finding this fixes.

Not yet wired into `apps/sociedad-ia-starter`'s agent loop (that wiring, plus a durable per-society KV idempotency store, is ROADMAP.md M2-4c/M2-4d territory).
