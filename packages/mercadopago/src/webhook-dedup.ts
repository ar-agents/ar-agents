/**
 * Webhook idempotency / dedup — short-circuits duplicate webhook deliveries
 * from MP to prevent double-processing.
 *
 * # The problem
 *
 * MP retries webhook deliveries on 5xx responses. The retry policy is
 * exponential backoff: 5min, 15min, 30min, 1h, 6h, 24h, 48h, 96h, 192h
 * (~12 attempts over 8 days). If your handler temporarily 5xx'd (DB
 * down, deploy in progress, etc.) and then recovered, you'll receive
 * the SAME webhook 5+ times. Without dedup:
 *
 * - You double-charge (if the webhook triggers a charge)
 * - You double-send notifications (5 emails to the buyer instead of 1)
 * - You double-create downstream resources
 *
 * # The fix
 *
 * Cache the unique "delivery key" of every webhook you've successfully
 * processed. On retry, recognize the key, return 200 immediately, skip
 * processing.
 *
 * # The "delivery key"
 *
 * MP doesn't ship a single canonical id per delivery, but the tuple
 * `${topic}:${dataId}:${requestId}` is stable for retries (same delivery
 * attempt → same x-request-id) and unique enough to dedupe.
 *
 * # Storage
 *
 * Reuse `IdempotencyCache` from `state.ts`. Default TTL: 7 days (matches
 * MP's webhook retry window). Override per-deployment.
 */

import type { IdempotencyCache } from "./state";

export interface WebhookDedupOptions {
  /**
   * Storage for processed webhook ids. Plug in `VercelKVIdempotencyCache`
   * for production or `InMemoryIdempotencyCache` for tests.
   */
  cache: IdempotencyCache;
  /**
   * Time-to-live for dedup entries (seconds). Default 7 days — covers MP's
   * full retry window (~8 days) with a safety margin.
   */
  ttlSeconds?: number;
  /**
   * Optional callback fired when a duplicate is detected. Useful for
   * metrics ("webhooks deduped" counter).
   */
  onDuplicate?: (deliveryKey: string) => void;
}

export interface DedupResult {
  /**
   * `true` if this is the first time we've seen this delivery — caller
   * should process it.
   * `false` if it's a retry of a previously-seen delivery — caller should
   * acknowledge with 200 and skip processing.
   */
  shouldProcess: boolean;
  /** The deduplication key derived from the webhook. */
  deliveryKey: string;
}

/**
 * Dedup helper. Use this BEFORE processing a webhook to short-circuit retries.
 *
 * @example
 * ```ts
 * import { WebhookDedup, VercelKVIdempotencyCache } from "@ar-agents/mercadopago";
 *
 * const dedup = new WebhookDedup({
 *   cache: new VercelKVIdempotencyCache(),
 *   onDuplicate: (key) => metrics.increment("mp.webhook.duplicate"),
 * });
 *
 * export async function POST(req: Request) {
 *   const event = parseWebhookEvent(...);
 *   if (!event) return new Response("bad request", { status: 400 });
 *
 *   const requestId = req.headers.get("x-request-id");
 *   const { shouldProcess } = await dedup.check({
 *     topic: event.topic,
 *     dataId: event.dataId,
 *     requestId,
 *   });
 *   if (!shouldProcess) return new Response("ok (duplicate)", { status: 200 });
 *
 *   // ... process the webhook ...
 *
 *   return new Response("ok", { status: 200 });
 * }
 * ```
 */
export class WebhookDedup {
  private readonly cache: IdempotencyCache;
  private readonly ttlSeconds: number;
  private readonly onDuplicate: WebhookDedupOptions["onDuplicate"];

  constructor(opts: WebhookDedupOptions) {
    this.cache = opts.cache;
    this.ttlSeconds = opts.ttlSeconds ?? 7 * 24 * 3600; // 7 days
    this.onDuplicate = opts.onDuplicate;
  }

  /**
   * Check whether a webhook delivery has been seen before. If new, mark it
   * as seen (so subsequent retries return shouldProcess=false). If seen,
   * return shouldProcess=false WITHOUT marking again.
   *
   * **Important**: this method is not atomic across concurrent calls — two
   * simultaneous deliveries with the same key may both pass shouldProcess=true.
   * For strict at-most-once processing, follow with a transaction or use a
   * cache that supports `setNX`-style semantics (Redis, Cloudflare KV with
   * conditional writes).
   *
   * For most webhook handlers this race is acceptable: even if two get
   * through, the downstream business logic (e.g., "charge if not already
   * charged") will be idempotent on its own.
   */
  async check(args: {
    topic: string;
    dataId: string;
    requestId: string | null;
  }): Promise<DedupResult> {
    const deliveryKey = this.deriveKey(args);
    const seen = await this.cache.get<boolean>(deliveryKey);
    if (seen) {
      this.onDuplicate?.(deliveryKey);
      return { shouldProcess: false, deliveryKey };
    }
    await this.cache.set(deliveryKey, true, this.ttlSeconds);
    return { shouldProcess: true, deliveryKey };
  }

  /**
   * Manually mark a delivery as processed. Call this AFTER your business
   * logic succeeds — useful when you want to control when the dedup
   * marker is written (e.g., only on success).
   *
   * Combined with calling `check()` BEFORE the work, this gives "at-least-once"
   * semantics: failed processing → no marker → retry will be processed again.
   */
  async markProcessed(args: {
    topic: string;
    dataId: string;
    requestId: string | null;
  }): Promise<void> {
    const deliveryKey = this.deriveKey(args);
    await this.cache.set(deliveryKey, true, this.ttlSeconds);
  }

  /**
   * Variant of `check` that doesn't mark on first sight — caller must
   * explicitly `markProcessed` when their business logic succeeds.
   * Use this for at-least-once semantics (each delivery processed at
   * least once, possibly more if processing fails before mark).
   */
  async peekIsDuplicate(args: {
    topic: string;
    dataId: string;
    requestId: string | null;
  }): Promise<DedupResult> {
    const deliveryKey = this.deriveKey(args);
    const seen = await this.cache.get<boolean>(deliveryKey);
    if (seen) this.onDuplicate?.(deliveryKey);
    return { shouldProcess: !seen, deliveryKey };
  }

  private deriveKey(args: {
    topic: string;
    dataId: string;
    requestId: string | null;
  }): string {
    return `mp:webhook:${args.topic}:${args.dataId}:${args.requestId ?? "noreqid"}`;
  }
}
