#!/usr/bin/env node
// ROADMAP.md M2-4b -- one-shot LIVE proof, on Base Sepolia, of the two-layer
// gate this package builds. Mirrors the M2-4a spike
// (docs/research/spikes/wallet-provider/coinbase-spike.mjs) but drives THIS
// package's own createSocietyWallet / applySpendPolicy / guardedTransferUsdc,
// not ad-hoc SDK calls, so a pass here is a real proof of the built library,
// not just of the underlying SDK.
//
// Usage (never prints the sourced secrets):
//   set -a; source ~/Downloads/ar-agents-spike-keys.env; set +a
//   node packages/wallet-cdp/scripts/wallet-cdp-live-check.mjs
//
// What this proves:
//   1. applySpendPolicy attaches a real CDP calldata policy (cdp.policies.
//      createPolicy + evm.updateAccount succeed against the live API -- if
//      the evmData wire shape assumed in src/policy.ts is wrong, THIS call
//      fails loud here, which is the honest failure mode for an unverified
//      assumption, not a silently-inert policy).
//   2. guardedTransferUsdc, called with an amount ABOVE the policy's own cap,
//      is rejected by CDP itself -- surfaced as WalletCdpPolicyDeniedError.
//   3. guardedTransferUsdc, called with an amount AT/UNDER the cap to the
//      one allowlisted recipient (the wallet's own address -- a self-transfer,
//      same workaround the M2-4a spike used, since proving a THIRD-PARTY
//      recipient live needs a second funded account this script does not
//      assume exists), succeeds IF the wallet already holds testnet USDC
//      (skipped, not failed, otherwise -- same policy as the spike).
//
// This script is NOT part of `pnpm test` (no CI dependency on live network
// + real credentials); it is a manual, run-once verification artifact.

import {
  applySpendPolicy,
  createCdpClient,
  createSocietyWallet,
  guardedTransferUsdc,
} from "../dist/index.js";

const NETWORK = "base-sepolia";
const SOCIETY_ID = "wallet-cdp-live-check";
const MAX_PER_TX_ATOMIC = "10000"; // 0.01 USDC cap
const OVER_CAP_ATOMIC = "20000"; // 0.02 USDC -- violates the cap
const UNDER_CAP_ATOMIC = "5000"; // 0.005 USDC -- within the cap
// Base Sepolia USDC (Circle's official testnet deployment, verified against
// developers.circle.com/stablecoins/usdc-contract-addresses + BaseScan Sepolia).
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";

function requireEnv(keys) {
  const missing = keys.filter((k) => !process.env[k]?.trim());
  if (missing.length > 0) {
    console.error(
      `[wallet-cdp-live-check] missing env: ${missing.join(", ")}. Source ` +
        `~/Downloads/ar-agents-spike-keys.env first (see this script's header).`,
    );
    process.exit(0);
  }
}

async function main() {
  requireEnv(["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"]);

  const cdp = await createCdpClient();
  const account = await createSocietyWallet(cdp, SOCIETY_ID);
  console.log(`[wallet-cdp-live-check] wallet: ${account.address}`);

  const { policyId, rules } = await applySpendPolicy(cdp, account, {
    usdcContractAddress: USDC_BASE_SEPOLIA,
    maxPerTxAtomic: MAX_PER_TX_ATOMIC,
    // Self-transfer allowlist -- see the module header for why.
    recipientAllowlist: [account.address],
  });
  console.log(`[wallet-cdp-live-check] policy ${policyId} attached:`);
  console.log(JSON.stringify(rules, null, 2));

  const approveAlways = async () => true; // this run is proving the PROVIDER layer; approve unconditionally

  // 1. Over-cap transfer: CDP's own policy must reject it.
  let overCapBlocked = false;
  let overCapDetail = "";
  try {
    await guardedTransferUsdc({
      account,
      to: account.address,
      amountAtomic: OVER_CAP_ATOMIC,
      idempotencyKey: `live-over-cap-${Date.now()}`,
      thresholdAtomic: "0", // force layer 1 to run too (approveAlways clears it)
      approve: approveAlways,
      network: NETWORK,
    });
    console.log("[wallet-cdp-live-check] WARNING: over-cap transfer was NOT rejected.");
  } catch (err) {
    overCapBlocked = err?.code === "policy_denied";
    overCapDetail = String(err?.message ?? err);
    console.log(
      `[wallet-cdp-live-check] over-cap transfer ${overCapBlocked ? "blocked as expected" : "failed differently"}: ${overCapDetail}`,
    );
  }

  // 2. Under-cap transfer to the allowlisted (self) recipient: should succeed
  // IF the wallet already holds testnet USDC; otherwise skip (not a failure).
  let underCapAttempted = false;
  let underCapOk = false;
  let underCapDetail = "";
  try {
    const result = await guardedTransferUsdc({
      account,
      to: account.address,
      amountAtomic: UNDER_CAP_ATOMIC,
      idempotencyKey: `live-under-cap-${Date.now()}`,
      thresholdAtomic: "0",
      approve: approveAlways,
      network: NETWORK,
    });
    underCapAttempted = true;
    underCapOk = result.status === "executed";
    underCapDetail = JSON.stringify(result);
    console.log(`[wallet-cdp-live-check] under-cap transfer: ${underCapDetail}`);
  } catch (err) {
    underCapAttempted = true;
    underCapDetail = String(err?.message ?? err);
    console.log(
      `[wallet-cdp-live-check] under-cap transfer failed (likely unfunded wallet, fund via ` +
        `https://portal.cdp.coinbase.com/faucet): ${underCapDetail}`,
    );
  }

  console.log("\n[wallet-cdp-live-check] SUMMARY");
  console.log(JSON.stringify({ policyId, overCapBlocked, underCapAttempted, underCapOk }, null, 2));
}

main().catch((err) => {
  console.error(`[wallet-cdp-live-check] failed: ${err?.stack ?? err}`);
  process.exit(1);
});
