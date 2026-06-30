/**
 * Registry daily good-standing history (KV-backed, in-memory fallback, edge-safe,
 * best-effort). ONE point per UTC day per entity (idempotent same-day overwrite),
 * bounded to the most recent MAX_DAYS. A counterparty / the granular oracle reads
 * this to see a good-standing TREND (improving, degrading, flat) rather than a
 * single point-in-time verdict.
 *
 * Mirrors registry-store's isKvWired() + in-memory fallback. Never throws.
 */

import { kv } from "@vercel/kv";
import type { RegistryStatus, GoodStandingState, Rating } from "./registry-store";

export interface HistoryPoint {
  /** YYYY-MM-DD (UTC). */
  date: string;
  status: RegistryStatus;
  state: GoodStandingState;
  /** Dimensional composite 0..100, or null when unscoreable. */
  score: number | null;
  rating: Rating;
}

const MAX_DAYS = 120;
const KEY = (entityId: string) => `registry:history:${entityId}`;
const mem = new Map<string, HistoryPoint[]>();

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

async function read(entityId: string): Promise<HistoryPoint[]> {
  if (!isKvWired()) return mem.get(entityId)?.slice() ?? [];
  try {
    const list = await kv.get<HistoryPoint[]>(KEY(entityId));
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function write(entityId: string, list: HistoryPoint[]): Promise<void> {
  const bounded = list.slice(-MAX_DAYS);
  if (!isKvWired()) {
    mem.set(entityId, bounded);
    return;
  }
  try {
    await kv.set(KEY(entityId), bounded);
  } catch {
    // best-effort
  }
}

/** Record (or overwrite) TODAY's point for an entity. Best-effort, never throws. */
export async function recordHistoryPoint(
  entityId: string,
  point: Omit<HistoryPoint, "date"> & { date?: string },
): Promise<void> {
  if (!entityId) return;
  try {
    const date = point.date ?? new Date().toISOString().slice(0, 10);
    const list = await read(entityId);
    const next = list.filter((p) => p.date !== date); // idempotent per day
    next.push({
      date,
      status: point.status,
      state: point.state,
      score: point.score,
      rating: point.rating,
    });
    next.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    await write(entityId, next);
  } catch {
    // best-effort
  }
}

/** Read history (oldest→newest). `days` truncates to the most recent N points. */
export async function getHistory(entityId: string, days?: number): Promise<HistoryPoint[]> {
  const list = await read(entityId);
  const sorted = list.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  if (!days || days <= 0) return sorted;
  return sorted.slice(-days);
}

/** Test-only: clear the in-memory fallback store between cases. */
export function __resetHistoryForTests(): void {
  mem.clear();
}
