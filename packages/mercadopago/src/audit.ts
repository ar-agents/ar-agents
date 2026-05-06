/**
 * Audit logging — financial-grade compliance trail for every state-mutating
 * operation. Captures who/what/when/idempotency_key/before/after/result.
 *
 * # Why this is a tier-1 feature
 *
 * Every mature payment integration has an audit log. The compliance officer
 * asks "show me every refund issued in March 2026 by user X" and you need
 * to answer in <60 seconds. Without an audit log, you're trawling through
 * application logs hoping nothing was filtered out.
 *
 * # What gets logged
 *
 * Every **state-mutating** tool call automatically:
 * - `create_payment`, `charge_saved_card`, `cancel_payment`, `capture_payment`
 * - `refund_payment`
 * - `create_subscription`, `cancel/pause/resume_subscription`, `update_subscription`
 * - `create_order`, `capture_order`, `cancel_order`
 * - `create_payment_preference`, `update_payment_preference`
 * - `create_customer`, `update_customer`, `create_customer_card`, `delete_customer_card`
 * - `create_subscription_plan`, `update_subscription_plan`
 * - `create_store/pos`, `update_store/pos`, `delete_store/pos`
 * - `create_qr_payment`, `cancel_qr_payment`
 * - `create_point_payment_intent`, `cancel_point_payment_intent`, `update_point_device_mode`
 * - OAuth: `oauth_exchange_code`, `oauth_refresh_token`
 * - `register_bank_account`
 * - `create_webhook`, `update_webhook`, `delete_webhook`
 *
 * **Read-only** tools do NOT emit audit entries (would flood the log without
 * value): get_*, search_*, list_*, calculate_*, validate_*, lookup_*, analyze_*.
 *
 * # PII handling
 *
 * The audit log captures `inputSummary` (a deterministic hash of the input
 * fields, NOT the raw input) by default. Configure `redact: false` to log
 * raw inputs (payer email, CUIT, etc.) — only when your data-residency
 * policy permits.
 *
 * # Storage
 *
 * Pluggable adapter pattern. Ships:
 * - `InMemoryAuditLog` — for tests + single-process demos.
 * - `VercelKVAuditLog` (in `/vercel-kv` subpath) — production-ready, KV-backed
 *   with daily-bucket indexing for efficient time-range queries.
 *
 * Implement your own for Postgres / S3 / SIEM integration.
 */

import type { sha256Hex as Sha256 } from "./crypto";

export type AuditOperation =
  // Payments
  | "create_payment" | "charge_saved_card" | "cancel_payment" | "capture_payment"
  // Refunds
  | "refund_payment"
  // Subscriptions
  | "create_subscription" | "cancel_subscription" | "pause_subscription"
  | "resume_subscription" | "update_subscription" | "subscribe_to_plan"
  // Plans
  | "create_subscription_plan" | "update_subscription_plan"
  // Orders
  | "create_order" | "capture_order" | "cancel_order" | "update_order"
  // Preferences
  | "create_payment_preference" | "update_payment_preference"
  // Customers + Cards
  | "create_customer" | "update_customer"
  | "create_customer_card" | "delete_customer_card"
  // Stores + POS
  | "create_store" | "update_store" | "delete_store"
  | "create_pos" | "update_pos" | "delete_pos"
  // QR
  | "create_qr_payment" | "cancel_qr_payment"
  // Point devices
  | "create_point_payment_intent" | "cancel_point_payment_intent"
  | "update_point_device_mode"
  // OAuth
  | "oauth_exchange_code" | "oauth_refresh_token"
  // Bank
  | "register_bank_account"
  // Webhooks
  | "create_webhook" | "update_webhook" | "delete_webhook"
  // Catch-all for custom callers
  | (string & {});

export interface AuditEntry {
  /**
   * Unique entry id. Format: `mpaud-{ISO date}-{random}`. Use as primary
   * key in your storage layer.
   */
  id: string;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** The MP operation performed. */
  operation: AuditOperation;
  /**
   * Logical actor that initiated the call. Caller-provided. Examples:
   * `"agent:billing-bot"`, `"user:42"`, `"cron:daily-charge"`.
   *
   * Defaults to `"unknown"` when not provided. **Always pass this in
   * production** — without it, your compliance trail is meaningless.
   */
  actor: string;
  /** Optional tenant/seller id for multi-tenant marketplace setups. */
  tenantId?: string;
  /**
   * SHA-256 hex of the meaningful input fields (deterministic). Useful as
   * a join key with the IdempotencyCache. Does NOT contain raw PII.
   */
  inputHash: string;
  /**
   * Optional raw input — only populated when `redact: false` was configured.
   * Defaults to undefined to comply with data-minimization principles.
   */
  inputRaw?: Record<string, unknown>;
  /** Outcome: success or error code. */
  outcome: "ok" | "error";
  /** Error code when `outcome === "error"`. */
  errorCode?: string;
  /** Error message when `outcome === "error"`. */
  errorMessage?: string;
  /**
   * MP resource id created/updated by the operation (e.g., payment id).
   * Allows joining audit entries to the actual MP resource.
   */
  resourceId?: string;
  /** Idempotency key passed to MP (for join with MP-side dedup logs). */
  idempotencyKey?: string;
  /** Duration in ms. */
  durationMs?: number;
  /** Free-form metadata bag. */
  metadata?: Record<string, unknown>;
}

export interface AuditLogAdapter {
  append(entry: AuditEntry): Promise<void>;
  /** Query a time range. Optional — implementations that don't support it can omit. */
  query?(filter: {
    actor?: string;
    operation?: AuditOperation;
    tenantId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditEntry[]>;
}

/**
 * Volatile, single-process audit log. Tests + dev only. Production deployments
 * must use a durable adapter (`VercelKVAuditLog`, your Postgres/S3 impl, etc.)
 */
export class InMemoryAuditLog implements AuditLogAdapter {
  private readonly entries: AuditEntry[] = [];

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async query(filter: {
    actor?: string;
    operation?: AuditOperation;
    tenantId?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<AuditEntry[]> {
    const filtered = this.entries.filter((e) => {
      if (filter.actor && e.actor !== filter.actor) return false;
      if (filter.operation && e.operation !== filter.operation) return false;
      if (filter.tenantId && e.tenantId !== filter.tenantId) return false;
      if (filter.from && e.timestamp < filter.from) return false;
      if (filter.to && e.timestamp > filter.to) return false;
      return true;
    });
    return filter.limit ? filtered.slice(0, filter.limit) : filtered;
  }

  /** All entries (test helper, not part of the adapter interface). */
  all(): AuditEntry[] {
    return [...this.entries];
  }

  reset(): void {
    this.entries.length = 0;
  }
}

/**
 * Audit logger — the user-facing facade that builds + ships entries.
 *
 * @example
 * ```ts
 * const audit = new AuditLogger({
 *   adapter: new InMemoryAuditLog(),
 *   defaultActor: "agent:billing-bot",
 *   redact: true, // default — hashes input, no raw PII
 * });
 *
 * const tools = mercadoPagoTools(client, {
 *   state, backUrl, audit,
 * });
 * ```
 */
export class AuditLogger {
  private readonly adapter: AuditLogAdapter;
  private readonly defaultActor: string;
  private readonly redact: boolean;
  private readonly hash: typeof Sha256;

  constructor(options: {
    adapter: AuditLogAdapter;
    defaultActor?: string;
    redact?: boolean;
    /** Override hash (testing). */
    hashFn?: typeof Sha256;
  }) {
    this.adapter = options.adapter;
    this.defaultActor = options.defaultActor ?? "unknown";
    this.redact = options.redact ?? true;
    // Lazy import to avoid circular: the caller must wire crypto themselves
    // by passing hashFn; default to dynamic import.
    this.hash = options.hashFn ?? defaultHasher;
  }

  /**
   * Wrap a tool execute() function with auto-audit. The returned function:
   * 1. Computes inputHash before the call.
   * 2. Invokes the original execute().
   * 3. On success, appends an entry with outcome="ok" + resourceId.
   * 4. On failure, appends an entry with outcome="error" + errorCode/Message.
   * 5. Re-throws the error transparently.
   */
  async record<I, O>(args: {
    operation: AuditOperation;
    input: I;
    actor?: string;
    tenantId?: string;
    idempotencyKey?: string;
    /**
     * Function that extracts the resourceId from the result. Default: tries
     * `result.id`, `result.payment_id`, `result.subscription_id`, `result.order_id`.
     */
    extractResourceId?: (result: O) => string | undefined;
    /** The actual operation to execute. */
    fn: () => Promise<O>;
  }): Promise<O> {
    const t0 = Date.now();
    const inputHash = await this.hash(stableStringify(args.input as object));

    try {
      const result = await args.fn();
      const resourceId = (args.extractResourceId ?? defaultExtractResourceId)(result);
      const entry: AuditEntry = {
        id: `mpaud-${new Date().toISOString()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
        operation: args.operation,
        actor: args.actor ?? this.defaultActor,
        inputHash,
        outcome: "ok",
        durationMs: Date.now() - t0,
      };
      if (args.tenantId !== undefined) entry.tenantId = args.tenantId;
      if (resourceId !== undefined) entry.resourceId = resourceId;
      if (args.idempotencyKey !== undefined) entry.idempotencyKey = args.idempotencyKey;
      if (!this.redact) entry.inputRaw = args.input as Record<string, unknown>;
      await this.adapter.append(entry);
      return result;
    } catch (err) {
      const entry: AuditEntry = {
        id: `mpaud-${new Date().toISOString()}-${Math.random().toString(36).slice(2, 10)}`,
        timestamp: new Date().toISOString(),
        operation: args.operation,
        actor: args.actor ?? this.defaultActor,
        inputHash,
        outcome: "error",
        errorCode: extractErrorCode(err),
        errorMessage: err instanceof Error ? err.message : String(err),
        durationMs: Date.now() - t0,
      };
      if (args.tenantId !== undefined) entry.tenantId = args.tenantId;
      if (args.idempotencyKey !== undefined) entry.idempotencyKey = args.idempotencyKey;
      if (!this.redact) entry.inputRaw = args.input as Record<string, unknown>;
      await this.adapter.append(entry);
      throw err;
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────────────

async function defaultHasher(input: string): Promise<string> {
  // Lazy import to avoid circular deps at module load
  const { sha256Hex } = await import("./crypto");
  return sha256Hex(input);
}

/** Stable JSON stringify (sorted keys) so equivalent inputs hash the same. */
function stableStringify(obj: object): string {
  return JSON.stringify(obj, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v).sort()) {
        sorted[k] = (v as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return v;
  });
}

function defaultExtractResourceId(result: unknown): string | undefined {
  if (!result || typeof result !== "object") return undefined;
  const r = result as Record<string, unknown>;
  for (const key of [
    "id",
    "payment_id",
    "subscription_id",
    "order_id",
    "preference_id",
    "customer_id",
    "refund_id",
    "store_id",
    "pos_id",
    "merchant_order_id",
    "intent_id",
    "device_id",
  ]) {
    const v = r[key];
    if (typeof v === "string" || typeof v === "number") return String(v);
  }
  return undefined;
}

function extractErrorCode(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as { code?: string; name?: string };
    return e.code ?? e.name ?? "unknown_error";
  }
  return "unknown_error";
}
