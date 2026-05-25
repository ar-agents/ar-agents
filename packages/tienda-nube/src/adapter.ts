/**
 * Tienda Nube adapter contract.
 *
 * Three implementations:
 *   - UnconfiguredTiendaNubeAdapter   throws on every call. Default.
 *   - InMemoryTiendaNubeAdapter       seeded in-process store; perfect
 *                                     for vitest + cockpit demos.
 *   - HttpTiendaNubeAdapter           real REST adapter against
 *                                     `https://api.tiendanube.com/v1/{storeId}`.
 *
 * Tienda Nube REQUIRES a User-Agent header identifying your app +
 * a contact email (per their docs). The adapter takes
 * `appName` + `contactEmail` and builds the UA accordingly. Skipping
 * it gets the request rate-limited.
 */
import {
  TiendaNubeApiError,
  TiendaNubeAuthError,
  TiendaNubeUnconfiguredError,
  TiendaNubeValidationError,
} from "./errors";
import type {
  Customer,
  ListCustomersArgs,
  ListOrdersArgs,
  ListProductsArgs,
  Order,
  PageResult,
  Product,
  Store,
  TnId,
  Webhook,
  WebhookEvent,
} from "./types";

export interface TiendaNubeAdapter {
  getStore(): Promise<Store>;

  listProducts(args?: ListProductsArgs): Promise<PageResult<Product>>;
  getProduct(id: TnId): Promise<Product>;

  listOrders(args?: ListOrdersArgs): Promise<PageResult<Order>>;
  getOrder(id: TnId): Promise<Order>;

  listCustomers(args?: ListCustomersArgs): Promise<PageResult<Customer>>;
  getCustomer(id: TnId): Promise<Customer>;

  listWebhooks(): Promise<Webhook[]>;
  createWebhook(args: { event: WebhookEvent | string; url: string }): Promise<Webhook>;
  deleteWebhook(id: TnId): Promise<void>;
}

// ── Unconfigured (default) ──────────────────────────────────────

export class UnconfiguredTiendaNubeAdapter implements TiendaNubeAdapter {
  async getStore(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("getStore");
  }
  async listProducts(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("listProducts");
  }
  async getProduct(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("getProduct");
  }
  async listOrders(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("listOrders");
  }
  async getOrder(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("getOrder");
  }
  async listCustomers(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("listCustomers");
  }
  async getCustomer(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("getCustomer");
  }
  async listWebhooks(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("listWebhooks");
  }
  async createWebhook(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("createWebhook");
  }
  async deleteWebhook(): Promise<never> {
    throw new TiendaNubeUnconfiguredError("deleteWebhook");
  }
}

// ── HTTP (real Tienda Nube) ─────────────────────────────────────

export type FetchLike = (
  url: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

export interface HttpTiendaNubeAdapterOptions {
  /** Numeric store id received from the OAuth exchange. */
  storeId: number;
  /** Access token received from the OAuth exchange. */
  accessToken: string;
  /** Name of YOUR app as registered in the Tienda Nube Partner Portal.
   * Required by their UA convention. */
  appName: string;
  /** Contact email for your app (also part of the UA). */
  contactEmail: string;
  /** Per-request timeout in ms. Default 12_000. */
  timeoutMs?: number;
  /** Optional override (mainly for tests). */
  fetch?: FetchLike;
  /** Override the base URL. Default `https://api.tiendanube.com/v1`. */
  baseUrl?: string;
}

const DEFAULT_BASE_URL = "https://api.tiendanube.com/v1";

export class HttpTiendaNubeAdapter implements TiendaNubeAdapter {
  private readonly storeId: number;
  private readonly accessToken: string;
  private readonly ua: string;
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  private readonly baseUrl: string;

  constructor(opts: HttpTiendaNubeAdapterOptions) {
    if (!opts.accessToken) {
      throw new TiendaNubeValidationError("accessToken", "required");
    }
    if (!Number.isInteger(opts.storeId) || opts.storeId <= 0) {
      throw new TiendaNubeValidationError(
        "storeId",
        "must be a positive integer",
      );
    }
    if (!opts.appName || !opts.contactEmail) {
      throw new TiendaNubeValidationError(
        "appName + contactEmail",
        "Tienda Nube requires a UA identifying your app + a contact email",
      );
    }
    this.storeId = opts.storeId;
    this.accessToken = opts.accessToken;
    this.ua = `${opts.appName} (${opts.contactEmail})`;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.timeoutMs = opts.timeoutMs ?? 12_000;
    const f =
      opts.fetch ??
      ((globalThis as { fetch?: FetchLike }).fetch as FetchLike | undefined);
    if (!f) {
      throw new TiendaNubeUnconfiguredError(
        "fetch",
        "no fetch function available",
      );
    }
    this.fetcher = f;
  }

  async getStore(): Promise<Store> {
    return this.get<Store>("/store");
  }

  async listProducts(args: ListProductsArgs = {}): Promise<PageResult<Product>> {
    const qs: Record<string, string | number | boolean | undefined> = {
      ...(args.q ? { q: args.q } : {}),
      ...(args.publishedOnly ? { published: true } : {}),
      ...(args.page ? { page: args.page } : {}),
      ...(args.perPage ? { per_page: args.perPage } : {}),
    };
    return this.getPaged<Product>("/products", qs, args.page ?? 1, args.perPage ?? 30);
  }

  async getProduct(id: TnId): Promise<Product> {
    return this.get<Product>(`/products/${id}`);
  }

  async listOrders(args: ListOrdersArgs = {}): Promise<PageResult<Order>> {
    const qs: Record<string, string | number | undefined> = {
      ...(args.sinceIso ? { since_id_or_date: args.sinceIso } : {}),
      ...(args.untilIso ? { created_at_max: args.untilIso } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.paymentStatus ? { payment_status: args.paymentStatus } : {}),
      ...(args.email ? { email: args.email } : {}),
      ...(args.page ? { page: args.page } : {}),
      ...(args.perPage ? { per_page: args.perPage } : {}),
    };
    return this.getPaged<Order>("/orders", qs, args.page ?? 1, args.perPage ?? 30);
  }

  async getOrder(id: TnId): Promise<Order> {
    return this.get<Order>(`/orders/${id}`);
  }

  async listCustomers(args: ListCustomersArgs = {}): Promise<PageResult<Customer>> {
    const qs: Record<string, string | number | undefined> = {
      ...(args.q ? { q: args.q } : {}),
      ...(args.page ? { page: args.page } : {}),
      ...(args.perPage ? { per_page: args.perPage } : {}),
    };
    return this.getPaged<Customer>("/customers", qs, args.page ?? 1, args.perPage ?? 30);
  }

  async getCustomer(id: TnId): Promise<Customer> {
    return this.get<Customer>(`/customers/${id}`);
  }

  async listWebhooks(): Promise<Webhook[]> {
    const r = await this.request<Webhook[]>("GET", "/webhooks");
    return r.body;
  }

  async createWebhook(args: { event: WebhookEvent | string; url: string }): Promise<Webhook> {
    if (!/^https:\/\//.test(args.url)) {
      throw new TiendaNubeValidationError(
        "url",
        "must be an https:// URL",
      );
    }
    const r = await this.request<Webhook>("POST", "/webhooks", {
      event: args.event,
      url: args.url,
    });
    return r.body;
  }

  async deleteWebhook(id: TnId): Promise<void> {
    await this.request<unknown>("DELETE", `/webhooks/${id}`);
  }

  private async get<T>(path: string): Promise<T> {
    const r = await this.request<T>("GET", path);
    return r.body;
  }

  private async getPaged<T>(
    path: string,
    qs: Record<string, string | number | boolean | undefined>,
    page: number,
    perPage: number,
  ): Promise<PageResult<T>> {
    const r = await this.request<T[]>("GET", this.qstring(path, qs));
    const linkHeader = r.headers.get("link") ?? "";
    const hasMore = /rel="next"/i.test(linkHeader);
    return { data: r.body, page, perPage, hasMore };
  }

  private qstring(
    path: string,
    qs: Record<string, string | number | boolean | undefined>,
  ): string {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(qs)) {
      if (v === undefined) continue;
      parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
    }
    return parts.length === 0 ? path : `${path}?${parts.join("&")}`;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<{ body: T; headers: { get(name: string): string | null } }> {
    const url = `${this.baseUrl}/${this.storeId}${path}`;
    const headers: Record<string, string> = {
      authentication: `bearer ${this.accessToken}`,
      "user-agent": this.ua,
      accept: "application/json",
    };
    if (body !== undefined) headers["content-type"] = "application/json";

    let res;
    try {
      res = await this.withTimeout(
        this.fetcher(url, {
          method,
          headers,
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        }),
      );
    } catch (err) {
      throw new TiendaNubeApiError(
        0,
        { description: err instanceof Error ? err.message : "network error" },
        { url, method },
      );
    }

    if (res.status === 401 || res.status === 403) {
      throw new TiendaNubeAuthError(
        `Tienda Nube rejected the request (HTTP ${res.status}). Token may have been invalidated by uninstall.`,
        { url, method },
      );
    }
    if (res.status === 204 || res.status === 202) {
      return { body: undefined as unknown as T, headers: res.headers };
    }
    let parsed: unknown;
    try {
      parsed = await res.json();
    } catch {
      parsed = null;
    }
    if (!res.ok) {
      throw new TiendaNubeApiError(res.status, parsed, { url, method });
    }
    return { body: parsed as T, headers: res.headers };
  }

  private async withTimeout<T>(p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutP = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`timeout after ${this.timeoutMs}ms`)),
        this.timeoutMs,
      );
    });
    try {
      return await Promise.race([p, timeoutP]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}

// ── In-memory (testing / dogfood) ───────────────────────────────

export interface InMemoryTiendaNubeAdapterSeed {
  store?: Store;
  products?: Product[];
  orders?: Order[];
  customers?: Customer[];
}

export class InMemoryTiendaNubeAdapter implements TiendaNubeAdapter {
  private store: Store;
  private readonly products: Map<TnId, Product>;
  private readonly orders: Map<TnId, Order>;
  private readonly customers: Map<TnId, Customer>;
  private readonly webhooks: Map<TnId, Webhook>;
  private nextWebhookId = 1;

  constructor(seed: InMemoryTiendaNubeAdapterSeed = {}) {
    this.store = seed.store ?? {
      id: 1,
      name: { es: "Tienda Demo", en: "Demo Store" },
      country: "AR",
      main_currency: "ARS",
      main_language: "es",
      url: "https://demo.tiendanube.com",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    this.products = new Map((seed.products ?? []).map((p) => [p.id, p]));
    this.orders = new Map((seed.orders ?? []).map((o) => [o.id, o]));
    this.customers = new Map((seed.customers ?? []).map((c) => [c.id, c]));
    this.webhooks = new Map();
  }

  async getStore(): Promise<Store> {
    return this.store;
  }

  async listProducts(args: ListProductsArgs = {}): Promise<PageResult<Product>> {
    let rows = Array.from(this.products.values());
    if (args.publishedOnly) rows = rows.filter((p) => p.published);
    if (args.q) {
      const q = args.q.toLowerCase();
      rows = rows.filter((p) =>
        Object.values(p.name).some((v) => v?.toLowerCase().includes(q)),
      );
    }
    return this.paginate(rows, args.page, args.perPage);
  }

  async getProduct(id: TnId): Promise<Product> {
    const p = this.products.get(id);
    if (!p) throw new TiendaNubeApiError(404, { description: "not_found" });
    return p;
  }

  async listOrders(args: ListOrdersArgs = {}): Promise<PageResult<Order>> {
    let rows = Array.from(this.orders.values());
    if (args.status) rows = rows.filter((o) => o.status === args.status);
    if (args.paymentStatus)
      rows = rows.filter((o) => o.payment_status === args.paymentStatus);
    if (args.email)
      rows = rows.filter((o) =>
        (o.contact_email ?? "").toLowerCase().includes(args.email!.toLowerCase()),
      );
    if (args.sinceIso) rows = rows.filter((o) => o.created_at >= args.sinceIso!);
    if (args.untilIso) rows = rows.filter((o) => o.created_at <= args.untilIso!);
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return this.paginate(rows, args.page, args.perPage);
  }

  async getOrder(id: TnId): Promise<Order> {
    const o = this.orders.get(id);
    if (!o) throw new TiendaNubeApiError(404, { description: "not_found" });
    return o;
  }

  async listCustomers(args: ListCustomersArgs = {}): Promise<PageResult<Customer>> {
    let rows = Array.from(this.customers.values());
    if (args.q) {
      const q = args.q.toLowerCase();
      rows = rows.filter(
        (c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.email ?? "").toLowerCase().includes(q),
      );
    }
    return this.paginate(rows, args.page, args.perPage);
  }

  async getCustomer(id: TnId): Promise<Customer> {
    const c = this.customers.get(id);
    if (!c) throw new TiendaNubeApiError(404, { description: "not_found" });
    return c;
  }

  async listWebhooks(): Promise<Webhook[]> {
    return Array.from(this.webhooks.values());
  }

  async createWebhook(args: { event: WebhookEvent | string; url: string }): Promise<Webhook> {
    if (!/^https:\/\//.test(args.url)) {
      throw new TiendaNubeValidationError("url", "must be an https:// URL");
    }
    const id = this.nextWebhookId++;
    const now = new Date().toISOString();
    const w: Webhook = {
      id,
      event: args.event,
      url: args.url,
      created_at: now,
      updated_at: now,
    };
    this.webhooks.set(id, w);
    return w;
  }

  async deleteWebhook(id: TnId): Promise<void> {
    this.webhooks.delete(id);
  }

  private paginate<T>(
    rows: T[],
    page = 1,
    perPage = 30,
  ): PageResult<T> {
    const start = (page - 1) * perPage;
    const slice = rows.slice(start, start + perPage);
    return {
      data: slice,
      page,
      perPage,
      hasMore: start + perPage < rows.length,
    };
  }
}
