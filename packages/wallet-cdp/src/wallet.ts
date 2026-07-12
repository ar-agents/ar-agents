/**
 * Society wallet provisioning + transfer, on Coinbase CDP (Base). Talks to a
 * narrow, structural interface (`CdpClientLike` / `CdpAccountLike`) rather
 * than the concrete `@coinbase/cdp-sdk` types, so tests can inject a plain
 * mock (no real credentials, no network) the same way
 * `packages/treasury`'s `OffRampAdapter` is mocked. `createCdpClient()` is
 * the one place the real SDK is imported and instantiated.
 */

import { ArAgentsUnconfiguredError, ArAgentsValidationError } from "@ar-agents/core";
import { classifyCdpError } from "./errors";
import { type CdpPolicyRule, buildErc20SpendPolicyRules, sanitizePolicyDescription, type Erc20SpendPolicyOptions } from "./policy";

// ─────────────────────────────────────────────────────────────────────────────
// Structural CDP surface -- the ONLY thing this package depends on at the type
// level. Matches the shape `@coinbase/cdp-sdk`'s `CdpClient` actually exposes
// (confirmed against docs.cdp.coinbase.com/sdks/cdp-sdks-v2/typescript and the
// M2-4a spike, coinbase-spike.mjs), kept minimal on purpose.
// ─────────────────────────────────────────────────────────────────────────────

export interface CdpTransferResult {
  transactionHash?: string;
  [key: string]: unknown;
}

export interface CdpAccountLike {
  address: string;
  transfer(args: { to: string; amount: string; token: string; network: string }): Promise<CdpTransferResult>;
}

export interface CdpPolicyHandle {
  id: string;
}

export interface CdpEvmClientLike {
  getOrCreateAccount(args: { name: string }): Promise<CdpAccountLike>;
  updateAccount(args: { address: string; update: { accountPolicy: string } }): Promise<unknown>;
}

export interface CdpPoliciesClientLike {
  createPolicy(args: { policy: { scope: "account"; description: string; rules: CdpPolicyRule[] } }): Promise<CdpPolicyHandle>;
}

export interface CdpClientLike {
  evm: CdpEvmClientLike;
  policies: CdpPoliciesClientLike;
}

const REQUIRED_ENV = ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"] as const;

/**
 * Construct the real CDP client. Reads `CDP_API_KEY_ID` / `CDP_API_KEY_SECRET`
 * / `CDP_WALLET_SECRET` -- NEVER logs them. Throws `ArAgentsUnconfiguredError`
 * (naming only which env vars are missing, never a value) if any are absent.
 * Lazily imports `@coinbase/cdp-sdk` so a caller that only needs the pure
 * policy-building helpers never pays for loading it.
 */
export async function createCdpClient(env: NodeJS.ProcessEnv = process.env): Promise<CdpClientLike> {
  const missing = REQUIRED_ENV.filter((k) => !env[k]?.trim());
  if (missing.length > 0) {
    throw new ArAgentsUnconfiguredError("wallet-cdp", "missing CDP credentials", { missing });
  }
  const { CdpClient } = await import("@coinbase/cdp-sdk");
  // The SDK reads CDP_API_KEY_ID/CDP_API_KEY_SECRET/CDP_WALLET_SECRET from
  // process.env itself (see docs.cdp.coinbase.com/get-started/authentication/
  // overview); we only pre-check them above so a misconfiguration fails with
  // OUR typed error instead of a raw SDK exception deep in a tool call.
  return new CdpClient() as unknown as CdpClientLike;
}

/** Sanitize a society id into a legal CDP account name (conservative charset). */
function accountNameForSociety(societyId: string): string {
  const slug = societyId
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/(^-+|-+$)/g, "")
    .slice(0, 40);
  if (!slug) {
    throw new ArAgentsValidationError("societyId", "must contain at least one alphanumeric character");
  }
  return `society-${slug}`;
}

/**
 * Provision (or reuse, by name) the CDP account for a society's USDC wallet.
 * One account per society -- name is deterministic from `societyId`, so a
 * retried provisioning call reuses the SAME account instead of minting a
 * second wallet (CDP's `getOrCreateAccount` is itself idempotent on name).
 */
export async function createSocietyWallet(cdp: CdpClientLike, societyId: string): Promise<CdpAccountLike> {
  const name = accountNameForSociety(societyId);
  return cdp.evm.getOrCreateAccount({ name });
}

export interface ApplySpendPolicyResult {
  policyId: string;
  rules: CdpPolicyRule[];
}

/**
 * Build the calldata-level ERC-20 spend policy (see ./policy.ts) and attach
 * it to `account` server-side. This is CDP's half of the two-layer gate: once
 * attached, CDP itself refuses a violating transfer BEFORE signing,
 * independent of anything the calling application does or forgets to check.
 */
export async function applySpendPolicy(
  cdp: CdpClientLike,
  account: CdpAccountLike,
  opts: Erc20SpendPolicyOptions & { description?: string },
): Promise<ApplySpendPolicyResult> {
  const rules = buildErc20SpendPolicyRules(opts);
  const description = sanitizePolicyDescription(
    opts.description ?? `ar-agents usdc spend cap ${opts.maxPerTxAtomic}`,
  );
  const policy = await cdp.policies.createPolicy({
    policy: { scope: "account", description, rules },
  });
  await cdp.evm.updateAccount({ address: account.address, update: { accountPolicy: policy.id } });
  return { policyId: policy.id, rules };
}

export interface TransferUsdcOptions {
  to: string;
  /** Atomic base units (USDC: 6 decimals). */
  amountAtomic: string;
  /** REQUIRED idempotency key -- see `withTransferIdempotency` for reuse-on-retry semantics. */
  idempotencyKey: string;
  /** CDP network identifier. Default "base-sepolia" (testnet). Pass "base" for mainnet. */
  network?: string;
}

export interface TransferReceipt {
  to: string;
  amountAtomic: string;
  transactionHash?: string;
  idempotencyKey: string;
}

/**
 * Execute a USDC transfer from a society's CDP account. Whatever spend policy
 * `applySpendPolicy` attached is enforced by CDP itself, server-side, before
 * this call returns -- a violating request throws a typed
 * `WalletCdpPolicyDeniedError`; anything else throws `WalletCdpUpstreamError`.
 * Never catches and swallows: a caller relying on this to move real money
 * must see exactly which of the two happened.
 */
export async function transferUsdc(account: CdpAccountLike, opts: TransferUsdcOptions): Promise<TransferReceipt> {
  if (!opts.idempotencyKey) {
    throw new ArAgentsValidationError("idempotencyKey", "is required");
  }
  const network = opts.network ?? "base-sepolia";
  try {
    const result = await account.transfer({
      to: opts.to,
      amount: opts.amountAtomic,
      token: "usdc",
      network,
    });
    return {
      to: opts.to,
      amountAtomic: opts.amountAtomic,
      idempotencyKey: opts.idempotencyKey,
      ...(typeof result?.transactionHash === "string" ? { transactionHash: result.transactionHash } : {}),
    };
  } catch (err) {
    throw classifyCdpError(err, `transferUsdc(${opts.to})`);
  }
}

export type TransferFn = (account: CdpAccountLike, opts: TransferUsdcOptions) => Promise<TransferReceipt>;

/**
 * Wrap a transfer function so a retried OR concurrent call with the SAME
 * `idempotencyKey` returns the ORIGINAL receipt instead of sending a second,
 * real transfer -- the wallet-layer analogue of `@ar-agents/treasury`'s
 * `withOffRampIdempotency` (packages/treasury/src/index.ts), same store /
 * in-flight-map shape. The default store is in-memory (per process instance);
 * inject a shared, durable store for cross-instance idempotency.
 */
export function withTransferIdempotency(transfer: TransferFn, store: Map<string, TransferReceipt> = new Map()): TransferFn {
  const inflight = new Map<string, Promise<TransferReceipt>>();
  return async (account, opts) => {
    if (!opts.idempotencyKey) {
      throw new ArAgentsValidationError("idempotencyKey", "is required");
    }
    const done = store.get(opts.idempotencyKey);
    if (done) return done; // retry: return the original receipt, never re-send
    const running = inflight.get(opts.idempotencyKey);
    if (running) return running; // concurrent: share the single in-flight transfer
    const p = (async () => {
      const receipt = await transfer(account, opts);
      store.set(opts.idempotencyKey, receipt);
      return receipt;
    })();
    inflight.set(opts.idempotencyKey, p);
    try {
      return await p;
    } finally {
      inflight.delete(opts.idempotencyKey);
    }
  };
}
