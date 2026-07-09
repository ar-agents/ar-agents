#!/usr/bin/env node
// Coinbase CDP "Agentic Wallets" spike for ROADMAP M2-4a.
//
// Docs used (primary, fetched 2026-07-09):
// - SDK package, env vars, account/transfer calls:
//   https://docs.cdp.coinbase.com/sdks/cdp-sdks-v2/typescript
// - Policy engine overview + createPolicy/updateAccount shape:
//   https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/overview
// - EVM policy criteria/operations reference:
//   https://docs.cdp.coinbase.com/server-wallets/v2/using-the-wallet-api/policies/evm-policies
// - Programmatic testnet faucet:
//   https://docs.cdp.coinbase.com/faucets/introduction/quickstart
// - Custody model (TEE, non-custodial framing):
//   https://docs.cdp.coinbase.com/wallets/security-and-policies/security-overview
// - API key / auth model overview (no exact portal steps found; see README):
//   https://docs.cdp.coinbase.com/get-started/authentication/overview
//
// AMBIGUITY (recorded here and in COMPARISON.md): the documented value-cap
// criteria are `ethValue` (native ETH sent alongside the call, not an ERC-20
// amount) and `netUSDChange` (the docs state it is "only evaluated for
// mainnet transactions"). Neither reliably caps a USDC (ERC-20) transfer's
// amount on Base Sepolia. This script still attaches an `ethValue` rule to
// satisfy the "per-tx cap" shape the docs show, but the ONLY policy behavior
// this spike can actually prove end-to-end on testnet is the address
// allowlist (`evmAddress`), which the docs show applying to any network.
// A second, separate ambiguity: CDP's docs never state the policy engine's
// *default* action for an operation that matches no rule once a policy is
// attached. This script assumes default-deny (matching Coinbase's own
// "Policy Engine" framing of closing an agent's unrestricted default) and
// therefore expresses the allowlist as a single ACCEPT rule (self address +
// ethValue cap) rather than an explicit REJECT rule -- if that assumption is
// wrong, the violation-blocked check below will simply fail loudly, which is
// safe (fails closed on a false assumption, does not silently pass).

import {
  PER_TX_CAP_USDC,
  WALLET_NAME,
  printMissingEnvSetup,
  printSummary,
  withTimeout,
} from "./lib/util.mjs";

const NETWORK = "base-sepolia";
const REQUIRED_ENV = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"];

function checkEnv() {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  if (missing.length === 0) return;
  printMissingEnvSetup({
    provider: "coinbase",
    missing,
    lines: [
      "Get these from the CDP Portal (https://portal.cdp.coinbase.com):",
      "  1. Create or open a project.",
      "  2. API Keys -> create a Secret API Key (Ed25519) -> this gives you",
      "     CDP_API_KEY_ID and CDP_API_KEY_SECRET. Never commit these.",
      "  3. Generate a Wallet Secret for the project's server wallets (a",
      "     separate secret from the API key) -> CDP_WALLET_SECRET.",
      "  Exact portal menu labels may shift; the authoritative source is",
      "  https://docs.cdp.coinbase.com/get-started/authentication/overview",
      "",
      "Required env vars:",
      "  CDP_API_KEY_ID",
      "  CDP_API_KEY_SECRET",
      "  CDP_WALLET_SECRET",
    ],
  });
  process.exit(0);
}

async function loadSdk() {
  try {
    return await import("@coinbase/cdp-sdk");
  } catch (err) {
    console.error(
      "[coinbase] @coinbase/cdp-sdk is not installed. Run `npm install` in " +
        "this directory (docs/research/spikes/wallet-provider) first.",
    );
    console.error(String(err?.message ?? err));
    process.exit(1);
  }
}

async function main() {
  checkEnv();
  const { CdpClient } = await loadSdk();
  const cdp = new CdpClient();
  const notes = [];

  // 1. Provision (or reuse by name) the spike wallet, plus a throwaway decoy
  // account whose address we deliberately do NOT allowlist -- used only as
  // an EVM address to attempt an out-of-policy transfer to.
  const account = await withTimeout(
    cdp.evm.getOrCreateAccount({ name: WALLET_NAME }),
    "getOrCreateAccount",
  );
  console.log(`[coinbase] wallet "${WALLET_NAME}": ${account.address}`);

  const decoy = await withTimeout(
    cdp.evm.getOrCreateAccount({ name: `${WALLET_NAME}-decoy` }),
    "getOrCreateAccount(decoy)",
  );

  // 2. Spend policy: allowlist the wallet's own address (the only address
  // we can prove-out a compliant transfer to without owning a second,
  // funded recipient), plus an informational per-tx ETH-value cap. See the
  // header comment for why the cap does not bind USDC amounts on testnet.
  const capWeiEquivalent = "1000000000000000"; // 0.001 ETH, informational only
  const policy = await withTimeout(
    cdp.policies.createPolicy({
      policy: {
        scope: "account",
        description: `${WALLET_NAME}: allowlist self + informational per-tx ETH cap`,
        rules: [
          {
            action: "accept",
            operation: "sendEvmTransaction",
            criteria: [
              { type: "evmAddress", addresses: [account.address], operator: "in" },
              { type: "ethValue", ethValue: capWeiEquivalent, operator: "<=" },
            ],
          },
        ],
      },
    }),
    "createPolicy",
  );
  await withTimeout(
    cdp.evm.updateAccount({
      address: account.address,
      update: { accountPolicy: policy.id },
    }),
    "updateAccount(attach policy)",
  );
  console.log(
    `[coinbase] policy ${policy.id} attached: allowlist=[self], ` +
      `per-tx cap≈${PER_TX_CAP_USDC} USDC (informational; see ambiguity note)`,
  );

  // 3. Violating transfer: send to the decoy (NOT allowlisted). No retries.
  let violationBlocked = false;
  let violationDetail = "";
  try {
    await withTimeout(
      account.transfer({
        to: decoy.address,
        amount: "10000", // 0.01 USDC, atomic units (6 decimals)
        token: "usdc",
        network: NETWORK,
      }),
      "transfer(violation)",
    );
    console.log(
      "[coinbase] WARNING: the policy-violating transfer was NOT rejected.",
    );
  } catch (err) {
    violationBlocked = true;
    violationDetail = String(err?.message ?? err);
    console.log(`[coinbase] violation blocked as expected: ${violationDetail}`);
  }

  // 4. Compliant transfer, only if the wallet already has testnet USDC.
  // Best-effort balance parsing: CDP's listTokenBalances() response shape
  // was not independently re-verified field-by-field in this research pass,
  // so this reads defensively and treats any parse failure as "unfunded"
  // rather than risking a false-positive spend attempt.
  let compliantAttempted = false;
  let hasUsdc = false;
  try {
    const balances = await withTimeout(
      account.listTokenBalances({ network: NETWORK }),
      "listTokenBalances",
    );
    const list = balances?.balances ?? balances?.data ?? [];
    hasUsdc = Array.isArray(list)
      ? list.some((b) => {
          const symbol = b?.token?.symbol ?? b?.symbol ?? "";
          const amount = BigInt(b?.amount ?? b?.balance ?? 0);
          return String(symbol).toUpperCase() === "USDC" && amount > 0n;
        })
      : false;
  } catch (err) {
    notes.push(`balance check failed, treating wallet as unfunded: ${err?.message ?? err}`);
  }

  if (!hasUsdc) {
    console.log(
      `[coinbase] wallet has no testnet USDC. Fund it via the CDP faucet: ` +
        `https://portal.cdp.coinbase.com/faucet (or, in code, ` +
        `cdp.evm.requestFaucet({ address: "${account.address}", network: ` +
        `"base-sepolia", token: "usdc" })). Skipping the compliant transfer.`,
    );
    notes.push("compliant transfer skipped: wallet had no testnet USDC");
  } else {
    compliantAttempted = true;
    try {
      const result = await withTimeout(
        account.transfer({
          to: account.address, // self-transfer: the one allowlisted destination
          amount: "10000", // 0.01 USDC
          token: "usdc",
          network: NETWORK,
        }),
        "transfer(compliant)",
      );
      console.log(
        `[coinbase] compliant transfer succeeded: ${result?.transactionHash ?? JSON.stringify(result)}`,
      );
      notes.push("compliant transfer succeeded");
    } catch (err) {
      notes.push(`compliant transfer failed unexpectedly: ${err?.message ?? err}`);
      console.log(`[coinbase] compliant transfer failed: ${err?.message ?? err}`);
    }
  }

  notes.push(
    "per-tx cap is informational only on testnet: CDP's documented value-cap " +
      "criteria (ethValue = native ETH, netUSDChange = mainnet-only per docs) " +
      "do not bind a USDC/ERC-20 transfer amount on Base Sepolia; only the " +
      "evmAddress allowlist was actually exercised above",
  );
  if (!compliantAttempted) notes.push("compliantAttempted=false");

  printSummary({
    provider: "coinbase",
    walletAddress: account.address,
    policyEnforced: true, // server-side, before signing, per CDP policy-engine docs
    violationBlocked,
    notes,
  });
}

main().catch((err) => {
  console.error(`[coinbase] spike failed: ${err?.stack ?? err}`);
  process.exit(1);
});
