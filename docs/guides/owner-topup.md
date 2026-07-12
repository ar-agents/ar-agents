# Owner top-up (v0, manual USDC transfer)

ROADMAP.md M2-4d: fund a society wallet by sending USDC directly to its CDP
address on Base. The society's own software does not move this money, it
only observes the resulting on-chain balance, reflects it in
`TreasuryState`, and logs it to the signed audit trail.

## Procedure

1. Get the society wallet address: the CDP account address for the society
   (`account.address`, where `account` is the `CdpAccountLike` returned by
   `createSocietyWallet`/`getOrCreateAccount`).
2. From the owner's own wallet, send USDC on Base to that address:
   - Base mainnet USDC contract: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
   - Base Sepolia testnet USDC contract: `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
3. After the transfer confirms on-chain, observe and reconcile with
   `reconcileOwnerTopUp` (or the underlying primitives directly:
   `getUsdcBalance` from `@ar-agents/wallet-cdp`, then `reconcileTopUp` from
   `@ar-agents/treasury`).
4. Append the returned `auditSummary` to the signed audit log via
   `appendLocalAudit` (starter) so the top-up appears in the cockpit's
   "Acciones recientes".

## Code

```ts
import { ZERO_STATE } from "@ar-agents/treasury";
import { reconcileOwnerTopUp } from "@/lib/owner-topup";
import { appendLocalAudit } from "@/lib/audit-log";

// `account` is the society's CdpAccountLike (see createSocietyWallet).
// `knownState` is the last-known TreasuryState for this society -- the
// starter has no persisted treasury store yet, see "v0 limitations" below.
const result = await reconcileOwnerTopUp({
  account,
  knownState: ZERO_STATE,
  network: "base-sepolia",
});

if (result.auditSummary) {
  await appendLocalAudit({
    tool: "owner_topup_reconcile",
    governance: "money",
    errored: false,
    summary: result.auditSummary,
  });
}

// result.state.usd now reflects the observed on-chain USDC balance.
```

## v0 limitations

- `TreasuryState` is not persisted yet in the starter: `knownState` is
  injected by the caller on every call. A persistent per-society treasury
  store is future work.
- A balance observation does not capture the sender address, so the audit
  entry reads "origen desconocido" rather than naming who sent the funds.
- There is no automatic polling. `reconcileOwnerTopUp` is invoked on demand
  (e.g. by an operator, after confirming the transfer landed), not on a
  schedule.
