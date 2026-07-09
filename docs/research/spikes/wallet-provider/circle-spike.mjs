#!/usr/bin/env node
// Circle developer-controlled wallets spike for ROADMAP M2-4a.
//
// Docs used (primary, fetched 2026-07-09):
// - SDK package, env vars, quickstart:
//   https://developers.circle.com/wallets/dev-controlled/create-your-first-wallet.md
// - Client init (initiateDeveloperControlledWalletsClient) + createTransaction shape:
//   https://developers.circle.com/sdks/developer-controlled-wallets-nodejs-sdk
//   corroborated by https://github.com/circlefin/skills
//   (plugins/circle/skills/use-developer-controlled-wallets/SKILL.md and
//   .../references/check-balance-and-transfer-tokens.md)
// - Entity secret generation/registration:
//   https://developers.circle.com/wallets/dev-controlled/register-entity-secret
// - Testnet faucet: https://faucet.circle.com/
// - Agent Wallets policy claims (transfer limits, allowlists, blocklists):
//   https://developers.circle.com/agent-stack/agent-wallets
//   and quickstart https://developers.circle.com/agent-stack/agent-wallets/quickstart
// - OpenAPI spec checked for a policy endpoint (none found):
//   https://developers.circle.com/openapi/developer-controlled-wallets.yaml
//
// CRITICAL FINDING (see COMPARISON.md): this research pass found NO documented
// policy/rule/allowlist REST endpoint for developer-controlled wallets --
// the OpenAPI spec above has no path containing "policy", "rule",
// "allowlist", or "limit". Circle's separate "Agent Wallets" product DOES
// advertise transfer limits, recipient allowlists and contract blocklists,
// but its own quickstart is driven by an interactive `circle wallet login`
// CLI session (human OAuth-style auth), not the CIRCLE_API_KEY +
// CIRCLE_ENTITY_SECRET server-side auth this spike (and ROADMAP M2-4a's
// env-var contract) uses. Net effect: this script cannot hand a cap/allowlist
// to Circle's infrastructure the way the Coinbase script hands one to
// cdp.policies.createPolicy(). It enforces the cap and allowlist in ITS OWN
// application code, before ever calling createTransaction. That is a
// materially weaker guarantee (a compromised script bypasses it entirely)
// than Coinbase's server-side, pre-signing policy engine. This is flagged
// explicitly below (`policyEnforced: false`) rather than glossed over.
//
// SECONDARY AMBIGUITY: two different primary/near-primary sources gave two
// different field names for "which token to send" on createTransaction --
// one code sample used `tokenId` (a Circle-internal token identifier), the
// circlefin/skills reference file used `tokenAddress` (the ERC-20 contract
// address). This script uses `tokenAddress` (the more detailed, most
// recently fetched source) and notes the discrepancy here for whoever wires
// this for real.
//
// THIRD AMBIGUITY: whether createWallets accepts a `metadata: [{ name,
// refId }]` array to label a wallet for later lookup-by-name was not
// independently re-verified in the pages this pass fetched. The
// getOrCreateWallet() below tries that shape and falls back to "always
// create a fresh wallet" if listing/filtering by name fails -- safe for a
// spike (produces an extra wallet under the same wallet set) but not a
// clean reuse guarantee.

import {
  BASE_SEPOLIA_USDC_ADDRESS,
  PER_TX_CAP_USDC,
  WALLET_NAME,
  printMissingEnvSetup,
  printSummary,
  usdcToAtomic,
  withTimeout,
} from "./lib/util.mjs";

const BLOCKCHAIN = "BASE-SEPOLIA";
const WALLET_SET_NAME = "soc-spike-wallet-set";
const REQUIRED_ENV = ["CIRCLE_API_KEY", "CIRCLE_ENTITY_SECRET"];

function checkEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  printMissingEnvSetup({
    provider: "circle",
    missing,
    lines: [
      "Get these from the Circle developer console (https://console.circle.com):",
      "  1. Create or open a project, switch to the Testnet environment.",
      "  2. API Keys -> create a key -> this gives you CIRCLE_API_KEY.",
      "  3. Generate + register an entity secret (one-time, per project):",
      "     `npx tsx` a small script that imports `generateEntitySecret` and",
      "     `registerEntitySecretCiphertext` from",
      "     @circle-fin/developer-controlled-wallets and calls",
      "     registerEntitySecretCiphertext({ apiKey, entitySecret,",
      "     recoveryFileDownloadPath }). Store the printed entity secret as",
      "     CIRCLE_ENTITY_SECRET and keep the downloaded recovery file safe.",
      "  Steps: https://developers.circle.com/wallets/dev-controlled/register-entity-secret",
      "",
      "Required env vars:",
      "  CIRCLE_API_KEY",
      "  CIRCLE_ENTITY_SECRET",
    ],
  });
  process.exit(0);
}

async function loadSdk() {
  try {
    return await import("@circle-fin/developer-controlled-wallets");
  } catch (err) {
    console.error(
      "[circle] @circle-fin/developer-controlled-wallets is not installed. " +
        "Run `npm install` in this directory (docs/research/spikes/wallet-provider) first.",
    );
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}

async function getOrCreateWalletSet(client) {
  try {
    const existing = await withTimeout(client.listWalletSets({}), "listWalletSets");
    const found = (existing?.data?.walletSets ?? []).find((s) => s.name === WALLET_SET_NAME);
    if (found) return found;
  } catch (err) {
    // listWalletSets shape/name not independently re-verified; fall through.
  }
  const created = await withTimeout(
    client.createWalletSet({ name: WALLET_SET_NAME }),
    "createWalletSet",
  );
  return created?.data?.walletSet ?? created;
}

async function getOrCreateWallet(client, walletSetId) {
  try {
    const existing = await withTimeout(
      client.listWallets({ walletSetId }),
      "listWallets",
    );
    const found = (existing?.data?.wallets ?? []).find((w) => w.name === WALLET_NAME);
    if (found) return found;
  } catch (err) {
    // See "THIRD AMBIGUITY" in the header comment.
  }
  const created = await withTimeout(
    client.createWallets({
      blockchains: [BLOCKCHAIN],
      count: 1,
      walletSetId,
      accountType: "SCA",
      metadata: [{ name: WALLET_NAME, refId: WALLET_NAME }],
    }),
    "createWallets",
  );
  const wallet = created?.data?.wallets?.[0];
  if (!wallet) throw new Error("createWallets returned no wallet");
  return wallet;
}

/**
 * Application-level policy check -- NOT a Circle-hosted policy. See the
 * "CRITICAL FINDING" header comment for why this cannot be pushed server-side
 * the way the Coinbase spike's cdp.policies.createPolicy() call is.
 */
function checkPolicy({ destinationAddress, amountUsdc, allowlist, capUsdc }) {
  const dest = String(destinationAddress).toLowerCase();
  if (!allowlist.map((a) => a.toLowerCase()).includes(dest)) {
    return { ok: false, reason: `destination ${destinationAddress} not in allowlist` };
  }
  if (Number(amountUsdc) > Number(capUsdc)) {
    return { ok: false, reason: `amount ${amountUsdc} USDC exceeds cap ${capUsdc} USDC` };
  }
  return { ok: true };
}

async function main() {
  checkEnv();
  const { initiateDeveloperControlledWalletsClient } = await loadSdk();
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });
  const notes = [
    "policyEnforced=false: no documented Circle-hosted policy/allowlist " +
      "endpoint found for developer-controlled wallets in this research " +
      "pass (see header comment). Cap + allowlist below are enforced in " +
      "THIS SCRIPT only, before calling createTransaction.",
  ];

  const walletSet = await getOrCreateWalletSet(client);
  const wallet = await getOrCreateWallet(client, walletSet.id);
  console.log(`[circle] wallet "${WALLET_NAME}": ${wallet.address} (walletId ${wallet.id})`);

  // Allowlist = the wallet's own address (the one destination we can prove a
  // compliant transfer against without owning a second funded recipient).
  const allowlist = [wallet.address];
  const NOT_ALLOWLISTED_ADDRESS = "0x000000000000000000000000000000000000dEaD"; // well-known burn address, used only as a destination string

  // 1. Violating "transfer": wrong destination. Blocked by our own script
  // logic before any Circle API call is made -- Circle itself never sees it.
  const violationCheck = checkPolicy({
    destinationAddress: NOT_ALLOWLISTED_ADDRESS,
    amountUsdc: "0.01",
    allowlist,
    capUsdc: PER_TX_CAP_USDC,
  });
  const violationBlocked = !violationCheck.ok;
  if (violationBlocked) {
    console.log(
      `[circle] violation blocked by application-level check (not by Circle): ${violationCheck.reason}`,
    );
  } else {
    console.log("[circle] WARNING: application-level check did not catch the violation.");
  }

  // 2. Compliant transfer, only if the wallet already has testnet USDC.
  let hasUsdc = false;
  let usdcTokenId = null;
  try {
    const balanceResponse = await withTimeout(
      client.getWalletTokenBalance({ id: wallet.id }),
      "getWalletTokenBalance",
    );
    const tokenBalances = balanceResponse?.data?.tokenBalances ?? [];
    const usdcBalance = tokenBalances.find(
      (b) => (b?.token?.symbol ?? "").toUpperCase() === "USDC" && Number(b?.amount ?? 0) > 0,
    );
    hasUsdc = Boolean(usdcBalance);
    usdcTokenId = usdcBalance?.token?.id ?? null;
  } catch (err) {
    notes.push(`balance check failed, treating wallet as unfunded: ${err?.message ?? err}`);
  }

  let compliantAttempted = false;
  // usdcTokenId resolved above from the live balance: Circle's own token UUID
  // for USDC on Base Sepolia. Live run showed tokenAddress alone is rejected
  // with "API parameter invalid"; tokenId is the field that works.
  if (!hasUsdc) {
    console.log(
      `[circle] wallet has no testnet USDC. Fund it at https://faucet.circle.com/ ` +
        `(paste address ${wallet.address}, network Base Sepolia). Skipping the compliant transfer.`,
    );
    notes.push("compliant transfer skipped: wallet had no testnet USDC");
  } else {
    const complianceCheck = checkPolicy({
      destinationAddress: wallet.address,
      amountUsdc: "0.01",
      allowlist,
      capUsdc: PER_TX_CAP_USDC,
    });
    if (!complianceCheck.ok) {
      notes.push(`unexpected: compliant transfer failed its own policy check: ${complianceCheck.reason}`);
    } else {
      compliantAttempted = true;
      try {
        const result = await withTimeout(
          client.createTransaction({
            walletId: wallet.id,
            tokenId: usdcTokenId, // resolved from the live balance; tokenAddress alone was rejected (see SECONDARY AMBIGUITY)
            destinationAddress: wallet.address,
            amounts: ["0.01"],
            fee: { type: "level", config: { feeLevel: "MEDIUM" } },
            idempotencyKey: crypto.randomUUID(),
          }),
          "createTransaction(compliant)",
        );
        console.log(`[circle] compliant transfer submitted: ${JSON.stringify(result?.data ?? result)}`);
        notes.push("compliant transfer submitted");
      } catch (err) {
        notes.push(`compliant transfer failed unexpectedly: ${err?.message ?? err}`);
        console.log(`[circle] compliant transfer failed: ${err?.message ?? err}`);
      }
    }
  }
  const usdcAtomicForRecord = usdcToAtomic("0.01"); // documents the atomic-unit conversion this spike relies on elsewhere
  if (!compliantAttempted) notes.push(`compliantAttempted=false (0.01 USDC == ${usdcAtomicForRecord} atomic units)`);

  printSummary({
    provider: "circle",
    walletAddress: wallet.address,
    policyEnforced: false, // see CRITICAL FINDING above: enforced in this script, not by Circle
    violationBlocked,
    notes,
  });
}

main().catch((err) => {
  console.error(`[circle] spike failed: ${err?.stack ?? err}`);
  process.exit(1);
});
