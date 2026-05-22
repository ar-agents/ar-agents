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
} from "./types";
import {
  UalaApiError,
  UalaAuthError,
  UalaUnconfiguredError,
  UalaValidationError,
} from "./errors";

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
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: UalaApiAdapterOptions) {
    if (!opts.apiKey) {
      throw new UalaValidationError("apiKey", "required");
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.uala.com.ar/v1").replace(
      /\/$/,
      "",
    );
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  private async request<T>(
    path: string,
    init: RequestInit & { idempotencyKey?: string },
  ): Promise<T> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = {
        authorization: `Bearer ${this.apiKey}`,
        accept: "application/json",
        ...(init.body
          ? { "content-type": "application/json" }
          : {}),
        ...((init.headers as Record<string, string> | undefined) ?? {}),
      };
      if (init.idempotencyKey) {
        headers["idempotency-key"] = init.idempotencyKey;
      }
      const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers,
        signal: ctrl.signal,
      });
      if (res.status === 401 || res.status === 403) {
        throw new UalaAuthError(
          `Ualá rejected the API key (HTTP ${res.status}).`,
        );
      }
      const text = await res.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // leave body as text
      }
      if (!res.ok) throw new UalaApiError(res.status, body);
      return body as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async createPaymentLink(args: CreatePaymentLinkArgs): Promise<PaymentLink> {
    if (args.amount <= 0)
      throw new UalaValidationError("amount", "must be greater than zero");
    return this.request<PaymentLink>("/payment-links", {
      method: "POST",
      body: JSON.stringify({
        amount: args.amount,
        currency: args.currency ?? "ARS",
        description: args.description,
        externalReference: args.externalReference,
        expiresInMinutes: args.expiresInMinutes,
      }),
      ...(args.idempotencyKey
        ? { idempotencyKey: args.idempotencyKey }
        : {}),
    });
  }

  async getPaymentLink(id: string): Promise<PaymentLink> {
    return this.request<PaymentLink>(
      `/payment-links/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
  }

  async cancelPaymentLink(id: string): Promise<PaymentLink> {
    return this.request<PaymentLink>(
      `/payment-links/${encodeURIComponent(id)}/cancel`,
      { method: "POST" },
    );
  }

  async listTransactions(
    args: ListTransactionsArgs,
  ): Promise<ListTransactionsResult> {
    const q = new URLSearchParams();
    if (args.fromIso) q.set("from", args.fromIso);
    if (args.toIso) q.set("to", args.toIso);
    if (args.kind) q.set("kind", args.kind);
    if (args.limit) q.set("limit", String(args.limit));
    if (args.cursor) q.set("cursor", args.cursor);
    const qs = q.toString();
    return this.request<ListTransactionsResult>(
      `/transactions${qs ? `?${qs}` : ""}`,
      { method: "GET" },
    );
  }

  async getTransaction(id: string): Promise<Transaction> {
    return this.request<Transaction>(
      `/transactions/${encodeURIComponent(id)}`,
      { method: "GET" },
    );
  }

  async getBalance(currency?: Currency): Promise<BalanceSnapshot> {
    const q = currency ? `?currency=${currency}` : "";
    return this.request<BalanceSnapshot>(`/balance${q}`, { method: "GET" });
  }

  async createPayout(args: CreatePayoutArgs): Promise<Payout> {
    if (args.amount <= 0)
      throw new UalaValidationError("amount", "must be greater than zero");
    if (!/^[0-9]{22}$/.test(args.destinationCbu)) {
      throw new UalaValidationError(
        "destinationCbu",
        "must be a 22-digit CBU",
      );
    }
    return this.request<Payout>("/payouts", {
      method: "POST",
      body: JSON.stringify({
        amount: args.amount,
        currency: args.currency ?? "ARS",
        destinationCbu: args.destinationCbu,
        reference: args.reference,
      }),
      ...(args.idempotencyKey
        ? { idempotencyKey: args.idempotencyKey }
        : {}),
    });
  }

  async getPayout(id: string): Promise<Payout> {
    return this.request<Payout>(`/payouts/${encodeURIComponent(id)}`, {
      method: "GET",
    });
  }
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
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<OAuthTokenSet> {
  const res = await fetchImpl("https://api.uala.com.ar/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
    }).toString(),
  });
  if (res.status === 401 || res.status === 403) {
    throw new UalaAuthError("Ualá OAuth rejected client credentials.");
  }
  if (!res.ok) {
    throw new UalaApiError(res.status, await res.text());
  }
  type RawToken = {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
    merchant_id?: string;
  };
  const raw = (await res.json()) as RawToken;
  const expiresAt = new Date(Date.now() + raw.expires_in * 1000).toISOString();
  const out: OAuthTokenSet = {
    accessToken: raw.access_token,
    refreshToken: raw.refresh_token,
    expiresAt,
    scope: (raw.scope ?? "").split(" ").filter(Boolean),
  };
  if (raw.merchant_id) out.merchantId = raw.merchant_id;
  return out;
}
