/**
 * Per-account token usage + the monthly free cap.
 *
 * recordUsage is best-effort by contract: metering must never fail the
 * agent turn that earned it. checkCap is the opposite: it is the thing that
 * decides whether a paid model call is allowed to happen at all, so it FAILS
 * CLOSED (any KV error, or a lock that cannot be acquired, blocks the call)
 * rather than silently letting an unmetered request through.
 *
 * Storage: Vercel KV via `kv.incrby` on `studio:usage:{accountId}:m:{YYYYMM}:
 * {field}`, in-memory fallback for local dev / tests.
 */

import { kv } from "@vercel/kv";
import { withKvLock } from "./kv-lock";

const DEFAULT_CAP_MICRO_USD = 500_000; // 0.50 USD of model cost => 2.50 USD at the 5x price

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

function currentMonth(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}${m}`;
}

type Field = "inputTokens" | "outputTokens" | "costMicroUsd";
const FIELDS: readonly Field[] = ["inputTokens", "outputTokens", "costMicroUsd"];

const fieldKey = (accountId: string, month: string, field: Field) =>
  `studio:usage:${accountId}:m:${month}:${field}`;

interface UsageTotals {
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

// globalThis-backed so dev route modules share one store (see account.ts).
const gm = globalThis as typeof globalThis & { __studioUsageMem?: Map<string, UsageTotals> };
gm.__studioUsageMem ??= new Map();
const memUsage = gm.__studioUsageMem;
const memKey = (accountId: string, month: string) => `${accountId}:${month}`;

function zeroTotals(): UsageTotals {
  return { inputTokens: 0, outputTokens: 0, costMicroUsd: 0 };
}

export interface RecordUsageInput {
  inputTokens: number;
  outputTokens: number;
  model: string;
  costMicroUsd: number;
}

/**
 * Record one agent call's usage against an account's current month. Never
 * throws: a metering failure must not fail the (already-streamed) response
 * it is billing for.
 */
export async function recordUsage(accountId: string, u: RecordUsageInput): Promise<void> {
  const month = currentMonth();
  const inputTokens = Math.max(0, Math.round(u.inputTokens || 0));
  const outputTokens = Math.max(0, Math.round(u.outputTokens || 0));
  const costMicroUsd = Math.max(0, Math.round(u.costMicroUsd || 0));
  try {
    if (isKvWired()) {
      await Promise.all([
        inputTokens ? kv.incrby(fieldKey(accountId, month, "inputTokens"), inputTokens) : null,
        outputTokens ? kv.incrby(fieldKey(accountId, month, "outputTokens"), outputTokens) : null,
        costMicroUsd ? kv.incrby(fieldKey(accountId, month, "costMicroUsd"), costMicroUsd) : null,
      ]);
    } else {
      const k = memKey(accountId, month);
      const cur = memUsage.get(k) ?? zeroTotals();
      cur.inputTokens += inputTokens;
      cur.outputTokens += outputTokens;
      cur.costMicroUsd += costMicroUsd;
      memUsage.set(k, cur);
    }
  } catch {
    // best-effort: never throw
  }
}

export interface Usage {
  month: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
  /** The would-be bill: costMicroUsd * 5. Nothing is actually charged in v1. */
  priceMicroUsd: number;
}

/** Raw read of the current month's totals. Propagates a KV error (unlike
 *  {@link getUsage}) so {@link checkCap} can fail closed on it. */
async function readTotals(accountId: string, month: string): Promise<UsageTotals> {
  if (!isKvWired()) {
    return { ...(memUsage.get(memKey(accountId, month)) ?? zeroTotals()) };
  }
  const [inputTokens, outputTokens, costMicroUsd] = await Promise.all(
    FIELDS.map((f) => kv.get<number>(fieldKey(accountId, month, f))),
  );
  return {
    inputTokens: Number(inputTokens ?? 0),
    outputTokens: Number(outputTokens ?? 0),
    costMicroUsd: Number(costMicroUsd ?? 0),
  };
}

/** Best-effort read for display (GET /api/account): zeros on any KV error. */
export async function getUsage(accountId: string): Promise<Usage> {
  const month = currentMonth();
  try {
    const totals = await readTotals(accountId, month);
    return { month, ...totals, priceMicroUsd: totals.costMicroUsd * 5 };
  } catch {
    return { month, inputTokens: 0, outputTokens: 0, costMicroUsd: 0, priceMicroUsd: 0 };
  }
}

function capMicroUsd(): number {
  const raw = process.env.STUDIO_FREE_CAP_MICRO_USD?.trim();
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_CAP_MICRO_USD;
}

export interface CapCheck {
  allowed: boolean;
  monthlyCostMicroUsd: number;
  remainingMicroUsd: number;
}

/**
 * Whether the account may spend more model cost this month. FAILS CLOSED:
 * any error reading usage, or acquiring the serializing KV lock, is treated
 * as "not allowed" rather than silently letting an unmetered call through.
 */
export async function checkCap(accountId: string): Promise<CapCheck> {
  const cap = capMicroUsd();
  try {
    return await withKvLock(`studio:cap:${accountId}`, async () => {
      const totals = await readTotals(accountId, currentMonth());
      const remaining = cap - totals.costMicroUsd;
      return {
        allowed: remaining > 0,
        monthlyCostMicroUsd: cap,
        remainingMicroUsd: Math.max(0, remaining),
      };
    });
  } catch {
    return { allowed: false, monthlyCostMicroUsd: cap, remainingMicroUsd: 0 };
  }
}
