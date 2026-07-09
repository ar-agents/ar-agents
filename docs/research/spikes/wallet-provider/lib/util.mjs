// Shared helpers for the M2-4a wallet-provider spike scripts. Plain ESM,
// builtins only (no dependency on either provider SDK), so this module is
// safe to import even before `npm install` has been run in this directory,
// and safe to import on the no-env-keys "print setup and exit 0" path.

/** Base Sepolia canonical (Circle-issued) USDC contract, 6 decimals. */
export const BASE_SEPOLIA_USDC_ADDRESS = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const USDC_DECIMALS = 6;

export const TIMEOUT_MS = 15_000;

/** Name both provider scripts use for the spike wallet, per the task. */
export const WALLET_NAME = "soc-spike-1";

/** Approximate per-transaction spend cap for the policy demo. */
export const PER_TX_CAP_USDC = "1";

/**
 * Race a promise against a fixed timeout. No retries: a write that times out
 * is reported as a failure, never re-attempted -- this drives real testnet
 * transfers, and retrying a write is how you get duplicate transactions.
 */
export function withTimeout(promise, label, ms = TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`[timeout] ${label} did not settle within ${ms}ms`)),
      ms,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** "1" USDC -> 1000000n (atomic units, 6 decimals). No float math. */
export function usdcToAtomic(amountDecimalString) {
  const [whole, frac = ""] = String(amountDecimalString).split(".");
  const fracPadded = (frac + "0".repeat(USDC_DECIMALS)).slice(0, USDC_DECIMALS);
  return (
    BigInt(whole || "0") * 10n ** BigInt(USDC_DECIMALS) + BigInt(fracPadded || "0")
  );
}

/** Print the final structured summary. Callers exit 0 right after. */
export function printSummary(summary) {
  console.log("\n--- summary (JSON) ---");
  console.log(JSON.stringify(summary, null, 2));
}

/** The "not configured yet" block printed when required env vars are absent. */
export function printMissingEnvSetup({ provider, missing, lines }) {
  console.log(`[${provider}] spike: not configured yet.\n`);
  console.log(`Missing environment variable(s): ${missing.join(", ")}\n`);
  for (const line of lines) console.log(line);
  console.log(
    `\nOnce those are set (e.g. in .env.local, exported in your shell, or ` +
      `passed inline), re-run this script. It will provision a Base Sepolia ` +
      `testnet wallet named "${WALLET_NAME}", apply a spend policy, and try a ` +
      `policy-violating transfer (must be rejected) plus a compliant one if funded.`,
  );
}
