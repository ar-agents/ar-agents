// Framework-agnostic request/response types + provider interfaces.
//
// The bridge is intentionally not coupled to Next.js, Hono, Express, etc.
// The host adapter normalizes the framework-native request to `AcpRequest`,
// invokes a handler, and converts `AcpResponse` back to the framework-native
// response. Sample adapters live in `apps/bridge-hello/`.

import type { CheckoutSession } from "../schemas/checkout-session";
import type { Order } from "../schemas/order";
import type { PaymentData } from "../schemas/payment";
import type {
  CapabilitiesResponse,
  PaymentHandler,
  DiscoveryResponse,
} from "../schemas/capabilities";
import type { LineItem, Item } from "../schemas/line-item";
import type { Currency, Locale, Metadata } from "../schemas/common";
import type { FulfillmentDetails, FulfillmentOption } from "../schemas/fulfillment";
import type { Buyer } from "../schemas/buyer";
import type { Link } from "../schemas/messages";
import type { StateAdapter } from "../state";
import type { VersionConfig } from "../version";

/**
 * Normalized inbound request. Host adapter populates this from the
 * framework-native request (Next.js NextRequest, Express Request, Hono
 * Context, etc.).
 *
 * IMPORTANT: `rawBody` MUST be the exact bytes received over the wire (no
 * re-serialization). The idempotency-key body-hash and the (Phase 2) AP2
 * mandate signature both depend on byte-for-byte fidelity.
 */
export interface AcpRequest {
  method: "GET" | "POST" | "PUT" | "DELETE" | string;
  /** Path-only (e.g. `/checkout_sessions/cs_abc/complete`). */
  path: string;
  headers: Record<string, string | undefined>;
  /** Raw HTTP body as a string. Empty for GET. */
  rawBody: string;
  /**
   * Optional pre-parsed JSON body. If absent, handlers `JSON.parse(rawBody)`
   * lazily. Provide this if your framework already parsed it (e.g. Next.js
   * `req.json()`).
   */
  body?: unknown;
}

/**
 * Normalized outbound response. Host adapter converts this to the
 * framework-native response.
 */
export interface AcpResponse {
  status: number;
  body: unknown;
  headers: Record<string, string>;
}

/**
 * A catalog provider resolves item IDs to merchant-canonical line items.
 * The bridge is catalog-agnostic — your host code must implement this.
 *
 * For MELI: query MELI's `/items/{id}` endpoint via the MELI integration
 * helpers (Phase 1.5). For Tienda Nube / VTEX / own catalog: implement
 * against your data store.
 */
export interface CatalogProvider {
  /**
   * Resolve a product ID to its current sellable state. Return `null` if the
   * item does not exist; throw `OutOfStockError` (importable from this
   * module) if it's known but currently unsellable.
   */
  resolveItem(id: string): Promise<ResolvedItem | null>;
}

export interface ResolvedItem {
  id: string;
  name: string;
  description?: string;
  /** Minor units. */
  unit_amount: number;
  /** Lowercase ISO 4217. */
  currency: Currency;
  available_quantity?: number;
  images?: string[];
  sku?: string;
  variant_id?: string;
  category?: string;
  weight?: { value: number; unit: "g" | "kg" | "oz" | "lb" };
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: "cm" | "in";
  };
  /** Marketplace-seller name (for MELI catalog listings shared by multiple sellers). */
  seller_name?: string;
  /** Tax classification flag (e.g. monotributo seller exempts buyer-side IVA). */
  tax_exempt?: boolean;
}

export class OutOfStockError extends Error {
  readonly itemId: string;
  constructor(itemId: string) {
    super(`Item '${itemId}' is out of stock`);
    this.name = "OutOfStockError";
    this.itemId = itemId;
  }
}

/**
 * A payment provider executes the actual charge. The bridge dispatches by
 * `payment_data.handler_id` — host code registers one or more
 * `PaymentProvider` instances, one per handler.
 *
 * For MercadoPago: the `MercadoPagoPaymentProvider` (Phase 1.5) creates an
 * MP `preference`, mints a per-session token, and on `complete` calls
 * `/v1/payments` with the bound preference + token.
 */
export interface PaymentProvider {
  /** Must equal `PaymentHandler.id` exposed in capabilities. */
  readonly handlerId: string;

  /**
   * Optional: called after `createCheckoutSession` resolves line items, to
   * pre-create any provider-side resources (e.g. MP `preference`). Return
   * additional `metadata` to attach to the session.
   */
  onSessionCreated?(session: CheckoutSession): Promise<{
    metadata?: Metadata;
  } | void>;

  /**
   * Process the payment. Called from `complete`. Return `success: true` on
   * authorization (sync) — capture/settlement may be async.
   */
  processPayment(args: {
    session: CheckoutSession;
    paymentData: PaymentData;
  }): Promise<PaymentResult>;
}

export type PaymentResult =
  | {
      success: true;
      /** Provider-side payment ID (e.g. MP `payment.id`). */
      paymentId: string;
      /** Optional 3DS / OTP / approval-required followups. */
      requiresAction?: AuthenticationAction;
      /** Free-form metadata to attach to the order. */
      metadata?: Metadata;
    }
  | {
      success: false;
      /** Canonical ACP error code. Defaults to "payment_declined". */
      code: string;
      message: string;
      /** Optional details (decline reason, network error code, etc.). */
      details?: Record<string, unknown>;
    };

export interface AuthenticationAction {
  type: "3ds" | "otp" | "biometric" | "redirect" | string;
  url?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Cross-cutting hooks. Used to wire AR-fiscal compliance (auto-emit Factura
 * A/B/C on order creation), to push events into observability/telemetry, or
 * to implement custom side effects.
 */
export interface FacilitatorHooks {
  /** Called after a session is created and persisted. */
  onSessionCreated?(session: CheckoutSession): Promise<void>;

  /** Called after a session is updated (any of the four mutating endpoints). */
  onSessionUpdated?(session: CheckoutSession): Promise<void>;

  /**
   * Called AFTER successful payment authorization but BEFORE the order is
   * persisted. May return additional `metadata` to attach to the order
   * (this is where AR-fiscal Factura emission attaches the CAE).
   */
  onOrderConfirmed?(args: {
    session: CheckoutSession;
    order: Order;
  }): Promise<{ metadata?: Metadata } | void>;

  /** Called after a session is canceled. */
  onSessionCanceled?(args: {
    session: CheckoutSession;
    reason?: string;
  }): Promise<void>;

  /**
   * Called when the bridge needs to emit an outbound webhook to the agent
   * (e.g. `order_create`, `order_update`). Implement this to plug into a
   * webhook delivery system (in-process, queue, Hookdeck, etc.).
   *
   * Default behavior (when this hook is not provided): the webhook is NOT
   * emitted automatically. The bridge will still sign the webhook payload
   * via `signWebhook()` if you call it explicitly.
   */
  emitWebhook?(args: {
    type: string;
    payload: unknown;
    /** Pre-computed Merchant-Signature header value. */
    signature: string;
    /** Pre-computed unix-seconds timestamp embedded in `signature`. */
    timestamp: number;
    /** Raw body bytes that were signed. */
    rawBody: string;
  }): Promise<void>;
}

export interface FacilitatorOptions {
  /** Persistence layer. Required. */
  state: StateAdapter;
  /** Catalog resolver. Required. */
  catalog: CatalogProvider;
  /**
   * Payment providers, keyed by `handlerId`. At least one is required.
   * The bridge dispatches by `payment_data.handler_id`.
   */
  paymentProviders: Record<string, PaymentProvider>;
  /**
   * Payment handlers exposed to agents in the capabilities response. Should
   * align with `paymentProviders` keys but carries the agent-facing schema
   * URLs and display strings.
   */
  paymentHandlers: PaymentHandler[];
  /**
   * Static seller-side capability metadata. Augmented per-session with the
   * negotiated extension list and intervention enforcement.
   */
  baseCapabilities?: Partial<CapabilitiesResponse>;
  /** Static `/.well-known/acp.json` payload. */
  discovery?: DiscoveryResponse;
  /** Webhook signing secret. Required if `hooks.emitWebhook` is set. */
  webhookSecret?: string;
  /** Optional shared agent-facing links (terms, privacy, etc.). */
  defaultLinks?: Link[];
  /** Optional version negotiation config. */
  version?: VersionConfig;
  /** Cross-cutting hooks. */
  hooks?: FacilitatorHooks;
  /** Override clock for deterministic tests. Returns Unix seconds. */
  now?: () => number;
  /**
   * Override session/order ID generators. Defaults to
   * `cs_<crypto.randomUUID()>` and `ord_<crypto.randomUUID()>`.
   */
  generateSessionId?: () => string;
  generateOrderId?: () => string;
  /** Override fulfillment options compute. Pure-AR default returns []. */
  computeFulfillmentOptions?: (args: {
    lineItems: LineItem[];
    fulfillmentDetails?: FulfillmentDetails;
    currency: Currency;
    locale?: Locale;
  }) => Promise<FulfillmentOption[]>;
}

/**
 * Helper: extract a single header value (case-insensitive). Returns the
 * first match if the host gave us a duplicated header.
 */
export function header(
  headers: Record<string, string | undefined>,
  name: string,
): string | undefined {
  const target = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === target) {
      const v = headers[k];
      if (v !== undefined) return v;
    }
  }
  return undefined;
}

// Re-export common types host code may need.
export type { Buyer, CheckoutSession, Item, LineItem, Order, PaymentData };
