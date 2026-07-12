/**
 * TreasuryAuditLog -- one unified, signed audit log for BOTH legs of the
 * crypto<->fiat bridge (ROADMAP.md M2-4c).
 *
 * A Sociedad Automatizada moves money in two different shapes: a crypto leg
 * (a wallet-cdp USDC transfer, `WalletTransferReceiptLike`) and a fiat leg (an
 * OffRampAdapter conversion, `OffRampReceipt`, defined in ./index). Each has
 * its own receipt fields and its own package. But from a forensic/legal point
 * of view (RFC-001 requires an audit trail; art. 102 puts a named human on the
 * hook for the society's acts) there is only ONE question that matters: what
 * money moved, in what order, and can a third party prove the record hasn't
 * been altered after the fact. Two separate logs -- one per leg -- would let
 * someone reorder or drop entries from one leg without it showing in the
 * other, and would force every auditor to reconcile two schemas by hand. This
 * module normalizes both legs into ONE `TreasuryAuditEntry` schema and chains
 * them together (HMAC of entry N-1 becomes entry N's `prevHash`), so the
 * union of a wallet transfer followed by an off-ramp conversion (the common
 * "convert taxes then pay AFIP" flow) is a single, ordered, tamper-evident
 * trail instead of two logs that must be cross-referenced.
 *
 * Signing follows the SAME Web Crypto HMAC-SHA256 convention as bitso.ts
 * (`globalThis.crypto.subtle`, raw-key import, sign, hex-encode) -- Edge-safe,
 * no `node:crypto`, and this file stays zod-free and ai-free like the rest of
 * the package's main entry. `OffRampReceipt` is imported with `import type`
 * only, so this module never creates a circular runtime import against
 * ./index (which itself does not import from ./audit).
 *
 * This is a pure, in-memory/functional primitive: it has no storage of its
 * own (unlike apps/landing/src/lib/audit.ts, which persists to Vercel KV).
 * The caller decides where the resulting entries live; `TreasuryAuditLog` is
 * just a convenience wrapper that keeps the chain in memory for a single
 * process/test, mirroring `InMemoryOffRampAdapter`'s style in index.ts.
 */

import type { OffRampReceipt } from "./index";

// ─────────────────────────────────────────────────────────────────────────────
// HMAC + canonicalization (matches bitso.ts's Web Crypto convention exactly)
// ─────────────────────────────────────────────────────────────────────────────

/** HMAC-SHA256 (hex) via Web Crypto -- Node 18+, Edge, Workers. Same shape as
 *  bitso.ts's `hmacSha256Hex`, kept local so ./audit has no import from
 *  ./bitso (an internal, unrelated adapter). */
async function hmacHex(secret: string, message: string): Promise<string> {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.subtle) {
    throw new Error("@ar-agents/treasury: Web Crypto subtle unavailable for HMAC");
  }
  const enc = new TextEncoder();
  const key = await c.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await c.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Thrown when a value nests deeper than CANONICAL_MAX_DEPTH. Our own typed
 *  entries never come close to this; it is belt-and-suspenders only. */
export class AuditCanonicalDepthError extends Error {
  constructor() {
    super("@ar-agents/treasury: canonicalize max nesting depth exceeded");
    this.name = "AuditCanonicalDepthError";
  }
}

const CANONICAL_MAX_DEPTH = 32;

/**
 * Deterministic JSON serialization for stable HMAC inputs: object keys sorted
 * recursively, `undefined` values skipped (so re-signing a stored, JSON-round-
 * tripped entry reproduces the exact bytes that were originally signed).
 */
function canonicalize(value: unknown, depth = 0): string {
  if (depth > CANONICAL_MAX_DEPTH) throw new AuditCanonicalDepthError();
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v, depth + 1)).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k], depth + 1)}`).join(",")}}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Common schema
// ─────────────────────────────────────────────────────────────────────────────

export type AuditLeg = "wallet_transfer" | "offramp_conversion";

/**
 * Structural shape of a wallet-cdp `TransferReceipt`, declared here so
 * @ar-agents/treasury does not import @ar-agents/wallet-cdp (that would be a
 * package dependency cycle -- wallet-cdp composes INTO treasury at the host
 * app, never the reverse). wallet-cdp's `TransferReceipt` satisfies this
 * structurally; no adapter/cast is needed at the call site.
 */
export interface WalletTransferReceiptLike {
  to: string;
  /** USDC base units (6 decimals), as a string. */
  amountAtomic: string;
  transactionHash?: string;
  idempotencyKey: string;
}

export interface TreasuryAuditEntry {
  /** 0-based position in the chain. */
  seq: number;
  /** ISO-8601 timestamp, injected by the caller, never read from a clock. */
  ts: string;
  leg: AuditLeg;
  /** wallet: transactionHash ?? idempotencyKey. offramp: receipt.txId. */
  txId: string;
  /** wallet: Number(amountAtomic)/10**decimals. offramp: receipt.amountUsd. */
  amountUsd: number;
  /** offramp only. */
  arsReceived?: number;
  /** offramp only. */
  rate?: number;
  /** wallet: `to`. offramp: receipt.depositAddress. */
  counterparty?: string;
  /** wallet: receipt.idempotencyKey. offramp: opts.externalId ?? receipt.txId. */
  idempotencyKey: string;
  /** The original receipt, verbatim, for forensics. */
  receipt: WalletTransferReceiptLike | OffRampReceipt;
  /** Hex HMAC of the previous entry; GENESIS_PREV_HASH for the first entry. */
  prevHash: string;
  /** Hex HMAC-SHA256 over canonicalize(entry sans `hmac`). */
  hmac: string;
}

export const GENESIS_PREV_HASH = "genesis";
export const USDC_DECIMALS = 6;

/** Build + sign an entry, given everything but seq/prevHash/hmac. */
async function signEntry(
  prev: TreasuryAuditEntry | null,
  fields: Omit<TreasuryAuditEntry, "seq" | "prevHash" | "hmac">,
  secret: string,
): Promise<TreasuryAuditEntry> {
  const seq = prev ? prev.seq + 1 : 0;
  const prevHash = prev ? prev.hmac : GENESIS_PREV_HASH;
  const unsigned: Omit<TreasuryAuditEntry, "hmac"> = { ...fields, seq, prevHash };
  const hmac = await hmacHex(secret, canonicalize(unsigned));
  return { ...unsigned, hmac };
}

/**
 * Append the crypto leg. `prev` is the last entry in the chain (null for the
 * first entry ever appended).
 */
export async function appendWalletTransfer(
  prev: TreasuryAuditEntry | null,
  receipt: WalletTransferReceiptLike,
  opts: { secret: string; at: string; decimals?: number },
): Promise<TreasuryAuditEntry> {
  const decimals = opts.decimals ?? USDC_DECIMALS;
  return signEntry(
    prev,
    {
      ts: opts.at,
      leg: "wallet_transfer",
      txId: receipt.transactionHash ?? receipt.idempotencyKey,
      amountUsd: Number(receipt.amountAtomic) / 10 ** decimals,
      counterparty: receipt.to,
      idempotencyKey: receipt.idempotencyKey,
      receipt,
    },
    opts.secret,
  );
}

/**
 * Append the fiat leg. `externalId` is the off-ramp idempotency key (the same
 * one passed to `OffRampAdapter.convert()`).
 */
export async function appendOffRampConversion(
  prev: TreasuryAuditEntry | null,
  receipt: OffRampReceipt,
  opts: { secret: string; at: string; externalId?: string },
): Promise<TreasuryAuditEntry> {
  return signEntry(
    prev,
    {
      ts: opts.at,
      leg: "offramp_conversion",
      txId: receipt.txId,
      amountUsd: receipt.amountUsd,
      arsReceived: receipt.arsReceived,
      rate: receipt.rate,
      ...(receipt.depositAddress !== undefined ? { counterparty: receipt.depositAddress } : {}),
      idempotencyKey: opts.externalId ?? receipt.txId,
      receipt,
    },
    opts.secret,
  );
}

/**
 * Recompute every entry's hmac from its own fields and verify the prevHash
 * chain links. Returns the index of the first broken entry, or null if the
 * whole chain is intact.
 */
export async function verifyAuditChain(
  entries: TreasuryAuditEntry[],
  secret: string,
): Promise<{ valid: boolean; brokenAt: number | null }> {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.seq !== i) return { valid: false, brokenAt: i };
    const expectedPrevHash = i === 0 ? GENESIS_PREV_HASH : entries[i - 1]!.hmac;
    if (entry.prevHash !== expectedPrevHash) return { valid: false, brokenAt: i };
    const { hmac, ...rest } = entry;
    const recomputed = await hmacHex(secret, canonicalize(rest));
    if (recomputed !== hmac) return { valid: false, brokenAt: i };
  }
  return { valid: true, brokenAt: null };
}

/**
 * Convenience stateful wrapper over the two append functions + verify, so a
 * caller doesn't have to thread `prev` by hand. Mirrors
 * `InMemoryOffRampAdapter`'s style in index.ts: a plain in-memory class for
 * a single process/test, not a durable store.
 */
export class TreasuryAuditLog {
  private readonly chain: TreasuryAuditEntry[] = [];

  constructor(private readonly secret: string) {}

  private get last(): TreasuryAuditEntry | null {
    return this.chain.length > 0 ? this.chain[this.chain.length - 1]! : null;
  }

  async recordWalletTransfer(
    receipt: WalletTransferReceiptLike,
    at: string,
    decimals?: number,
  ): Promise<TreasuryAuditEntry> {
    const entry = await appendWalletTransfer(this.last, receipt, {
      secret: this.secret,
      at,
      ...(decimals !== undefined ? { decimals } : {}),
    });
    this.chain.push(entry);
    return entry;
  }

  async recordOffRampConversion(
    receipt: OffRampReceipt,
    at: string,
    externalId?: string,
  ): Promise<TreasuryAuditEntry> {
    const entry = await appendOffRampConversion(this.last, receipt, {
      secret: this.secret,
      at,
      ...(externalId !== undefined ? { externalId } : {}),
    });
    this.chain.push(entry);
    return entry;
  }

  /** A copy of the chain, in append order. Mutating the returned array does
   *  not affect the log. */
  entries(): readonly TreasuryAuditEntry[] {
    return [...this.chain];
  }

  async verify(): Promise<{ valid: boolean; brokenAt: number | null }> {
    return verifyAuditChain(this.chain, this.secret);
  }
}
