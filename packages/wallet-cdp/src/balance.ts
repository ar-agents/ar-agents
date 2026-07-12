/**
 * Read a society's USDC balance and detect a top-up (ROADMAP.md M2-4d, "v0
 * owner top-up flow: manual USDC transfer").
 *
 * v0 semantics, deliberately simple and honestly limited: there is NO
 * chain-scanning and NO per-transaction attribution here. `checkBalanceAndDetectTopUp`
 * compares the wallet's CURRENT balance against the last balance it observed
 * (persisted by the caller-supplied `LastBalanceStore`) and reports whether
 * the balance went up, down, or stayed the same since that last check. A
 * "deposit detected" signal is therefore an AGGREGATE delta over the interval
 * between two checks -- if two separate top-ups land between checks, this
 * reports one combined increase, not two events. Real per-tx attribution
 * needs an indexer (e.g. watching `Transfer` events on the USDC contract) --
 * out of scope for v0; see packages/wallet-cdp/README.md's "Fondear la
 * wallet (v0)" section for the honest limitation written out for an owner.
 *
 * `getUsdcBalanceAtomic`'s response parsing follows the exact defensive
 * shape-handling the M2-4a spike found necessary (docs/research/spikes/
 * wallet-provider/coinbase-spike.mjs): CDP's `listTokenBalances()` returns
 * amounts as EITHER a nested `{ amount: "<atomic>", decimals }` object or a
 * bare string/number on different response shapes -- unwrap before `BigInt`,
 * never assume one shape.
 */

import { classifyCdpError } from "./errors";
import type { CdpAccountLike } from "./wallet";

/** One balance entry as CDP's `listTokenBalances()` may shape it -- kept
 *  loose (`unknown` fields) since the exact response shape was never
 *  independently pinned field-by-field (same caveat the M2-4a spike
 *  recorded); parsing below is defensive, not a typed contract. */
type RawTokenBalance = Record<string, unknown>;

function readSymbol(entry: RawTokenBalance): string {
  const token = entry.token as Record<string, unknown> | undefined;
  const symbol = token?.symbol ?? entry.symbol ?? "";
  return String(symbol).toUpperCase();
}

/** Unwrap a token-balance entry's amount into an atomic base-unit string,
 *  never throwing -- an unparseable amount reads as "0" (unfunded) rather
 *  than risking a false-positive deposit signal. */
function readAtomicAmount(entry: RawTokenBalance): string {
  const amountField = entry.amount as unknown;
  const raw =
    (amountField && typeof amountField === "object"
      ? (amountField as Record<string, unknown>).amount
      : amountField) ?? entry.balance ?? 0;
  try {
    return BigInt(raw as string | number | bigint).toString();
  } catch {
    return "0";
  }
}

/**
 * Parse CDP's `account.listTokenBalances()` response into the USDC atomic
 * balance. Defensive across the couple of plausible shapes the M2-4a spike
 * observed (`balances.balances` vs `balances.data`; a nested vs bare
 * amount); never throws -- an unrecognized shape or a missing USDC entry
 * reads as "0" rather than surfacing a parse error for a read this simple.
 */
export function parseUsdcBalanceAtomic(response: unknown): string {
  if (!response || typeof response !== "object") return "0";
  const r = response as Record<string, unknown>;
  const list = (r.balances ?? r.data ?? []) as unknown;
  if (!Array.isArray(list)) return "0";
  const entry = list.find((b): b is RawTokenBalance => {
    if (!b || typeof b !== "object") return false;
    return readSymbol(b as RawTokenBalance) === "USDC";
  });
  return entry ? readAtomicAmount(entry) : "0";
}

export interface GetUsdcBalanceOptions {
  /** CDP network identifier. Default "base-sepolia" (testnet), matching
   *  every other network default in this package (see ./wallet.ts). */
  network?: string;
}

/**
 * Structural surface this module needs beyond `transfer` -- kept separate
 * from `CdpAccountLike` in ./wallet.ts's own declaration so a caller who
 * only needs the transfer path is never forced to mock a balance method
 * it never calls; `CdpAccountLike` itself declares this optionally.
 */
export interface CdpAccountWithBalance extends CdpAccountLike {
  listTokenBalances(args: { network: string }): Promise<unknown>;
}

function hasBalanceMethod(account: CdpAccountLike): account is CdpAccountWithBalance {
  return typeof (account as Partial<CdpAccountWithBalance>).listTokenBalances === "function";
}

/**
 * Read the society wallet's current USDC balance, in atomic base units
 * (6 decimals). A read, not a transfer -- but a CDP-side failure (network,
 * auth, malformed response) still surfaces as the same typed
 * `WalletCdpUpstreamError` `transferUsdc` uses, so a caller's existing
 * `isArAgentsError` handling covers this path for free.
 */
export async function getUsdcBalanceAtomic(
  account: CdpAccountLike,
  opts: GetUsdcBalanceOptions = {},
): Promise<string> {
  if (!hasBalanceMethod(account)) {
    throw new Error(
      "getUsdcBalanceAtomic: this CdpAccountLike does not implement listTokenBalances " +
        "(a test mock is missing it, or the real SDK's account shape changed).",
    );
  }
  const network = opts.network ?? "base-sepolia";
  try {
    const response = await account.listTokenBalances({ network });
    return parseUsdcBalanceAtomic(response);
  } catch (err) {
    throw classifyCdpError(err, "getUsdcBalanceAtomic");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Delta detection -- pure, no network. Compares two atomic balance readings.
// ─────────────────────────────────────────────────────────────────────────────

export type BalanceDirection = "increase" | "decrease" | "none";

export interface BalanceDelta {
  previousAtomic: string;
  currentAtomic: string;
  /** Always non-negative -- the magnitude of the change; see `direction`
   *  for the sign. */
  deltaAtomic: string;
  direction: BalanceDirection;
}

/** Compare a previous and current atomic balance. Pure, no I/O. Treats a
 *  missing/unparseable previous reading as "0" (first-ever check: any
 *  positive balance reads as an increase from zero). */
export function detectBalanceChange(previousAtomic: string | null, currentAtomic: string): BalanceDelta {
  const prev = (() => {
    try {
      return BigInt(previousAtomic ?? "0");
    } catch {
      return 0n;
    }
  })();
  const curr = (() => {
    try {
      return BigInt(currentAtomic);
    } catch {
      return 0n;
    }
  })();
  const delta = curr - prev;
  return {
    previousAtomic: prev.toString(),
    currentAtomic: curr.toString(),
    deltaAtomic: (delta < 0n ? -delta : delta).toString(),
    direction: delta > 0n ? "increase" : delta < 0n ? "decrease" : "none",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// LastBalanceStore -- same "package defines the interface + an in-memory
// default, host injects a durable adapter" convention as
// @ar-agents/mercadopago's SubscriptionStateAdapter / InMemoryStateAdapter
// (packages/mercadopago/src/state.ts). A single process-local in-memory
// store is USELESS in a serverless host that recycles between requests (the
// "previous" reading would never survive to the next check) -- production
// hosts must inject a durable adapter (e.g. Vercel KV; see
// apps/sociedad-ia-starter/src/lib/wallet-balance-store.ts).
// ─────────────────────────────────────────────────────────────────────────────

export interface LastBalanceStore {
  get(key: string): Promise<string | null>;
  set(key: string, atomic: string): Promise<void>;
}

/** Volatile, single-process store. Fine for tests and a bare local
 *  checkout; USELESS across serverless invocations -- see the module
 *  header. Production hosts must inject a durable adapter. */
export class InMemoryLastBalanceStore implements LastBalanceStore {
  private readonly m = new Map<string, string>();
  async get(key: string): Promise<string | null> {
    return this.m.get(key) ?? null;
  }
  async set(key: string, atomic: string): Promise<void> {
    this.m.set(key, atomic);
  }
}

export interface CheckBalanceOptions {
  account: CdpAccountLike;
  network?: string;
  store: LastBalanceStore;
  /** Key this balance history is namespaced under -- the host should pass
   *  something stable per society (e.g. its `SOCIETY_ID`), so two societies
   *  sharing one store never see each other's deltas. */
  key: string;
}

export interface CheckBalanceResult extends BalanceDelta {
  /** Whether this is the first check ever for `key` (no prior reading in
   *  the store) -- surfaced so a caller can avoid reporting a misleading
   *  "deposit detected" for a wallet's initial funding versus a real,
   *  observed top-up between two checks. */
  firstCheck: boolean;
}

/**
 * Read the current balance, compare it against the last one this `key` saw
 * (via `store`), persist the new reading (so the NEXT check has a correct
 * baseline regardless of direction), and return the delta. This is the
 * whole of v0's "detection": no chain-scanning, no per-tx attribution --
 * see the module header.
 */
export async function checkBalanceAndDetectTopUp(opts: CheckBalanceOptions): Promise<CheckBalanceResult> {
  const [currentAtomic, previousAtomic] = await Promise.all([
    getUsdcBalanceAtomic(opts.account, { ...(opts.network !== undefined ? { network: opts.network } : {}) }),
    opts.store.get(opts.key),
  ]);
  const delta = detectBalanceChange(previousAtomic, currentAtomic);
  await opts.store.set(opts.key, delta.currentAtomic);
  return { ...delta, firstCheck: previousAtomic === null };
}
