/**
 * Public types for @ar-agents/tienda-nube.
 *
 * Modeled on the Tienda Nube / Nuvemshop REST API v1 documented at
 * https://dev.tiendanube.com. We intentionally keep the surface
 * conservative: only the fields the agent layer actually consumes.
 * Anything else is preserved on the response via `extras` so a
 * consumer pinned to v0.1 cannot break when the upstream API adds
 * optional fields.
 */

/** ISO 4217 currency code. Tienda Nube returns "ARS" / "USD" / "BRL" etc. */
export type Currency = string;

/** Locale code as returned by Tienda Nube ("es", "pt", "en"). */
export type Locale = string;

/** Tienda Nube object ids are integers in their API. We model them as
 * numbers so the consumer can pass them through without parsing. */
export type TnId = number;

/** Localized text. Tienda Nube returns `{ es: "...", pt: "...", ... }`
 * for almost every human-readable field. */
export type Localized = Partial<Record<Locale, string>>;

// ── Store ───────────────────────────────────────────────────────

export interface Store {
  id: TnId;
  name: Localized;
  business_id?: string | null;
  business_name?: string | null;
  business_address?: string | null;
  country: string;
  main_currency: Currency;
  main_language: Locale;
  url: string;
  contact_email?: string;
  created_at: string; // ISO 8601
  extras?: Record<string, unknown>;
}

// ── Product ─────────────────────────────────────────────────────

export interface Product {
  id: TnId;
  name: Localized;
  description?: Localized;
  handle: Localized;
  variants: ProductVariant[];
  /** Tienda Nube uses `published` as the visibility flag. */
  published: boolean;
  /** Free for the merchant — agents can read but rarely write. */
  tags?: string;
  brand?: string | null;
  created_at: string;
  updated_at: string;
  extras?: Record<string, unknown>;
}

export interface ProductVariant {
  id: TnId;
  product_id: TnId;
  /** Tienda Nube prices are strings in their API (no float rounding).
   * Always treat as decimal-string; convert with `Number(...)` only at
   * display time. */
  price: string;
  promotional_price?: string | null;
  stock_management: boolean;
  stock?: number | null;
  sku?: string | null;
  barcode?: string | null;
  values: Array<{ es?: string; pt?: string; en?: string; [locale: string]: string | undefined }>;
  extras?: Record<string, unknown>;
}

// ── Order ───────────────────────────────────────────────────────

export type OrderStatus =
  /** Open / unconfirmed. */
  | "open"
  /** Closed / completed. */
  | "closed"
  /** Cancelled. */
  | "cancelled";

export type PaymentStatus =
  | "pending"
  | "authorized"
  | "paid"
  | "voided"
  | "refunded"
  | "abandoned";

export type ShippingStatus =
  | "unpacked"
  | "unfulfilled"
  | "fulfilled"
  | "unshipped"
  | "shipped";

export interface Order {
  id: TnId;
  /** Visible order number for the customer ("#1234"). */
  number: number;
  /** Token used in the customer-facing order URL. */
  token: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  shipping_status: ShippingStatus;
  /** Decimal-string totals. */
  subtotal: string;
  total: string;
  /** ISO 4217 currency code. */
  currency: Currency;
  contact_email?: string;
  contact_name?: string;
  contact_identification?: string;
  contact_phone?: string;
  billing_address?: TnAddress | null;
  shipping_address?: TnAddress | null;
  products: OrderProduct[];
  created_at: string;
  updated_at: string;
  closed_at?: string | null;
  paid_at?: string | null;
  /** Free-text note from the merchant (sometimes set by the customer). */
  note?: string | null;
  /** Stays raw for unparsed fields the agent might want. */
  extras?: Record<string, unknown>;
}

export interface OrderProduct {
  id: TnId;
  product_id: TnId;
  variant_id: TnId;
  name: string;
  price: string;
  quantity: number;
  sku?: string | null;
}

export interface TnAddress {
  address?: string;
  city?: string;
  country?: string;
  zipcode?: string;
  number?: string;
  province?: string;
  floor?: string;
  locality?: string;
  phone?: string;
}

// ── Customer ────────────────────────────────────────────────────

export interface Customer {
  id: TnId;
  name?: string;
  email?: string;
  identification?: string;
  phone?: string;
  created_at: string;
  updated_at: string;
  default_address?: TnAddress | null;
  /** Total spent by this customer (decimal-string, in main_currency). */
  total_spent?: string;
  total_orders?: number;
  extras?: Record<string, unknown>;
}

// ── Webhooks ────────────────────────────────────────────────────

/** Subset of Tienda Nube webhook events agents care about. See
 * https://dev.tiendanube.com/docs/api/resources/webhook for the
 * complete list — this enum is open via the `extras` field on
 * Webhook. */
export type WebhookEvent =
  | "order/created"
  | "order/updated"
  | "order/paid"
  | "order/cancelled"
  | "order/fulfilled"
  | "product/created"
  | "product/updated"
  | "product/deleted"
  | "customer/created"
  | "customer/updated"
  | "app/uninstalled";

export interface Webhook {
  id: TnId;
  event: WebhookEvent | string;
  url: string;
  created_at: string;
  updated_at: string;
  extras?: Record<string, unknown>;
}

// ── List parameters ─────────────────────────────────────────────

export interface ListOrdersArgs {
  /** ISO 8601 lower bound on created_at. */
  sinceIso?: string | undefined;
  /** ISO 8601 upper bound on created_at. */
  untilIso?: string | undefined;
  /** Filter on status (open / closed / cancelled). */
  status?: OrderStatus | undefined;
  /** Filter on payment status. */
  paymentStatus?: PaymentStatus | undefined;
  /** Email of the contact — Tienda Nube does substring match. */
  email?: string | undefined;
  /** Page number (1-based). Tienda Nube paginates by `page` + `per_page`. */
  page?: number | undefined;
  /** Items per page (default 30, max 200). */
  perPage?: number | undefined;
}

export interface ListProductsArgs {
  /** Substring match on the product name in any locale. */
  q?: string | undefined;
  /** Published-only filter. */
  publishedOnly?: boolean | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface ListCustomersArgs {
  q?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
}

export interface PageResult<T> {
  data: T[];
  /** Page returned (echoes the request). */
  page: number;
  /** Items returned in this page. */
  perPage: number;
  /** True if there's at least one more page. Driven by `Link: rel="next"`. */
  hasMore: boolean;
}

// ── OAuth ────────────────────────────────────────────────────────

export interface OAuthAuthorizeArgs {
  appId: string;
  state: string;
}

export interface OAuthTokenSet {
  /** The store-bound access token. Tienda Nube tokens do NOT expire
   * per their docs — uninstall flips them invalid. */
  accessToken: string;
  /** Numeric store id (Tienda Nube also calls it `user_id` in their
   * docs; we normalize to `storeId`). */
  storeId: number;
  /** OAuth scope string. */
  scope: string;
  /** Returned at the time of the exchange. */
  receivedAt: string;
}

export interface OAuthExchangeArgs {
  appId: string;
  clientSecret: string;
  code: string;
}
