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
- **`getUsdcBalanceAtomic`** (M2-4d), read the wallet's current USDC balance. Parses CDP's `listTokenBalances()` response defensively -- the amount comes back as a nested `{amount:{amount,decimals}}` object on some responses, a bare value on others; unwrap before `BigInt`, same landmine the M2-4a spike found.
- **`checkBalanceAndDetectTopUp`** (M2-4d), the v0 owner top-up flow's detection half: compares the current balance against the last one seen (via an injectable `LastBalanceStore`) and reports an increase/decrease/none delta. Deliberately simple: no chain-scanning, no per-transaction attribution -- an AGGREGATED delta between two checks. See "Fondear la wallet (v0)" below.
- **`@ar-agents/wallet-cdp/tools`**, `walletCdpTools()`: two Vercel AI SDK 6 tools. `wallet_transfer_usdc`'s name matches `@ar-agents/core`'s risk-manifest "transfer" override, so a host that wires it through `enforceRiskPolicy` (the way `apps/sociedad-ia-starter` wires every package) gets the categorical art. 102 gate for free, in addition to this package's own amount-based threshold. `wallet_check_balance` is read-only and never gated (classifies "read").

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

## Fondear la wallet (v0)

ROADMAP.md M2-4d: no automated ARS-in top-up route exists yet (that is M2-4f, blocked on a legal review). Until then, the owner funds a society's wallet by sending USDC directly, on-chain, on Base. This is a manual procedure -- write it down, follow it exactly.

### 1. Conseguí la dirección de la wallet

Cada sociedad tiene UNA wallet CDP, provista una sola vez (`createSocietyWallet`, ver arriba). Para saber la dirección:

- **`GET /api/status`** del deploy de la sociedad (el mismo endpoint que usa el cockpit de studio, `Authorization: Bearer <STUDIO_STATUS_TOKEN>`): el campo `treasury.address` es la dirección pública de la wallet. `treasury.available: false` significa que la sociedad todavía no tiene una wallet CDP configurada (faltan `SOCIETY_ID` + `CDP_API_KEY_ID`/`CDP_API_KEY_SECRET`/`CDP_WALLET_SECRET`) -- resolvé eso primero.
- Alternativa: pedile al agente que corra `wallet_check_balance` (tool de solo lectura, siempre segura); la respuesta incluye `address`.

### 2. Mandá USDC, en la red correcta, al contrato correcto

- **Red**: la que indique `treasury.network` (o la variable de entorno `CDP_NETWORK` del deploy). Por defecto `base-sepolia` (testnet); en producción real es `base` (mainnet).
- **Token**: USDC nativo (no un USDC "bridgeado" de otra chain -- llega a una dirección distinta y NO se computa).
  - Base mainnet: `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`
  - Base Sepolia (testnet, faucet en https://portal.cdp.coinbase.com/faucet): `0x036CbD53842c5426634e7929541eC2318f3dCF7e`
- Mandá la transferencia ERC-20 `transfer(to, amount)` a esa dirección de wallet, desde donde tengas el USDC (un exchange con retiro a Base, otra wallet propia, etc).

### 3. Confirmá que llegó

- **`GET /api/status`** de nuevo: `treasury.balanceAtomic` (unidades atómicas, 6 decimales) y `treasury.usd` (el mismo número decimal que corresponde a `@ar-agents/treasury`'s `TreasuryState.usd` para esa sociedad) deberían reflejar el nuevo balance en cuanto la transacción confirme on-chain (segundos en Base).
- **`wallet_check_balance`**: si se corrió una vez ANTES del envío (para fijar la base de comparación) y se vuelve a correr DESPUÉS, la respuesta trae `depositDetected: true` y el log de auditoría de la sociedad registra una entrada `"USDC N recibido en la wallet (...) ejecutada"` -- ver el schema `MoneyAuditEvent` (`kind: "deposit"`) en `@ar-agents/treasury`.

### Limitación honesta (v0)

No hay indexer ni escaneo de la chain. `wallet_check_balance` compara el balance actual contra el ÚLTIMO chequeo guardado -- si se mandan dos transferencias entre dos chequeos, se ve como UN solo incremento agregado, no como dos depósitos separados. Tampoco hay atribución por transacción (no se sabe de qué dirección vino un depósito puntual sin mirar el explorer). El PRIMER chequeo que se corre nunca cuenta como "depósito detectado": es la base de referencia (el fondeo inicial de la wallet), no un top-up observado. Para atribución real, transacción por transacción, hace falta un indexer que escuche eventos `Transfer` del contrato USDC -- fuera de alcance para v0.

## Status

`0.1.0`, first ship, 40 tests (unit, mocked CDP client) plus one FULL LIVE proof on Base Sepolia (2026-07-12, `scripts/wallet-cdp-live-check.mjs`, real account + real `createPolicy`/`updateAccount` + real funded transfers):

- The `evmData` recipient/amount rule shape was reconstructed from CDP's documentation first, then corrected against the **installed SDK's own client-side zod schema** (`@coinbase/cdp-sdk/src/policies/evmSchema.ts`) after a first live attempt came back with a `ZodError` naming the exact expected shape (`values`, plural, for the `"in"` recipient condition, not `value`). See `src/policy.ts`'s header for the full paper trail.
- With the corrected shape, `applySpendPolicy` attached the policy server-side successfully.
- A transfer ABOVE the cap was rejected by CDP itself: `WalletCdpPolicyDeniedError: ... The request is forbidden due to violating at least one configured policy.`
- A transfer AT the cap, to the same allowlisted recipient, executed on-chain (tx `0x9f95e747516c72be2e759279e92a6cbba82e0fa317832eef6c754237ac15fd7f`, Base Sepolia).

This is the strongest form of proof available: not "the SDK accepted the shape" but "CDP's server enforced the decoded-calldata amount bound against a real transaction." See `docs/research/spikes/wallet-provider/COMPARISON.md` for the M2-4a finding this fixes.

`wallet_transfer_usdc` is wired into `apps/sociedad-ia-starter`'s agent loop with a durable per-society KV idempotency store (ROADMAP.md M2-4c). `wallet_check_balance` + the v0 owner top-up flow (M2-4d, this section) are wired in too: the starter's `GET /api/status` surfaces `treasury.address`/`treasury.balanceAtomic`/`treasury.usd`, and the balance tool's last-seen reading is persisted in the starter's own KV-backed `LastBalanceStore` (`apps/sociedad-ia-starter/src/lib/wallet-balance-store.ts`) so top-up detection survives across serverless invocations. 67 tests in this package (unit, mocked CDP client) plus the transfer-side live proof above.

`getUsdcBalanceAtomic` was ALSO run live (2026-07-13, against the same `wallet-cdp-live-check` society/wallet the M2-4b proof funded on Base Sepolia): it called the real `account.listTokenBalances({network:"base-sepolia"})` and correctly parsed the real response into `1000000` atomic units (1.0 USDC) -- confirming the defensive nested/bare-amount parsing in `./balance.ts` matches the REAL SDK response shape, not just the shapes the M2-4a spike guessed at.
