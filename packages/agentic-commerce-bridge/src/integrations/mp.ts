// MercadoPago payment provider adapter.
//
// Translates ACP `payment_data.instrument.credential.token` (which we mint
// during `onSessionCreated`) into MP `/v1/payments` lookups, and exposes the
// session-time hook that creates the preference.
//
// This adapter is intentionally duck-typed — it takes user-provided
// `createPreference` and `lookupPayment` functions instead of depending on
// `@ar-agents/mercadopago` directly. That lets it work with:
//   - `@ar-agents/mercadopago` (the recommended path; just wire `client.preferences.create` and `client.payments.get`).
//   - Raw `fetch` against the MP REST API.
//   - A test mock.
//
// The MP credential family used by this adapter is `mp_payment_id`. The agent
// receives a per-session preference URL on session creation, redirects the
// user, MP processes the payment, and on `complete` the agent passes the
// resulting MP payment id as `payment_data.instrument.credential.token` with
// `type: "mp_payment_id"`.

import type {
  PaymentProvider,
  PaymentResult,
  ResolvedItem,
} from "../handlers/types";
import type { CheckoutSession } from "../schemas/checkout-session";
import type { LineItem } from "../schemas/line-item";

/**
 * Minimal duck-typed shape of an MP preference response. Aligns with both
 * `@ar-agents/mercadopago` and raw MP REST. Only the fields the bridge needs.
 */
export interface MpPreferenceResponse {
  id: string;
  /** Live checkout URL (production token). */
  init_point?: string;
  /** Sandbox checkout URL (test token). */
  sandbox_init_point?: string;
  /** Date the preference expires (ISO 8601). */
  expiration_date_to?: string;
  /** External-reference echo (we pass `session.id` here). */
  external_reference?: string;
  // Carry through any additional fields the host attached.
  [k: string]: unknown;
}

/**
 * Minimal duck-typed shape of an MP `/v1/payments/{id}` response.
 */
export interface MpPaymentResponse {
  id: string | number;
  /** "approved" | "in_process" | "rejected" | "refunded" | etc. */
  status: string;
  status_detail?: string;
  /** Currency in MP convention is uppercase ISO 4217 ("ARS", "BRL"). */
  currency_id: string;
  transaction_amount: number;
  /** Echo of `external_reference` we attached on preference creation. */
  external_reference?: string;
  /** Echo of `metadata` we attached on preference creation. */
  metadata?: Record<string, unknown>;
  payer?: {
    email?: string;
    identification?: { type?: string; number?: string };
  };
  // Other fields we don't strictly need but expose for hosts to introspect.
  [k: string]: unknown;
}

/**
 * Inputs the host must provide to build the MP preference. The bridge
 * translates the session into a normalized payload here so the host doesn't
 * have to walk the ACP shape.
 */
export interface MpPreferenceCreatePayload {
  /** Echo of `session.id` for reconciliation via webhook. */
  external_reference: string;
  /** Items as MP expects (NOT the ACP shape). */
  items: Array<{
    id: string;
    title: string;
    description?: string;
    picture_url?: string;
    quantity: number;
    /** MP wants major units as a float (e.g. 199.0 for ARS 199). */
    unit_price: number;
    /** Uppercase ISO 4217 (MP convention). */
    currency_id: string;
  }>;
  /** Optional buyer info, when present on the session. */
  payer?: {
    email?: string;
    name?: string;
    surname?: string;
  };
  /** Free-form metadata to attach to the preference + payment. */
  metadata?: Record<string, unknown>;
}

export interface MercadoPagoProviderOptions {
  /**
   * Identifier this provider registers under. The agent must include this
   * exact string as `payment_data.handler_id`.
   */
  handlerId?: string;

  /**
   * Called during `onSessionCreated` to create an MP preference. The host
   * implements this against `@ar-agents/mercadopago` or raw fetch.
   */
  createPreference: (
    payload: MpPreferenceCreatePayload,
  ) => Promise<MpPreferenceResponse>;

  /**
   * Called during `processPayment` to look up the MP payment by ID. The host
   * implements this against `@ar-agents/mercadopago` or raw fetch.
   */
  lookupPayment: (paymentId: string) => Promise<MpPaymentResponse | null>;

  /**
   * Currency alphabet conversion. ACP uses lowercase ISO 4217; MP uses
   * uppercase. Default: simple `.toUpperCase()`. Override if the host has a
   * MELI Global Selling presentment-currency mapping.
   */
  currencyToMp?: (acpCurrency: string) => string;

  /**
   * Convert ACP minor units to MP major units (the float MP expects). Default:
   * divide by `divisorFor(currency)` — 100 for 2-decimal currencies, 1 for
   * 0-decimal ones (CLP, PYG, JPY, KRW). Override if you have a more
   * sophisticated rule.
   */
  minorToMajor?: (amountMinor: number, acpCurrency: string) => number;

  /**
   * Acceptable MP payment statuses to treat as success. Default: `["approved"]`.
   * Hosts handling Pix can add `"in_process"` (Pix can settle async).
   */
  acceptableStatuses?: string[];

  /**
   * Sandbox toggle. When true, the returned `checkout_url` is
   * `sandbox_init_point`; when false, `init_point`. Default: `false`.
   */
  sandbox?: boolean;
}

const DEFAULT_HANDLER_ID = "mercadopago";
const DEFAULT_ACCEPTABLE = ["approved"];

const ZERO_DECIMAL_CURRENCIES = new Set([
  "ars", // Argentine peso has 2 decimals — listed for clarity (NOT zero-decimal).
]);
// Per ISO 4217, currencies with zero minor units:
const TRUE_ZERO_DECIMAL = new Set([
  "clp",
  "pyg",
  "jpy",
  "krw",
  "vnd",
  "ugx",
  "rwf",
  "isk",
  "huf",
]);
ZERO_DECIMAL_CURRENCIES.delete("ars"); // sanity: ARS is 2-decimal
TRUE_ZERO_DECIMAL.forEach((c) => ZERO_DECIMAL_CURRENCIES.add(c));

function defaultDivisor(acpCurrency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(acpCurrency.toLowerCase()) ? 1 : 100;
}

function defaultCurrencyToMp(acpCurrency: string): string {
  return acpCurrency.toUpperCase();
}

function defaultMinorToMajor(amountMinor: number, acpCurrency: string): number {
  return amountMinor / defaultDivisor(acpCurrency);
}

/**
 * Build a MercadoPago `PaymentProvider` from host-provided MP client hooks.
 *
 * Wire it up in `createFacilitator` like:
 *
 *     const mpProvider = createMercadoPagoPaymentProvider({
 *       createPreference: (p) => mpClient.preferences.create({ body: p }),
 *       lookupPayment: (id) => mpClient.payments.get({ id }),
 *     });
 *     createFacilitator({
 *       paymentProviders: { [mpProvider.handlerId]: mpProvider },
 *       paymentHandlers: [mercadoPagoPaymentHandler({ id: mpProvider.handlerId })],
 *       ...
 *     });
 */
export function createMercadoPagoPaymentProvider(
  options: MercadoPagoProviderOptions,
): PaymentProvider {
  const handlerId = options.handlerId ?? DEFAULT_HANDLER_ID;
  const currencyToMp = options.currencyToMp ?? defaultCurrencyToMp;
  const minorToMajor = options.minorToMajor ?? defaultMinorToMajor;
  const acceptable = options.acceptableStatuses ?? DEFAULT_ACCEPTABLE;
  const sandbox = options.sandbox ?? false;

  return {
    handlerId,

    async onSessionCreated(session: CheckoutSession) {
      const payload = sessionToPreferencePayload(session, {
        currencyToMp,
        minorToMajor,
      });
      const preference = await options.createPreference(payload);
      const checkoutUrl = sandbox
        ? preference.sandbox_init_point
        : preference.init_point;
      return {
        metadata: {
          mp_preference_id: preference.id,
          ...(checkoutUrl !== undefined ? { mp_checkout_url: checkoutUrl } : {}),
          ...(preference.expiration_date_to !== undefined
            ? { mp_expires_at: preference.expiration_date_to }
            : {}),
        },
      };
    },

    async processPayment(args): Promise<PaymentResult> {
      const credential = args.paymentData.instrument?.credential;
      if (!credential) {
        return {
          success: false,
          code: "invalid_payment_token",
          message: "PaymentData.instrument.credential is required.",
        };
      }
      // Accept either our ACP-side credential type or the raw MP id
      // ("mp_payment_id" is the canonical type for this adapter).
      const paymentId = credential.token;
      if (!paymentId) {
        return {
          success: false,
          code: "invalid_payment_token",
          message: "PaymentData.instrument.credential.token is required.",
        };
      }

      const payment = await options.lookupPayment(paymentId);
      if (!payment) {
        return {
          success: false,
          code: "invalid_payment_token",
          message: `MercadoPago payment '${paymentId}' not found.`,
        };
      }

      // Reconcile against the session.
      const expectedCurrency = currencyToMp(args.session.currency);
      if (payment.currency_id !== expectedCurrency) {
        return {
          success: false,
          code: "validation_failed",
          message: `MP payment currency '${payment.currency_id}' does not match session currency '${expectedCurrency}'.`,
          details: { mp_payment_id: paymentId },
        };
      }

      const expectedTotalMinor =
        args.session.totals.find((t) => t.type === "total")?.amount ?? 0;
      const expectedTotalMajor = minorToMajor(
        expectedTotalMinor,
        args.session.currency,
      );
      // Tolerate float imprecision (1 minor unit).
      const tolerance = 1 / defaultDivisor(args.session.currency);
      if (Math.abs(payment.transaction_amount - expectedTotalMajor) > tolerance) {
        return {
          success: false,
          code: "validation_failed",
          message: `MP payment amount ${payment.transaction_amount} does not match session total ${expectedTotalMajor}.`,
          details: { mp_payment_id: paymentId },
        };
      }

      // The preference is created with `external_reference: session.id`, so MP
      // echoes it on the payment. Require the binding: if it is absent we cannot
      // prove the payment belongs to this session, so reject rather than accept
      // an unbound payment (which would let a payment for one session settle
      // another). Only an exact match passes.
      if (payment.external_reference !== args.session.id) {
        return {
          success: false,
          code: "validation_failed",
          message:
            payment.external_reference === undefined
              ? `MP payment is missing external_reference; cannot bind it to session id '${args.session.id}'.`
              : `MP payment external_reference '${payment.external_reference}' does not match session id '${args.session.id}'.`,
          details: { mp_payment_id: paymentId },
        };
      }

      if (!acceptable.includes(payment.status)) {
        return {
          success: false,
          code: "payment_declined",
          message: `MP payment status '${payment.status}' is not acceptable.`,
          details: {
            mp_payment_id: paymentId,
            status: payment.status,
            ...(payment.status_detail !== undefined
              ? { status_detail: payment.status_detail }
              : {}),
          },
        };
      }

      return {
        success: true,
        paymentId: String(payment.id),
        metadata: {
          mp_payment_id: String(payment.id),
          mp_status: payment.status,
          ...(payment.status_detail !== undefined
            ? { mp_status_detail: payment.status_detail }
            : {}),
        },
      };
    },
  };
}

/**
 * Translate an ACP `CheckoutSession` into the MP preference-create payload
 * the host calls into. Exported so hosts can call this directly if they need
 * to inject extra fields (e.g. `payment_methods.installments`,
 * `back_urls.success`).
 */
export function sessionToPreferencePayload(
  session: CheckoutSession,
  config: {
    currencyToMp?: (acpCurrency: string) => string;
    minorToMajor?: (amountMinor: number, acpCurrency: string) => number;
  } = {},
): MpPreferenceCreatePayload {
  const currencyToMp = config.currencyToMp ?? defaultCurrencyToMp;
  const minorToMajor = config.minorToMajor ?? defaultMinorToMajor;
  const items: MpPreferenceCreatePayload["items"] = session.line_items.map(
    (li) => buildPreferenceItem(li, session.currency, currencyToMp, minorToMajor),
  );

  const payload: MpPreferenceCreatePayload = {
    external_reference: session.id,
    items,
  };
  if (session.buyer?.email) {
    payload.payer = {
      email: session.buyer.email,
      ...(session.buyer.first_name !== undefined
        ? { name: session.buyer.first_name }
        : {}),
      ...(session.buyer.last_name !== undefined
        ? { surname: session.buyer.last_name }
        : {}),
    };
  }
  if (session.metadata) {
    payload.metadata = { ...session.metadata, acp_session_id: session.id };
  } else {
    payload.metadata = { acp_session_id: session.id };
  }
  return payload;
}

function buildPreferenceItem(
  li: LineItem,
  currency: string,
  currencyToMp: (c: string) => string,
  minorToMajor: (amount: number, c: string) => number,
): MpPreferenceCreatePayload["items"][number] {
  const unitMinor = li.unit_amount ?? li.item.unit_amount ?? 0;
  return {
    id: li.id,
    title: li.name ?? li.item.name ?? li.id,
    ...(li.description !== undefined ? { description: li.description } : {}),
    ...(li.images?.[0] !== undefined ? { picture_url: li.images[0] } : {}),
    quantity: li.quantity,
    unit_price: minorToMajor(unitMinor, currency),
    currency_id: currencyToMp(currency),
  };
}

/**
 * Build the agent-facing `PaymentHandler` declaration matching this provider.
 * Pass the result into `paymentHandlers` of `createFacilitator`.
 */
export function mercadoPagoPaymentHandler(opts: {
  id?: string;
  configSchemaUrl?: string;
  instrumentSchemaUrl?: string;
  /** Live or test API context. */
  environment?: "production" | "test";
}): {
  id: string;
  name: string;
  display_name: string;
  version: string;
  spec: string;
  requires_delegate_payment: boolean;
  requires_pci_compliance: boolean;
  psp: string;
  config_schema: string;
  instrument_schemas: string[];
  config: Record<string, unknown>;
  display_order: number;
} {
  const id = opts.id ?? DEFAULT_HANDLER_ID;
  return {
    id,
    name: "ar.acp.mercadopago.preference",
    display_name: "MercadoPago",
    version: "2026-04-17",
    spec: "https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge/docs/mercadopago.md",
    requires_delegate_payment: false,
    requires_pci_compliance: false,
    psp: "mercadopago",
    config_schema:
      opts.configSchemaUrl ??
      "https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge/schemas/mp-config.json",
    instrument_schemas: [
      opts.instrumentSchemaUrl ??
        "https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge/schemas/mp-payment-id.json",
    ],
    config: {
      environment: opts.environment ?? "production",
      flow: "preference",
    },
    display_order: 1,
  };
}
