import { Redis } from "@upstash/redis";
import type {
  SubscriptionStateAdapter,
  SubscriptionStateRecord,
} from "@ar-agents/mercadopago";

/**
 * Upstash Redis-backed state adapter for `@ar-agents/mercadopago`. Reads
 * `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the env via
 * `Redis.fromEnv()`. Subscriptions are namespaced under `mp:sub:{id}`.
 */
export class UpstashSubscriptionState implements SubscriptionStateAdapter {
  private readonly redis: Redis;

  constructor(redis?: Redis) {
    this.redis = redis ?? Redis.fromEnv();
  }

  private key(id: string): string {
    return `mp:sub:${id}`;
  }

  async set(
    id: string,
    state: Partial<SubscriptionStateRecord>,
  ): Promise<void> {
    const existing = (await this.get(id)) ?? {};
    await this.redis.set(this.key(id), { ...existing, ...state });
  }

  async get(id: string): Promise<SubscriptionStateRecord | null> {
    return await this.redis.get<SubscriptionStateRecord>(this.key(id));
  }

  async list(): Promise<string[]> {
    const keys = await this.redis.keys("mp:sub:*");
    return keys.map((k) => k.replace("mp:sub:", ""));
  }
}
