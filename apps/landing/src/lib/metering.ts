// Metering: the billable usage tally El Auditor was missing. Each signed write
// bumps a per-key monthly + daily counter in Vercel KV (the kvRateLimit INCR +
// EXPIRE pattern), so usage is inspectable + billable WITHOUT a database. This
// is the metering spine the capture plan's recurring SKUs read from.
//
// Best-effort by contract: a metering failure must NEVER fail the customer's
// paid write. recordUsage swallows KV errors and returns null; getUsage zeros.

import { kv } from "@vercel/kv";

const USAGE_PREFIX = "auditor:usage:";
// Retain a month counter ~13 months (covers a billing-dispute window); daily ~70d.
const MONTH_TTL_SEC = 400 * 24 * 60 * 60;
const DAY_TTL_SEC = 70 * 24 * 60 * 60;

function periods(d: Date): { month: string; day: string } {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return { month: `${y}${m}`, day: `${y}${m}${day}` };
}

const monthKey = (apiKey: string, month: string) => `${USAGE_PREFIX}${apiKey}:m:${month}`;
const dayKey = (apiKey: string, day: string) => `${USAGE_PREFIX}${apiKey}:d:${day}`;

/**
 * Record ONE billable unit for a key. Best-effort: never throws; returns the new
 * month-to-date total, or null if KV is unavailable.
 */
export async function recordUsage(apiKey: string): Promise<number | null> {
  try {
    const { month, day } = periods(new Date());
    const mk = monthKey(apiKey, month);
    const total = await kv.incr(mk);
    if (total === 1) await kv.expire(mk, MONTH_TTL_SEC);
    const dk = dayKey(apiKey, day);
    const dTotal = await kv.incr(dk);
    if (dTotal === 1) await kv.expire(dk, DAY_TTL_SEC);
    return total;
  } catch {
    return null;
  }
}

export interface Usage {
  /** YYYYMM (UTC). */
  month: string;
  monthToDate: number;
  today: number;
}

/** Read the current-period usage for a key. Best-effort; zeros on KV error. */
export async function getUsage(apiKey: string): Promise<Usage> {
  const { month, day } = periods(new Date());
  try {
    const m = await kv.get<number>(monthKey(apiKey, month));
    const d = await kv.get<number>(dayKey(apiKey, day));
    return { month, monthToDate: Number(m ?? 0), today: Number(d ?? 0) };
  } catch {
    return { month, monthToDate: 0, today: 0 };
  }
}
