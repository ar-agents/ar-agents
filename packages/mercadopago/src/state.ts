/**
 * In-memory record of a subscription. The lib persists the MP-side fields
 * needed to reason about a subscription without hitting the API every time
 * (status, last webhook info, customer email, etc.) plus a free-form metadata
 * bag for callers to attach business context (tenant id, plan name, etc.).
 */
export interface SubscriptionStateRecord {
  status?: string;
  payerEmail?: string;
  amount?: number;
  currency?: string;
  frequency?: number;
  frequencyType?: string;
  initPoint?: string;
  externalReference?: string;
  createdAt?: string;
  cancelledAt?: string;
  lastWebhookStatus?: string;
  lastWebhookAt?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Persistence surface for subscription state. Implementations may back this
 * with Upstash Redis, Vercel KV, Postgres, in-memory, or anything that
 * supports the three operations. The default `InMemoryStateAdapter` is
 * provided for tests and trivial single-process deployments; production
 * setups should plug in a durable store.
 */
export interface SubscriptionStateAdapter {
  set(id: string, state: Partial<SubscriptionStateRecord>): Promise<void>;
  get(id: string): Promise<SubscriptionStateRecord | null>;
  list?(): Promise<string[]>;
}

/**
 * Volatile, single-process state adapter. Useful for tests and demos. Do not
 * use in production: state is lost on restart and is not safe across tenants.
 */
export class InMemoryStateAdapter implements SubscriptionStateAdapter {
  private readonly store = new Map<string, SubscriptionStateRecord>();

  async set(
    id: string,
    state: Partial<SubscriptionStateRecord>,
  ): Promise<void> {
    const existing = this.store.get(id) ?? {};
    this.store.set(id, { ...existing, ...state });
  }

  async get(id: string): Promise<SubscriptionStateRecord | null> {
    return this.store.get(id) ?? null;
  }

  async list(): Promise<string[]> {
    return Array.from(this.store.keys());
  }

  /** Test helper: drop everything. Not part of the adapter interface. */
  reset(): void {
    this.store.clear();
  }
}
