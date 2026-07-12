/**
 * KV-backed `LastBalanceStore` (`@ar-agents/wallet-cdp`) for `wallet_check_balance`'s
 * v0 top-up detection (ROADMAP.md M2-4d).
 *
 * `@ar-agents/wallet-cdp`'s own `InMemoryLastBalanceStore` resets on every
 * request in a serverless host -- `buildTools()` runs per `/api/agent`
 * invocation (see `./agent.ts`), so an in-memory store would never see a
 * "previous" reading survive to the NEXT check, making the whole delta
 * comparison a no-op. This module closes that gap the same way
 * `./audit-log.ts` already does for the signed audit log: Vercel KV (Upstash
 * REST, Edge-safe) when provisioned (`KV_REST_API_URL`/`KV_REST_API_TOKEN`),
 * else an in-memory fallback on `globalThis` (resets on cold start -- fine
 * for local dev and PR previews without secrets, same caveat as every other
 * optional-storage module in this app).
 */

import { kv } from "@vercel/kv";
import type { LastBalanceStore } from "@ar-agents/wallet-cdp";

function isKvWired(): boolean {
  return Boolean(process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim());
}

function kvKey(key: string): string {
  return `sociedad-ia-starter:wallet-balance:${key}`;
}

// Same globalThis pattern as ./audit-log.ts's `mem`: in dev, a route module
// can get its own module instance, and per-module state would make a
// balance check in one request invisible to the next.
const g = globalThis as typeof globalThis & { __starterWalletBalanceMem?: Map<string, string> };
g.__starterWalletBalanceMem ??= new Map();
const mem = g.__starterWalletBalanceMem;

export class KvLastBalanceStore implements LastBalanceStore {
  async get(key: string): Promise<string | null> {
    try {
      if (isKvWired()) {
        const v = await kv.get<string>(kvKey(key));
        return typeof v === "string" ? v : null;
      }
    } catch {
      // fall through to the in-memory fallback below
    }
    return mem.get(key) ?? null;
  }

  async set(key: string, atomic: string): Promise<void> {
    try {
      if (isKvWired()) {
        await kv.set(kvKey(key), atomic);
        return;
      }
    } catch {
      // fall through to the in-memory fallback below
    }
    mem.set(key, atomic);
  }
}

/** Test-only: reset in-memory state between tests. */
export function __resetWalletBalanceStoreForTests(): void {
  mem.clear();
}
