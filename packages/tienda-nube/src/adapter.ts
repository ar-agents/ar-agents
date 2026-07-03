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
  HttpClient,
  parseOrThrow,
  ArAgentsAuthError,
  ArAgentsProtocolError,
  ArAgentsRateLimitError,
  ArAgentsResponseValidationError,
  type QueryParams,
  type ResponseSchema,
} from "@ar-agents/core";
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
import {
  storeSchema,
  productSchema,
  productListSchema,
  orderSchema,
  orderListSchema,
  customerSchema,
  customerListSchema,
  webhookSchema,
  webhookListSchema,
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

/**
 * @deprecated The adapter now uses the shared `HttpClient` from
 * `@ar-agents/core`, whose `fetch` override is a standard `typeof fetch`.
 * Pass a real `fetch` implementation via `HttpTiendaNubeAdapterOptions.fetch`
 * instead. This alias is retained so external type imports don't break.
 */
export type FetchLike = typeof fetch;

/**
 * Translate a `@ar-agents/core` transport error into the Tienda Nube
 * taxonomy. A malformed body (`ArAgentsResponseValidationError`) is
 * surfaced LOUD as an api_error(502) — never swallowed into a fabricated
 * clean result. A network/timeout (`ArAgentsProtocolError.status === null`)
 * maps to `TiendaNubeApiError(0, …)` (the pre-migration network path). An
 * HTTP status maps to `TiendaNubeApiError(status, body)`. 401/403 are handled
 * separately (before this helper) so they become `TiendaNubeAuthError`.
 */
function mapCoreError(err: unknown, url: string, method: string): unknown {
  if (err instanceof ArAgentsResponseValidationError) {
    return new TiendaNubeApiError(
      502,
      { error: "malformed_response", description: err.message },
      { url, method },
    );
  }
  if (err instanceof ArAgentsAuthError) {
    return new TiendaNubeAuthError(
      `Tienda Nube rejected the request (${
        err.context["status"] ?? "auth error"
      }). Token may have been invalidated by uninstall.`,
      { url, method },
    );
  }
  if (err instanceof ArAgentsRateLimitError) {
    return new TiendaNubeApiError(429, err.context["body"] ?? null, {
      url,
      method,
    });
  }
  if (err instanceof ArAgentsProtocolError) {
    return err.status === null
      ? new TiendaNubeApiError(
          0,
          { description: err.message },
          { url, method },
        )
      : new TiendaNubeApiError(err.status, err.context["body"] ?? null, {
          url,
          method,
        });
  }
  if (err instanceof SyntaxError) {
    // The requestRaw paths (list reads + webhook create/list) call res.json()
    // themselves; a non-JSON or empty 200/201 body (HTML error / maintenance
    // page) makes res.json() throw a SyntaxError. Surface it IN-taxonomy and
    // loud — never let a raw SyntaxError escape as a non-TiendaNube error.
    return new TiendaNubeApiError(
      502,
      { error: "malformed_response", description: err.message },
      { url, method },
    );
  }
  return err;
}

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
  private readonly client: HttpClient;

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
    const base = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    const ua = `${opts.appName} (${opts.contactEmail})`;
    // Tienda Nube's auth header is the NON-standard `authentication: bearer
    // <token>` — NOT the standard `Authorization`. So we do NOT use the core
    // client's `auth` option (which sets `Authorization`); we pass it as a
    // default header on every request instead.
    this.client = new HttpClient({
      baseUrl: `${base}/${opts.storeId}`,
      ...(opts.fetch ? { fetch: opts.fetch } : {}),
      timeoutMs: opts.timeoutMs ?? 12_000,
      userAgent: ua,
      // Idempotent reads (GET) and idempotent DELETE (webhook removal) retry
      // once on a transient 5xx/429/network fault. Webhook CREATE is a POST —
      // non-idempotent, carries no idempotency key, and is NEVER auto-retried
      // by the core client (we never set `idempotent: true` on it).
      retry: { maxAttempts: 2 },
      defaultHeaders: {
        authentication: `bearer ${opts.accessToken}`,
      },
    });
  }

  async getStore(): Promise<Store> {
    return this.getOne("/store", storeSchema) as unknown as Promise<Store>;
  }

  async listProducts(args: ListProductsArgs = {}): Promise<PageResult<Product>> {
    const query: QueryParams = {
      ...(args.q ? { q: args.q } : {}),
      ...(args.publishedOnly ? { published: true } : {}),
      ...(args.page ? { page: args.page } : {}),
      ...(args.perPage ? { per_page: args.perPage } : {}),
    };
    return this.getPaged(
      "/products",
      query,
      productListSchema,
      args.page ?? 1,
      args.perPage ?? 30,
    ) as unknown as Promise<PageResult<Product>>;
  }

  async getProduct(id: TnId): Promise<Product> {
    return this.getOne(`/products/${id}`, productSchema) as unknown as Promise<Product>;
  }

  async listOrders(args: ListOrdersArgs = {}): Promise<PageResult<Order>> {
    const query: QueryParams = {
      ...(args.sinceIso ? { since_id_or_date: args.sinceIso } : {}),
      ...(args.untilIso ? { created_at_max: args.untilIso } : {}),
      ...(args.status ? { status: args.status } : {}),
      ...(args.paymentStatus ? { payment_status: args.paymentStatus } : {}),
      ...(args.email ? { email: args.email } : {}),
      ...(args.page ? { page: args.page } : {}),
      ...(args.perPage ? { per_page: args.perPage } : {}),
    };
    return this.getPaged(
      "/orders",
      query,
      orderListSchema,
      args.page ?? 1,
      args.perPage ?? 30,
    ) as unknown as Promise<PageResult<Order>>;
  }

  async getOrder(id: TnId): Promise<Order> {
    return this.getOne(`/orders/${id}`, orderSchema) as unknown as Promise<Order>;
  }

  async listCustomers(args: ListCustomersArgs = {}): Promise<PageResult<Customer>> {
    const query: QueryParams = {
      ...(args.q ? { q: args.q } : {}),
      ...(args.page ? { page: args.page } : {}),
      ...(args.perPage ? { per_page: args.perPage } : {}),
    };
    return this.getPaged(
      "/customers",
      query,
      customerListSchema,
      args.page ?? 1,
      args.perPage ?? 30,
    ) as unknown as Promise<PageResult<Customer>>;
  }

  async getCustomer(id: TnId): Promise<Customer> {
    return this.getOne(`/customers/${id}`, customerSchema) as unknown as Promise<Customer>;
  }

  async listWebhooks(): Promise<Webhook[]> {
    const method = "GET";
    const path = "/webhooks";
    try {
      const res = await this.client.requestRaw({ path, method });
      const body = await res.json();
      return parseOrThrow(webhookListSchema, body, { path }) as unknown as Webhook[];
    } catch (err) {
      throw mapCoreError(err, this.url(path), method);
    }
  }

  async createWebhook(args: { event: WebhookEvent | string; url: string }): Promise<Webhook> {
    if (!/^https:\/\//.test(args.url)) {
      throw new TiendaNubeValidationError(
        "url",
        "must be an https:// URL",
      );
    }
    const method = "POST";
    const path = "/webhooks";
    try {
      // Creating a webhook is non-idempotent and carries no idempotency key,
      // so we deliberately leave `idempotent` unset — the core client does NOT
      // retry POST by default, which is what we want.
      const res = await this.client.requestRaw({
        path,
        method,
        body: { event: args.event, url: args.url },
      });
      const body = await res.json();
      return parseOrThrow(webhookSchema, body, { path }) as unknown as Webhook;
    } catch (err) {
      throw mapCoreError(err, this.url(path), method);
    }
  }

  async deleteWebhook(id: TnId): Promise<void> {
    const method = "DELETE";
    const path = `/webhooks/${id}`;
    try {
      // 204/202 → empty body; we don't read it.
      await this.client.requestRaw({ path, method });
    } catch (err) {
      throw mapCoreError(err, this.url(path), method);
    }
  }

  /** Single-object GET routed through the schema-validating `request<T>`. */
  private async getOne<T>(
    path: string,
    schema: ResponseSchema<T>,
  ): Promise<T> {
    try {
      return await this.client.request<T>({ path, method: "GET", schema });
    } catch (err) {
      throw mapCoreError(err, this.url(path), "GET");
    }
  }

  /**
   * List GET. Uses `requestRaw` so we can read the `Link` response header
   * (Tienda Nube signals a next page via `rel="next"`), then parses + validates
   * the array body via `parseOrThrow`.
   */
  private async getPaged<E>(
    path: string,
    query: QueryParams,
    schema: ResponseSchema<E[]>,
    page: number,
    perPage: number,
  ): Promise<PageResult<E>> {
    try {
      const res = await this.client.requestRaw({ path, method: "GET", query });
      const raw = await res.json();
      const data = parseOrThrow(schema, raw, { path });
      const linkHeader = res.headers.get("link") ?? "";
      const hasMore = /rel="next"/i.test(linkHeader);
      return { data, page, perPage, hasMore };
    } catch (err) {
      throw mapCoreError(err, this.url(path), "GET");
    }
  }

  /** Reconstruct the absolute URL (for error context only). */
  private url(path: string): string {
    return `${this.client.baseUrl}${path}`;
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
