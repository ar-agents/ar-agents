/**
 * Ualá adapter contract.
 *
 * The adapter pattern keeps `@ar-agents/uala` testable without network +
 * lets downstream callers swap in real, sandbox, or mock implementations
 * without changing the tool layer. Three concrete adapters:
 *
 *   UnconfiguredUalaAdapter   throws UalaUnconfiguredError on every call.
 *                             Default. Safe to instantiate `ualaTools()` in
 *                             unit tests that never touch the network.
 *   InMemoryUalaAdapter       in-memory state for integration tests; emits
 *                             plausible PaymentLinks / Transactions / etc.
 *   UalaApiAdapter            real-network adapter that hits Ualá Bis API
 *                             (developers.uala.com.ar). Configured with
 *                             apiKey + baseUrl.
 *
 * Adding a new adapter (Mercado Pago bridge, mocked, partial) only
 * requires implementing this interface — no changes to tools.ts.
 */
import type {
  PaymentLink,
  PaymentLinkStatus,
  CreatePaymentLinkArgs,
  Transaction,
  ListTransactionsArgs,
  ListTransactionsResult,
  Payout,
  CreatePayoutArgs,
  BalanceSnapshot,
  Currency,
  OAuthAuthorizeArgs,
  OAuthTokenSet,
  OAuthExchangeArgs,
  OAuthRefreshArgs,
} from "./types";
import {
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  HttpClient,
  isArAgentsError,
  type HttpMethod,
  type HttpRetryOptions,
  type QueryParams,
  type ResponseSchema,
} from "@ar-agents/core";
import { z } from "zod";
import {
  UalaApiError,
  UalaAuthError,
  UalaUnconfiguredError,
  UalaValidationError,
} from "./errors";

// Response schemas — the Ualá API returns FINANCIAL data (balances, payouts,
// payment links). Validated at the boundary so a malformed/partial body fails
// loud instead of being blind-cast into a Payout/PaymentLink with undefined
// id/amount/status. Unknown upstream fields are stripped (the contract only
// promises the named fields; see types.ts).
const currencySchema = z.enum(["ARS", "USD"]);

const paymentLinkSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: currencySchema,
  status: z.enum(["open", "paid", "expired", "cancelled"]),
  shareUrl: z.string(),
  createdAt: z.string(),
  description: z.string().optional(),
  externalReference: z.string().optional(),
  qrCodeUrl: z.string().optional(),
  expiresAt: z.string().optional(),
});

const transactionSchema = z.object({
  id: z.string(),
  kind: z.enum(["credit", "debit"]),
  amount: z.number(),
  currency: currencySchema,
  createdAt: z.string(),
  description: z.string().optional(),
  counterpart: z.string().optional(),
  externalReference: z.string().optional(),
  paymentLinkId: z.string().optional(),
});

const listTransactionsSchema = z.object({
  transactions: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
});

const payoutSchema = z.object({
  id: z.string(),
  amount: z.number(),
  currency: currencySchema,
  destinationCbu: z.string(),
  status: z.enum(["pending", "in_review", "approved", "paid", "rejected"]),
  createdAt: z.string(),
  reference: z.string().optional(),
  approvedAt: z.string().optional(),
  paidAt: z.string().optional(),
  rejectionReason: z.string().optional(),
});

const balanceSchema = z.object({
  currency: currencySchema,
  available: z.number(),
  pending: z.number(),
  asOf: z.string(),
});

const oauthTokenSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  expires_in: z.number(),
  scope: z.string().optional(),
  merchant_id: z.string().optional(),
});

const UALA_OAUTH_BASE = "https://api.uala.com.ar";

export interface UalaAdapter {
  createPaymentLink(args: CreatePaymentLinkArgs): Promise<PaymentLink>;
  getPaymentLink(id: string): Promise<PaymentLink>;
  cancelPaymentLink(id: string): Promise<PaymentLink>;
  listTransactions(args: ListTransactionsArgs): Promise<ListTransactionsResult>;
  getTransaction(id: string): Promise<Transaction>;
  getBalance(currency?: Currency): Promise<BalanceSnapshot>;
  createPayout(args: CreatePayoutArgs): Promise<Payout>;
  getPayout(id: string): Promise<Payout>;
}

/** Default. Throws on every call. Safe for unit tests. */
export class UnconfiguredUalaAdapter implements UalaAdapter {
  async createPaymentLink(): Promise<never> {
    throw new UalaUnconfiguredError("createPaymentLink");
  }
  async getPaymentLink(): Promise<never> {
    throw new UalaUnconfiguredError("getPaymentLink");
  }
  async cancelPaymentLink(): Promise<never> {
    throw new UalaUnconfiguredError("cancelPaymentLink");
  }
  async listTransactions(): Promise<never> {
    throw new UalaUnconfiguredError("listTransactions");
  }
  async getTransaction(): Promise<never> {
    throw new UalaUnconfiguredError("getTransaction");
  }
  async getBalance(): Promise<never> {
    throw new UalaUnconfiguredError("getBalance");
  }
  async createPayout(): Promise<never> {
    throw new UalaUnconfiguredError("createPayout");
  }
  async getPayout(): Promise<never> {
    throw new UalaUnconfiguredError("getPayout");
  }
}

// ── Real adapter ────────────────────────────────────────────────

export interface UalaApiAdapterOptions {
  /** Ualá Bis API key (Bearer token). */
  apiKey: string;
  /**
   * Base URL of the Ualá Bis API. Defaults to the production endpoint.
   * Override for sandbox / staging. NO trailing slash.
   */
  baseUrl?: string;
  /** Optional pluggable fetch (for testing with msw or custom timeouts). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 10_000. */
  timeoutMs?: number;
}

/**
 * Real-network adapter. The Ualá Bis API surface is still evolving;
 * endpoint paths used here match developer-portal documentation as of
 * v0.1. If Ualá changes a path, only this file needs updating — the
 * contract (UalaAdapter) and tools (tools.ts) stay stable.
 */
export class UalaApiAdapter implements UalaAdapter {
  private readonly client: HttpClient;

  constructor(opts: UalaApiAdapterOptions) {
    if (!opts.apiKey) {
      throw new UalaValidationError("apiKey", "required");
    }
    this.client = new HttpClient({
      baseUrl: (opts.baseUrl ?? "https://api.uala.com.ar/v1").replace(/\/$/, ""),
      auth: `Bearer ${opts.apiKey}`,
      timeoutMs: opts.timeoutMs ?? 10_000,
      // Modest retry: idempotent GETs (and 429s) retry with backoff;
      // non-idempotent POSTs opt in per-call ONLY when an idempotency key
      // makes a retry safe (see createPaymentLink / createPayout).
      retry: { maxAttempts: 2 },
      ...(opts.fetchImpl !== undefined ? { fetch: opts.fetchImpl } : {}),
    });
  }

  private async request<T>(
    path: string,
    opts: {
      method?: HttpMethod;
      body?: unknown;
      query?: QueryParams;
      schema: ResponseSchema<T>;
      idempotencyKey?: string;
      idempotent?: boolean;
    },
  ): Promise<T> {
    try {
      return await this.client.request<T>({
        path,
        method: opts.method ?? "GET",
        schema: opts.schema,
        ...(opts.body !== undefined ? { body: opts.body } : {}),
        ...(opts.query ? { query: opts.query } : {}),
        ...(opts.idempotencyKey
          ? { headers: { "idempotency-key": opts.idempotencyKey } }
          : {}),
        ...(opts.idempotent !== undefined ? { idempotent: opts.idempotent } : {}),
      });
    } catch (err) {
      throw toUalaError(err);
    }
  }

  async createPaymentLink(args: CreatePaymentLinkArgs): Promise<PaymentLink> {
    if (args.amount <= 0)
      throw new UalaValidationError("amount", "must be greater than zero");
    return this.request("/payment-links", {
      method: "POST",
      body: {
        amount: args.amount,
        currency: args.currency ?? "ARS",
        description: args.description,
        externalReference: args.externalReference,
        expiresInMinutes: args.expiresInMinutes,
      },
      schema: paymentLinkSchema,
      // A POST is safe to retry only when the caller supplies an idempotency key.
      ...(args.idempotencyKey
        ? { idempotencyKey: args.idempotencyKey, idempotent: true }
        : {}),
    }) as Promise<PaymentLink>;
  }

  async getPaymentLink(id: string): Promise<PaymentLink> {
    return this.request(`/payment-links/${encodeURIComponent(id)}`, {
      schema: paymentLinkSchema,
    }) as Promise<PaymentLink>;
  }

  async cancelPaymentLink(id: string): Promise<PaymentLink> {
    return this.request(`/payment-links/${encodeURIComponent(id)}/cancel`, {
      method: "POST",
      schema: paymentLinkSchema,
    }) as Promise<PaymentLink>;
  }

  async listTransactions(
    args: ListTransactionsArgs,
  ): Promise<ListTransactionsResult> {
    const query: QueryParams = {};
    if (args.fromIso) query["from"] = args.fromIso;
    if (args.toIso) query["to"] = args.toIso;
    if (args.kind) query["kind"] = args.kind;
    if (args.limit) query["limit"] = args.limit;
    if (args.cursor) query["cursor"] = args.cursor;
    return this.request("/transactions", {
      query,
      schema: listTransactionsSchema,
    }) as Promise<ListTransactionsResult>;
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.request(`/transactions/${encodeURIComponent(id)}`, {
      schema: transactionSchema,
    }) as Promise<Transaction>;
  }

  async getBalance(currency?: Currency): Promise<BalanceSnapshot> {
    return this.request("/balance", {
      schema: balanceSchema,
      ...(currency ? { query: { currency } } : {}),
    }) as Promise<BalanceSnapshot>;
  }

  async createPayout(args: CreatePayoutArgs): Promise<Payout> {
    if (args.amount <= 0)
      throw new UalaValidationError("amount", "must be greater than zero");
    if (!/^[0-9]{22}$/.test(args.destinationCbu)) {
      throw new UalaValidationError("destinationCbu", "must be a 22-digit CBU");
    }
    return this.request("/payouts", {
      method: "POST",
      body: {
        amount: args.amount,
        currency: args.currency ?? "ARS",
        destinationCbu: args.destinationCbu,
        reference: args.reference,
      },
      schema: payoutSchema,
      // Money movement: retry ONLY when an idempotency key makes it safe —
      // never blind-retry a payout on a transient error.
      ...(args.idempotencyKey
        ? { idempotencyKey: args.idempotencyKey, idempotent: true }
        : {}),
    }) as Promise<Payout>;
  }

  async getPayout(id: string): Promise<Payout> {
    return this.request(`/payouts/${encodeURIComponent(id)}`, {
      schema: payoutSchema,
    }) as Promise<Payout>;
  }
}

/** Map a core error into the Ualá taxonomy. A malformed-body validation error
 * is surfaced as-is (fail loud); auth → UalaAuthError; everything else →
 * UalaApiError carrying the upstream status + body. */
function toUalaError(err: unknown): unknown {
  if (err instanceof ArAgentsResponseValidationError) return err;
  if (err instanceof ArAgentsAuthError) return new UalaAuthError();
  if (err instanceof ArAgentsRateLimitError) {
    return new UalaApiError(429, err.context["body"] ?? null);
  }
  if (err instanceof ArAgentsProtocolError) {
    return new UalaApiError(err.status ?? 0, err.context["body"] ?? null);
  }
  if (isArAgentsError(err)) return new UalaApiError(0, null);
  return err;
}

// ── OAuth helpers (marketplace integrations) ────────────────────

/**
 * Build the authorize URL for a Ualá marketplace OAuth flow. Pure
 * function: no network, just URL construction.
 */
export function buildAuthorizeUrl(args: OAuthAuthorizeArgs): string {
  const u = new URL("https://api.uala.com.ar/oauth/authorize");
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", args.clientId);
  u.searchParams.set("redirect_uri", args.redirectUri);
  u.searchParams.set("scope", args.scope.join(" "));
  u.searchParams.set("state", args.state);
  return u.toString();
}

/**
 * Exchange an authorization code for an OAuth token set. Hits Ualá's
 * token endpoint directly with client credentials.
 */
export async function exchangeCodeForToken(
  args: OAuthExchangeArgs,
  fetchImpl?: typeof fetch,
): Promise<OAuthTokenSet> {
  const raw = await oauthTokenRequest(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
    }).toString(),
    "Ualá OAuth rejected client credentials.",
    fetchImpl,
  );
  if (!raw.refresh_token) {
    // A code exchange must return a refresh_token; a body without one is
    // malformed — fail loud rather than return a token set with none.
    throw new UalaApiError(200, { error: "missing_refresh_token" });
  }
  return buildTokenSet(raw, raw.refresh_token);
}

/** Shared, timed token-grant request. `retry: 1` — a token grant is
 * non-idempotent and one-shot. Maps auth/validation/transport errors. */
async function oauthTokenRequest(
  body: string,
  authRejectMessage: string,
  fetchImpl?: typeof fetch,
): Promise<z.infer<typeof oauthTokenSchema>> {
  const client = new HttpClient({
    baseUrl: UALA_OAUTH_BASE,
    timeoutMs: 10_000,
    retry: { maxAttempts: 1 },
    ...(fetchImpl !== undefined ? { fetch: fetchImpl } : {}),
  });
  try {
    return await client.request({
      method: "POST",
      path: "/oauth/token",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
      schema: oauthTokenSchema,
    });
  } catch (err) {
    if (err instanceof ArAgentsAuthError) throw new UalaAuthError(authRejectMessage);
    if (err instanceof ArAgentsResponseValidationError) throw err;
    if (err instanceof ArAgentsProtocolError) {
      throw new UalaApiError(err.status ?? 0, err.context["body"] ?? null);
    }
    if (isArAgentsError(err)) throw new UalaApiError(0, null);
    throw err;
  }
}

function buildTokenSet(
  raw: z.infer<typeof oauthTokenSchema>,
  refreshToken: string,
): OAuthTokenSet {
  const expiresAt = new Date(Date.now() + raw.expires_in * 1000).toISOString();
  const out: OAuthTokenSet = {
    accessToken: raw.access_token,
    refreshToken,
    expiresAt,
    scope: (raw.scope ?? "").split(" ").filter(Boolean),
  };
  if (raw.merchant_id) out.merchantId = raw.merchant_id;
  return out;
}

/**
 * Refresh an OAuth access token using the refresh_token grant. Long-lived
 * marketplace integrations need this — Ualá's access tokens expire after a
 * matter of hours, refresh tokens last weeks. Call this before issuing a
 * request when `expiresAt < now + safety_margin`, persist the new
 * `OAuthTokenSet`, and continue. If Ualá ever rotates the refresh token
 * the response carries the new one; always persist the entire returned
 * object, never just the access token.
 */
export async function refreshAccessToken(
  args: OAuthRefreshArgs,
  fetchImpl?: typeof fetch,
): Promise<OAuthTokenSet> {
  const raw = await oauthTokenRequest(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: args.refreshToken,
      client_id: args.clientId,
      client_secret: args.clientSecret,
    }).toString(),
    "Ualá OAuth refresh rejected — refresh token may be revoked, expired, or rotated. Re-authorize the user.",
    fetchImpl,
  );
  // Some OAuth servers omit refresh_token on refresh (the original stays
  // valid). Preserve the input refresh_token when not returned.
  return buildTokenSet(raw, raw.refresh_token ?? args.refreshToken);
}

// ── In-memory adapter (testing / dogfood) ───────────────────────

/**
 * Deterministic in-memory adapter. Use it for integration tests that
 * exercise the tool layer end-to-end without touching Ualá's network.
 * Every state mutation lives in-process; payment links, transactions,
 * payouts and balance are all synthetic but coherent with each other
 * (e.g. "paying" a link emits a credit Transaction; creating a payout
 * decrements the balance).
 *
 * NOT a load test surface — single-threaded, no persistence, no
 * concurrency guarantees. Intended for `vitest run` and demo apps.
 */
export interface InMemoryUalaAdapterOptions {
  /** Initial ARS balance (centavos). Default 0. */
  initialBalanceArs?: number;
  /** Initial USD balance (cents). Default 0. */
  initialBalanceUsd?: number;
  /**
   * Optional clock for deterministic timestamps in tests. Returns ISO
   * 8601. Default: `() => new Date().toISOString()`.
   */
  clock?: () => string;
  /**
   * Optional id generator for deterministic links / transactions /
   * payouts in tests. Default: `() => \`uala_\${counter++}\``.
   */
  idGenerator?: () => string;
}

export class InMemoryUalaAdapter implements UalaAdapter {
  private readonly clock: () => string;
  private readonly idGen: () => string;
  private counter = 0;
  private readonly links = new Map<string, PaymentLink>();
  private readonly transactions = new Map<string, Transaction>();
  private readonly payouts = new Map<string, Payout>();
  // Idempotency map: key + method → original response id.
  private readonly idemMap = new Map<string, string>();
  private readonly balance: Record<Currency, { available: number; pending: number }>;

  constructor(opts: InMemoryUalaAdapterOptions = {}) {
    this.clock = opts.clock ?? (() => new Date().toISOString());
    this.idGen =
      opts.idGenerator ?? (() => `uala_${String(++this.counter).padStart(6, "0")}`);
    this.balance = {
      ARS: { available: opts.initialBalanceArs ?? 0, pending: 0 },
      USD: { available: opts.initialBalanceUsd ?? 0, pending: 0 },
    };
  }

  /** Test helper — simulate a payer completing a payment link. */
  simulatePayment(linkId: string): Transaction {
    const link = this.links.get(linkId);
    if (!link) throw new UalaValidationError("linkId", `unknown: ${linkId}`);
    if (link.status !== "open") {
      throw new UalaValidationError("linkId", `not open (status=${link.status})`);
    }
    link.status = "paid";
    this.balance[link.currency].available += link.amount;
    const tx: Transaction = {
      id: this.idGen(),
      kind: "credit",
      amount: link.amount,
      currency: link.currency,
      createdAt: this.clock(),
      paymentLinkId: link.id,
      ...(link.description !== undefined ? { description: link.description } : {}),
      ...(link.externalReference !== undefined
        ? { externalReference: link.externalReference }
        : {}),
    };
    this.transactions.set(tx.id, tx);
    return tx;
  }

  async createPaymentLink(args: CreatePaymentLinkArgs): Promise<PaymentLink> {
    if (args.amount <= 0) {
      throw new UalaValidationError("amount", "must be greater than zero");
    }
    if (args.idempotencyKey) {
      const key = `link:${args.idempotencyKey}`;
      const prev = this.idemMap.get(key);
      if (prev) {
        const link = this.links.get(prev);
        if (link) return link;
      }
    }
    const id = this.idGen();
    const currency: Currency = args.currency ?? "ARS";
    const createdAt = this.clock();
    const link: PaymentLink = {
      id,
      amount: args.amount,
      currency,
      status: "open" as PaymentLinkStatus,
      shareUrl: `https://pay.uala.test/links/${id}`,
      qrCodeUrl: `https://pay.uala.test/links/${id}/qr.png`,
      createdAt,
      ...(args.description !== undefined ? { description: args.description } : {}),
      ...(args.externalReference !== undefined
        ? { externalReference: args.externalReference }
        : {}),
      ...(args.expiresInMinutes !== undefined
        ? {
            expiresAt: new Date(
              Date.parse(createdAt) + args.expiresInMinutes * 60_000,
            ).toISOString(),
          }
        : {}),
    };
    this.links.set(id, link);
    if (args.idempotencyKey) {
      this.idemMap.set(`link:${args.idempotencyKey}`, id);
    }
    return link;
  }

  async getPaymentLink(id: string): Promise<PaymentLink> {
    const link = this.links.get(id);
    if (!link) {
      throw new UalaApiError(404, { error: "not_found", id });
    }
    return link;
  }

  async cancelPaymentLink(id: string): Promise<PaymentLink> {
    const link = this.links.get(id);
    if (!link) throw new UalaApiError(404, { error: "not_found", id });
    if (link.status === "paid") {
      throw new UalaValidationError("id", "cannot cancel a paid link");
    }
    link.status = "cancelled";
    return link;
  }

  async listTransactions(
    args: ListTransactionsArgs,
  ): Promise<ListTransactionsResult> {
    let txs = Array.from(this.transactions.values());
    if (args.fromIso) txs = txs.filter((t) => t.createdAt >= args.fromIso!);
    if (args.toIso) txs = txs.filter((t) => t.createdAt <= args.toIso!);
    if (args.kind) txs = txs.filter((t) => t.kind === args.kind);
    txs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const limit = args.limit ?? 25;
    const startIdx = args.cursor
      ? txs.findIndex((t) => t.id === args.cursor) + 1
      : 0;
    const page = txs.slice(startIdx, startIdx + limit);
    const nextCursor =
      startIdx + limit < txs.length ? page[page.length - 1]!.id : null;
    return { transactions: page, nextCursor };
  }

  async getTransaction(id: string): Promise<Transaction> {
    const tx = this.transactions.get(id);
    if (!tx) throw new UalaApiError(404, { error: "not_found", id });
    return tx;
  }

  async getBalance(currency?: Currency): Promise<BalanceSnapshot> {
    const cur = currency ?? "ARS";
    const snap = this.balance[cur];
    return {
      currency: cur,
      available: snap.available,
      pending: snap.pending,
      asOf: this.clock(),
    };
  }

  async createPayout(args: CreatePayoutArgs): Promise<Payout> {
    if (args.amount <= 0) {
      throw new UalaValidationError("amount", "must be greater than zero");
    }
    if (!/^[0-9]{22}$/.test(args.destinationCbu)) {
      throw new UalaValidationError("destinationCbu", "must be a 22-digit CBU");
    }
    if (args.idempotencyKey) {
      const key = `payout:${args.idempotencyKey}`;
      const prev = this.idemMap.get(key);
      if (prev) {
        const p = this.payouts.get(prev);
        if (p) return p;
      }
    }
    const cur: Currency = args.currency ?? "ARS";
    if (this.balance[cur].available < args.amount) {
      throw new UalaApiError(422, {
        error: "insufficient_balance",
        available: this.balance[cur].available,
        requested: args.amount,
      });
    }
    this.balance[cur].available -= args.amount;
    this.balance[cur].pending += args.amount;
    const id = this.idGen();
    const payout: Payout = {
      id,
      amount: args.amount,
      currency: cur,
      destinationCbu: args.destinationCbu,
      status: "pending",
      createdAt: this.clock(),
      ...(args.reference !== undefined ? { reference: args.reference } : {}),
    };
    this.payouts.set(id, payout);
    if (args.idempotencyKey) {
      this.idemMap.set(`payout:${args.idempotencyKey}`, id);
    }
    return payout;
  }

  async getPayout(id: string): Promise<Payout> {
    const p = this.payouts.get(id);
    if (!p) throw new UalaApiError(404, { error: "not_found", id });
    return p;
  }
}
