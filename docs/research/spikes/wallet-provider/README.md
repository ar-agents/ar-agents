# Wallet-provider spike (ROADMAP M2-4a)

Runnable comparison of Coinbase CDP Agentic Wallets vs Circle developer-controlled
wallets on Base Sepolia testnet: provision a wallet, apply a spend policy,
prove a policy-violating transfer gets rejected, and (if the wallet is funded)
send a compliant one. This is a spike, not product code: it lives outside the
pnpm workspace on purpose (see "Why this is not a workspace package" below).

Read `COMPARISON.md` for the decision doc this spike feeds, and
`docs/research/treasury-agent-banking.md` (sections 2 and 4) for the broader
treasury architecture this fits into.

## Quick start

```bash
cd docs/research/spikes/wallet-provider
npm install
```

Without any provider keys set, both scripts print a setup block and exit 0:

```bash
node coinbase-spike.mjs
node circle-spike.mjs
```

Once keys are set (see per-provider setup below), the same two commands
provision the testnet wallet, apply the policy, run the violation + compliant
transfer attempts, and end with a JSON summary:

```json
{
  "provider": "coinbase",
  "walletAddress": "0x...",
  "policyEnforced": true,
  "violationBlocked": true,
  "notes": ["..."]
}
```

## Coinbase CDP setup

1. Go to the [CDP Portal](https://portal.cdp.coinbase.com) and create or open
   a project.
2. Under API Keys, create a **Secret API Key** (Ed25519 recommended). This
   gives you `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`.
3. Generate a **Wallet Secret** for the project's server wallets (a separate
   credential from the API key). This gives you `CDP_WALLET_SECRET`.
4. Exact portal menu labels were not independently re-verified in this
   research pass (WebFetch could not reach the interactive portal UI); the
   authoritative source is
   https://docs.cdp.coinbase.com/get-started/authentication/overview. If a
   label has moved, look for "API Keys" and "Wallet Secret" / "Server
   Wallets" sections.
5. Export the three env vars, then run `node coinbase-spike.mjs`.

Testnet funding is automatic in principle: CDP exposes a programmatic faucet
(`cdp.evm.requestFaucet({ address, network: "base-sepolia", token: "usdc" })`,
see https://docs.cdp.coinbase.com/faucets/introduction/quickstart). This
spike does not call it automatically (the task's brief is check-balance,
skip-if-unfunded, print-faucet-URL); if the wallet comes up empty, either
call `requestFaucet` yourself in a REPL, or use
https://portal.cdp.coinbase.com/faucet directly with the printed address.

## Circle setup

1. Go to the [Circle developer console](https://console.circle.com), create
   or open a project, and switch to the **Testnet** environment.
2. Under API Keys, create a key. This gives you `CIRCLE_API_KEY`.
3. Generate and register an entity secret (one-time per project). This is
   the extra step Circle's flow has that Coinbase's does not:
   ```bash
   npm install  # if not already done
   npx tsx --env-file=.env register-entity-secret.ts
   ```
   where `register-entity-secret.ts` is a small script (not included here;
   see https://developers.circle.com/wallets/dev-controlled/register-entity-secret
   for the exact content) that calls `generateEntitySecret()` then
   `registerEntitySecretCiphertext({ apiKey, entitySecret,
   recoveryFileDownloadPath })` from `@circle-fin/developer-controlled-wallets`.
   Store the printed secret as `CIRCLE_ENTITY_SECRET` and keep the downloaded
   recovery file somewhere safe, outside this repo.
4. Export the two env vars, then run `node circle-spike.mjs`.

Testnet funding is manual: https://faucet.circle.com/, paste the wallet
address the script prints, select Base Sepolia. The script checks the
balance once and, if empty, prints this URL and skips the compliant transfer.

## What each script actually proves

- **Coinbase (`coinbase-spike.mjs`):** creates or reuses an account named
  `soc-spike-1`, attaches a server-side CDP policy (`cdp.policies.createPolicy`)
  that allowlists the account's own address, attempts a transfer to a
  different (decoy) address, and expects CDP to reject it before it reaches
  the chain. This is the one policy behavior this spike can prove end to end
  on testnet; see the "per-tx cap" caveat in the script's header comment and
  in `COMPARISON.md` (the documented dollar-cap criteria are either
  native-ETH-only or mainnet-only, not confirmed to bind a USDC amount on
  Base Sepolia).
- **Circle (`circle-spike.mjs`):** creates or reuses a wallet set and a wallet
  named `soc-spike-1`, then enforces an allowlist + cap check in the
  script's own code (not Circle's infrastructure) before calling
  `createTransaction`. This is the load-bearing negative finding of the
  spike: no documented policy/allowlist endpoint was found for Circle's
  developer-controlled wallets (API-key auth), so `policyEnforced: false` in
  its summary is deliberate, not an oversight. Full reasoning in
  `COMPARISON.md`.

Both scripts: 15 second timeout per SDK call, no retries on any write (a
timed-out transfer is reported as failed, never resubmitted), and never log
`CDP_API_KEY_SECRET`, `CDP_WALLET_SECRET`, or `CIRCLE_ENTITY_SECRET` (the
scripts only ever pass those into the SDK's constructor, never into a
`console.log` or the JSON summary).

## Why this is not a workspace package

`pnpm-workspace.yaml` only globs `apps/*` and `packages/*`, so this
directory (`docs/research/spikes/wallet-provider`) is invisible to `pnpm -r`
commands, including `pnpm typecheck` at the repo root. Its `package.json` and
`node_modules` (installed with plain `npm`, not `pnpm`) never touch the
workspace's `pnpm-lock.yaml`. This is intentional: a spike's SDK choices
should not become a workspace-wide dependency decision.

## Troubleshooting

- `Cannot find package '@coinbase/cdp-sdk' ...` or the Circle equivalent:
  run `npm install` in this directory first.
- A script exits 1 with a stack trace: that is a real testnet/API failure
  (network, bad credentials, rate limit), not a missing-env-var case (that
  path always exits 0 with a setup block).
- If the "violation blocked" step is not blocked (prints a `WARNING:` line
  instead), that is itself a finding worth recording. Do not treat it as a
  bug in the script before reading the corresponding ambiguity note in
  `COMPARISON.md` and the script's own header comment.
