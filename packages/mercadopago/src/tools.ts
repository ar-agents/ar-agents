import { createHash } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { MercadoPagoClient } from "./client";
import type { SubscriptionStateAdapter } from "./state";

/**
 * Deterministic idempotency key from caller-meaningful fields. Safe to retry:
 * the SAME inputs always produce the same key, so MP dedupes on its side
 * even if the client retries multiple times. Use a hash to keep keys short
 * + opaque (callers can't accidentally extract sensitive data from the key).
 */
function deterministicIdempotencyKey(...parts: Array<string | number | undefined>): string {
  const payload = parts
    .filter((p) => p !== undefined && p !== null)
    .map(String)
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

export interface MercadoPagoToolsOptions {
  /** State adapter for persisting subscription records. */
  state: SubscriptionStateAdapter;
  /**
   * Default back_url used when callers don't supply one. MUST be HTTPS — MP
   * rejects http:// and localhost back URLs even in sandbox.
   */
  backUrl: string;
  /**
   * Optionally override the agent-facing tool descriptions. Pass an object
   * with keys matching tool names; values replace the default description.
   * Useful for localizing the agent's tool reasoning.
   */
  descriptions?: Partial<Record<ToolName, string>>;
  /**
   * Default notification webhook URL used when callers don't supply one.
   * Optional — MP falls back to dashboard config if not set.
   */
  notificationUrl?: string;
}

type ToolName =
  // Subscriptions (v0.1)
  | "create_subscription"
  | "get_subscription_status"
  | "cancel_subscription"
  | "pause_subscription"
  | "resume_subscription"
  // Payments (v0.2)
  | "create_payment"
  | "get_payment"
  | "search_payments"
  | "cancel_payment"
  | "capture_payment"
  // Refunds (v0.2)
  | "refund_payment"
  | "list_refunds"
  // Checkout Pro (v0.2)
  | "create_payment_preference"
  | "get_payment_preference"
  // Customers + Cards (v0.2)
  | "create_customer"
  | "find_customer_by_email"
  | "list_customer_cards"
  | "delete_customer_card"
  // Payment Methods + Installments (v0.2)
  | "list_payment_methods"
  | "calculate_installments"
  // Account (v0.2)
  | "get_account_info"
  // Saved-card charging (v0.3)
  | "charge_saved_card"
  // QR in-store (v0.3)
  | "create_qr_payment"
  | "cancel_qr_payment";

const DEFAULT_DESCRIPTIONS: Record<ToolName, string> = {
  // ── Subscriptions ────────────────────────────────────────────────────────
  create_subscription:
    "Create a Mercado Pago recurring subscription. Returns an init_point URL where the customer must complete the FIRST payment with their card and CVV (this is a hard MP requirement; agents cannot bypass it). After they pay, MP will auto-charge at the configured frequency without further intervention.",
  get_subscription_status:
    "Check the current status of a Mercado Pago subscription. Use this to confirm the customer completed the first payment (status becomes 'authorized') or to inspect the next charge date.",
  cancel_subscription:
    "Cancel an active Mercado Pago subscription. After cancellation, MP will not charge the customer again. This action is irreversible — confirm with the user before calling.",
  pause_subscription:
    "Pause an authorized Mercado Pago subscription. Charges stop until resumed. Only works on subscriptions in 'authorized' status.",
  resume_subscription:
    "Resume a paused Mercado Pago subscription. Charges resume on the next scheduled date. Only works on subscriptions in 'paused' status.",

  // ── Payments ─────────────────────────────────────────────────────────────
  create_payment:
    "Create a one-time payment. Two flows: (a) with a card token from MP frontend Cardform — for transparent checkout; (b) without token, for non-card methods like 'account_money', 'rapipago', 'pagofacil'. For most agent flows where you only have a payer email and want to send them a payment link, use create_payment_preference instead (Checkout Pro hosted form). Returns the Payment object with status — typically 'approved' for account_money and 'pending' for tickets.",
  get_payment:
    "Fetch a single payment by ID. Use to confirm status after webhook arrives, or to inspect details (status_detail explains rejections).",
  search_payments:
    "Search payments with filters. Most common: by external_reference (your-system identifier) to find all payments for an order, or by status='approved' to list successful charges in a date range. Returns paginated results.",
  cancel_payment:
    "Cancel a pending or in_process payment (only works before approval). Once approved, use refund_payment instead. Common use: cancel an unpaid ticket payment that's still pending.",
  capture_payment:
    "Capture an authorized credit-card payment that was created with capture=false. Use for hold-then-capture flows (e.g., authorize on order, capture on shipment). Optional partial amount.",

  // ── Refunds ──────────────────────────────────────────────────────────────
  refund_payment:
    "Refund an approved payment. Pass amount for partial refund; omit for full refund. Idempotency key is auto-generated based on paymentId+amount to prevent double-refunds on retries.",
  list_refunds:
    "List all refunds for a given payment. Returns array of Refund objects. Useful to confirm a refund was processed or to inspect partial-refund history.",

  // ── Checkout Pro ─────────────────────────────────────────────────────────
  create_payment_preference:
    "Create a Mercado Pago Checkout Pro preference and get back a payment URL (init_point) to send to the customer. THIS is the recommended way for an agent to take a payment when you only have a payer email — the buyer enters card data on MP's hosted form (no PCI scope needed). Supports cuotas configuration, payment method exclusions, back URLs after success/failure/pending. In sandbox, use sandbox_init_point from the response.",
  get_payment_preference:
    "Fetch a Checkout Pro preference by ID. Returns the preference config and current init_point URLs. Use to inspect a previously-created link.",

  // ── Customers + Cards ────────────────────────────────────────────────────
  create_customer:
    "Create a Mercado Pago customer record so the buyer can save cards for future charges. Idempotent on email — if a customer with that email exists, MP returns it instead of creating a duplicate. Use find_customer_by_email first if you're unsure.",
  find_customer_by_email:
    "Find an existing customer by email address. Returns the customer object if found, or null. Use before create_customer to avoid duplicate records.",
  list_customer_cards:
    "List the saved cards for a customer. Returns array with last 4 digits, expiration, payment method (visa, master, naranja, etc.). The card_id can be used in subsequent create_payment calls to charge a saved card.",
  delete_customer_card:
    "Delete a saved card from a customer. Common use: customer requests removal, or expired card cleanup. Irreversible.",

  // ── Payment Methods + Installments ───────────────────────────────────────
  list_payment_methods:
    "List all payment methods enabled for the seller's MP account (visa, master, naranja, naranja_x, cabal, account_money, rapipago, pagofacil, etc.). Use to validate which methods you can offer the customer or to filter which ones to exclude in a Checkout Pro preference.",
  calculate_installments:
    "Calculate cuotas (installments) options for a given amount. THE killer Argentine feature — returns options like '12 cuotas sin interés de $X' (recommended_message field) which you should surface VERBATIM to the user. Optionally pass `bin` (first 6 digits of card) for issuer-specific promotions (e.g., Naranja's interest-free deals). Use before create_payment to let the user pick installments knowingly.",

  // ── Account ──────────────────────────────────────────────────────────────
  get_account_info:
    "Get info about the Mercado Pago account that owns the access token: site_id (MLA=Argentina), country_id, user_type (registered, partial, etc.). Useful to verify the agent is connected to the right account before taking actions.",

  // ── Saved-card charging (v0.3) ───────────────────────────────────────────
  charge_saved_card:
    "Charge a previously-saved card for a returning customer. Requires customer_id + card_id (from list_customer_cards) AND a fresh CVV the user provides this session. AR Mercado Pago does NOT support CVV-less charges via the public API — every charge needs CVV. Idempotent on (card_id, amount, external_reference): retries dedupe automatically. Returns the resulting Payment.",

  // ── QR in-store (v0.3) ───────────────────────────────────────────────────
  create_qr_payment:
    "Generate a dynamic in-store QR for a buyer to scan with any AR wallet (Modo, BNA+, Cuenta DNI, Naranja X, Mercado Pago, etc. — interop is mandated by Transferencias 3.0). Requires a pre-configured POS external_id (one-time setup in MP dashboard). Returns the qr_data string + a base64 PNG data URL ready to display. The QR expires in `expires_in_seconds` (default 600). MP fires `point_integration_wh` then `payment` webhooks when scanned.",
  cancel_qr_payment:
    "Cancel a pending QR order on a POS. Necessary if the buyer never scans — otherwise the next create_qr_payment on the same POS returns 409.",
};

/**
 * Build a tool set for the Vercel AI SDK that exposes Mercado Pago to an
 * agent. Pass directly to `Experimental_Agent`'s `tools` option, or merge with
 * other tool sets.
 *
 * @example
 * ```ts
 * import { Experimental_Agent as Agent, stepCountIs } from 'ai';
 * import { MercadoPagoClient, mercadoPagoTools, InMemoryStateAdapter } from '@ar-agents/mercadopago';
 *
 * const mp = new MercadoPagoClient({ accessToken: process.env.MP_ACCESS_TOKEN! });
 * const agent = new Agent({
 *   model: 'anthropic/claude-sonnet-4-6',
 *   tools: mercadoPagoTools(mp, {
 *     state: new InMemoryStateAdapter(),
 *     backUrl: 'https://mysite.com/done',
 *   }),
 *   stopWhen: stepCountIs(8),
 * });
 * ```
 */
export function mercadoPagoTools(
  client: MercadoPagoClient,
  options: MercadoPagoToolsOptions,
): ToolSet {
  const desc = (name: ToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    // ─────────────────────────────────────────────────────────────────────────
    // Subscriptions (v0.1 — kept identical for backward compatibility)
    // ─────────────────────────────────────────────────────────────────────────

    create_subscription: tool({
      description: desc("create_subscription"),
      inputSchema: z.object({
        customer_email: z.string().email().describe("Email of the customer who will be charged"),
        amount_ars: z.number().positive().describe("Amount in Argentine Pesos per recurring charge"),
        frequency_months: z.number().int().positive().max(12).describe("Frequency in months (1=monthly, 3=quarterly, 12=yearly)"),
        reason: z.string().min(3).max(120).describe("Short description shown to the customer at checkout"),
        external_reference: z.string().optional().describe("Optional id from your system to track this subscription"),
      }),
      execute: async ({ customer_email, amount_ars, frequency_months, reason, external_reference }) => {
        const created = await client.createPreapproval({
          reason,
          payerEmail: customer_email,
          amount: amount_ars,
          currency: "ARS",
          frequency: frequency_months,
          frequencyType: "months",
          backUrl: options.backUrl,
          ...(external_reference !== undefined ? { externalReference: external_reference } : {}),
        });
        await options.state.set(created.id, {
          status: created.status,
          payerEmail: customer_email,
          amount: amount_ars,
          currency: "ARS",
          frequency: frequency_months,
          frequencyType: "months",
          initPoint: created.init_point,
          ...(external_reference !== undefined ? { externalReference: external_reference } : {}),
          createdAt: new Date().toISOString(),
        });
        return {
          subscription_id: created.id,
          status: created.status,
          init_point_url: created.init_point,
          next_step:
            "Send init_point_url to the customer. They must complete the first payment with card+CVV. Use get_subscription_status to confirm activation after they pay.",
        };
      },
    }),

    get_subscription_status: tool({
      description: desc("get_subscription_status"),
      inputSchema: z.object({
        subscription_id: z.string().describe("The Mercado Pago subscription/preapproval ID"),
      }),
      execute: async ({ subscription_id }) => {
        const fresh = await client.getPreapproval(subscription_id);
        const cached = await options.state.get(subscription_id);
        return {
          subscription_id: fresh.id,
          status: fresh.status,
          payer_email: fresh.payer_email,
          amount: fresh.auto_recurring.transaction_amount,
          currency: fresh.auto_recurring.currency_id,
          next_payment_date: fresh.next_payment_date ?? null,
          last_webhook_status: cached?.lastWebhookStatus ?? null,
          last_webhook_at: cached?.lastWebhookAt ?? null,
        };
      },
    }),

    cancel_subscription: tool({
      description: desc("cancel_subscription"),
      inputSchema: z.object({
        subscription_id: z.string().describe("The Mercado Pago subscription/preapproval ID to cancel"),
      }),
      execute: async ({ subscription_id }) => {
        const cancelled = await client.cancelPreapproval(subscription_id);
        await options.state.set(subscription_id, {
          status: cancelled.status,
          cancelledAt: new Date().toISOString(),
        });
        return {
          subscription_id: cancelled.id,
          status: cancelled.status,
          message: "Subscription cancelled. No further charges will occur.",
        };
      },
    }),

    pause_subscription: tool({
      description: desc("pause_subscription"),
      inputSchema: z.object({ subscription_id: z.string() }),
      execute: async ({ subscription_id }) => {
        const paused = await client.pausePreapproval(subscription_id);
        await options.state.set(subscription_id, { status: paused.status });
        return {
          subscription_id: paused.id,
          status: paused.status,
          message: "Subscription paused. Use resume_subscription to reactivate.",
        };
      },
    }),

    resume_subscription: tool({
      description: desc("resume_subscription"),
      inputSchema: z.object({ subscription_id: z.string() }),
      execute: async ({ subscription_id }) => {
        const resumed = await client.resumePreapproval(subscription_id);
        await options.state.set(subscription_id, { status: resumed.status });
        return {
          subscription_id: resumed.id,
          status: resumed.status,
          message: "Subscription resumed. Charges will continue on next scheduled date.",
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Payments (v0.2)
    // ─────────────────────────────────────────────────────────────────────────

    create_payment: tool({
      description: desc("create_payment"),
      inputSchema: z.object({
        amount_ars: z.number().positive().describe("Amount in ARS"),
        payment_method_id: z.string().describe("MP payment method id (e.g. 'account_money', 'rapipago', 'visa', 'master', 'naranja')"),
        payer_email: z.string().email().describe("Email of the payer. Cannot equal seller email."),
        token: z.string().optional().describe("Card token from MP frontend Cardform. Required for credit/debit; omit for cash/account_money."),
        installments: z.number().int().min(1).max(24).optional().describe("Number of installments (cuotas). Default 1. Use calculate_installments first to see options."),
        description: z.string().max(255).optional().describe("Short description"),
        external_reference: z.string().optional().describe("Your-system identifier"),
        identification: z.object({
          type: z.enum(["DNI", "CUIT", "CUIL"]),
          number: z.string(),
        }).optional().describe("Payer identification — required for some payment types in AR"),
        statement_descriptor: z.string().max(13).optional().describe("Shows on buyer's card statement (max 13 chars)"),
      }),
      execute: async (input) => {
        const payment = await client.createPayment({
          transactionAmount: input.amount_ars,
          paymentMethodId: input.payment_method_id,
          payerEmail: input.payer_email,
          ...(input.token !== undefined ? { token: input.token } : {}),
          ...(input.installments !== undefined ? { installments: input.installments } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
          ...(input.identification !== undefined ? { identification: input.identification } : {}),
          ...(input.statement_descriptor !== undefined ? { statementDescriptor: input.statement_descriptor } : {}),
          ...(options.notificationUrl !== undefined ? { notificationUrl: options.notificationUrl } : {}),
          // Deterministic idempotency key — safe to retry, same inputs always
          // produce the same key (MP dedupes on its side).
          idempotencyKey: deterministicIdempotencyKey(
            "create_payment",
            input.external_reference ?? input.payer_email,
            input.amount_ars,
            input.payment_method_id,
            input.token,
          ),
        });
        return {
          payment_id: payment.id,
          status: payment.status,
          status_detail: payment.status_detail,
          amount: payment.transaction_amount,
          currency: payment.currency_id,
          installments: payment.installments,
          payment_method: payment.payment_method_id,
          payer_email: payment.payer?.email ?? null,
          external_reference: payment.external_reference,
          date_created: payment.date_created,
          date_approved: payment.date_approved,
        };
      },
    }),

    get_payment: tool({
      description: desc("get_payment"),
      inputSchema: z.object({
        payment_id: z.string().describe("The MP payment ID"),
      }),
      execute: async ({ payment_id }) => {
        const p = await client.getPayment(payment_id);
        return {
          payment_id: p.id,
          status: p.status,
          status_detail: p.status_detail,
          amount: p.transaction_amount,
          currency: p.currency_id,
          payment_method: p.payment_method_id,
          installments: p.installments,
          payer_email: p.payer?.email ?? null,
          external_reference: p.external_reference,
          date_created: p.date_created,
          date_approved: p.date_approved,
          net_received: p.transaction_details?.net_received_amount ?? null,
        };
      },
    }),

    search_payments: tool({
      description: desc("search_payments"),
      inputSchema: z.object({
        external_reference: z.string().optional(),
        status: z.string().optional().describe("'approved' | 'pending' | 'rejected' | 'cancelled' | 'refunded' etc."),
        payer_email: z.string().optional(),
        begin_date: z.string().optional().describe("ISO 8601, e.g. 2026-01-01T00:00:00Z"),
        end_date: z.string().optional().describe("ISO 8601"),
        limit: z.number().int().min(1).max(100).optional().describe("Default 30, max 100"),
        offset: z.number().int().min(0).optional().describe("Pagination offset (default 0)"),
      }),
      execute: async (input) => {
        const result = await client.searchPayments({
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.payer_email !== undefined ? { payerEmail: input.payer_email } : {}),
          ...(input.begin_date !== undefined ? { beginDate: input.begin_date } : {}),
          ...(input.end_date !== undefined ? { endDate: input.end_date } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
          ...(input.offset !== undefined ? { offset: input.offset } : {}),
        });
        return {
          total: result.paging.total,
          returned: result.results.length,
          offset: result.paging.offset,
          payments: result.results.map((p) => ({
            payment_id: p.id,
            status: p.status,
            amount: p.transaction_amount,
            currency: p.currency_id,
            payer_email: p.payer?.email ?? null,
            external_reference: p.external_reference,
            date_created: p.date_created,
          })),
        };
      },
    }),

    cancel_payment: tool({
      description: desc("cancel_payment"),
      inputSchema: z.object({ payment_id: z.string() }),
      execute: async ({ payment_id }) => {
        const cancelled = await client.cancelPayment(payment_id);
        return {
          payment_id: cancelled.id,
          status: cancelled.status,
          message: "Payment cancelled. If it was already approved, use refund_payment instead.",
        };
      },
    }),

    capture_payment: tool({
      description: desc("capture_payment"),
      inputSchema: z.object({
        payment_id: z.string(),
        amount_ars: z.number().positive().optional().describe("Optional partial-capture amount. Omit to capture full authorized amount."),
      }),
      execute: async ({ payment_id, amount_ars }) => {
        const captured = await client.capturePayment(payment_id, amount_ars);
        return {
          payment_id: captured.id,
          status: captured.status,
          amount: captured.transaction_amount,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Refunds
    // ─────────────────────────────────────────────────────────────────────────

    refund_payment: tool({
      description: desc("refund_payment"),
      inputSchema: z.object({
        payment_id: z.string(),
        amount_ars: z.number().positive().optional().describe("Partial-refund amount in ARS. Omit for full refund."),
      }),
      execute: async ({ payment_id, amount_ars }) => {
        const refund = await client.createRefund({
          paymentId: payment_id,
          ...(amount_ars !== undefined ? { amount: amount_ars } : {}),
          idempotencyKey: deterministicIdempotencyKey("refund", payment_id, amount_ars ?? "full"),
        });
        return {
          refund_id: refund.id,
          payment_id: refund.payment_id,
          amount: refund.amount,
          status: refund.status,
          message:
            amount_ars === undefined
              ? "Full refund issued. Funds return to the buyer in 3-10 business days."
              : `Partial refund of ${amount_ars} ARS issued.`,
        };
      },
    }),

    list_refunds: tool({
      description: desc("list_refunds"),
      inputSchema: z.object({ payment_id: z.string() }),
      execute: async ({ payment_id }) => {
        const refunds = await client.listRefunds(payment_id);
        return {
          payment_id,
          count: refunds.length,
          refunds: refunds.map((r) => ({
            refund_id: r.id,
            amount: r.amount,
            status: r.status,
            date_created: r.date_created,
          })),
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Checkout Pro
    // ─────────────────────────────────────────────────────────────────────────

    create_payment_preference: tool({
      description: desc("create_payment_preference"),
      inputSchema: z.object({
        items: z.array(z.object({
          title: z.string().min(1).max(256),
          quantity: z.number().int().positive(),
          unit_price: z.number().positive(),
          description: z.string().optional(),
          picture_url: z.string().url().optional(),
        })).min(1).describe("Items being charged. At least one required."),
        payer_email: z.string().email().optional().describe("Pre-fill the payer email on Checkout Pro form"),
        external_reference: z.string().optional(),
        max_installments: z.number().int().min(1).max(24).optional().describe("Limit max cuotas offered. Defaults to MP account config."),
        statement_descriptor: z.string().max(13).optional(),
        excluded_payment_types: z.array(z.enum(["credit_card", "debit_card", "ticket", "atm", "bank_transfer"])).optional().describe("Block payment types — e.g., ['ticket'] to disable Rapipago/Pago Fácil"),
      }),
      execute: async (input) => {
        const pref = await client.createPreference({
          items: input.items.map((it) => ({
            title: it.title,
            quantity: it.quantity,
            unit_price: it.unit_price,
            currency_id: "ARS",
            ...(it.description !== undefined ? { description: it.description } : {}),
            ...(it.picture_url !== undefined ? { picture_url: it.picture_url } : {}),
          })),
          ...(input.payer_email !== undefined ? { payer: { email: input.payer_email } } : {}),
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
          ...(input.statement_descriptor !== undefined ? { statementDescriptor: input.statement_descriptor } : {}),
          backUrls: { success: options.backUrl, failure: options.backUrl, pending: options.backUrl },
          autoReturn: "approved",
          ...(options.notificationUrl !== undefined ? { notificationUrl: options.notificationUrl } : {}),
          ...((input.max_installments !== undefined || input.excluded_payment_types !== undefined)
            ? {
                paymentMethods: {
                  ...(input.max_installments !== undefined ? { installments: input.max_installments } : {}),
                  ...(input.excluded_payment_types !== undefined
                    ? { excluded_payment_types: input.excluded_payment_types.map((id) => ({ id })) }
                    : {}),
                },
              }
            : {}),
        });
        return {
          preference_id: pref.id,
          init_point_url: pref.init_point ?? null,
          sandbox_init_point_url: pref.sandbox_init_point ?? null,
          external_reference: pref.external_reference,
          date_created: pref.date_created,
          next_step:
            "Send init_point_url (or sandbox_init_point_url in sandbox) to the customer. After they pay, MP fires a webhook with the payment_id; use get_payment to confirm status.",
        };
      },
    }),

    get_payment_preference: tool({
      description: desc("get_payment_preference"),
      inputSchema: z.object({ preference_id: z.string() }),
      execute: async ({ preference_id }) => {
        const pref = await client.getPreference(preference_id);
        return {
          preference_id: pref.id,
          init_point_url: pref.init_point ?? null,
          sandbox_init_point_url: pref.sandbox_init_point ?? null,
          external_reference: pref.external_reference,
          items: pref.items,
          date_created: pref.date_created,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Customers + Saved Cards
    // ─────────────────────────────────────────────────────────────────────────

    create_customer: tool({
      description: desc("create_customer"),
      inputSchema: z.object({
        email: z.string().email(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        identification: z.object({
          type: z.enum(["DNI", "CUIT", "CUIL"]),
          number: z.string(),
        }).optional(),
        description: z.string().optional(),
      }),
      execute: async (input) => {
        const customer = await client.createCustomer({
          email: input.email,
          ...(input.first_name !== undefined ? { firstName: input.first_name } : {}),
          ...(input.last_name !== undefined ? { lastName: input.last_name } : {}),
          ...(input.identification !== undefined ? { identification: input.identification } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
        });
        return {
          customer_id: customer.id,
          email: customer.email,
          first_name: customer.first_name,
          last_name: customer.last_name,
          date_created: customer.date_created,
        };
      },
    }),

    find_customer_by_email: tool({
      description: desc("find_customer_by_email"),
      inputSchema: z.object({ email: z.string().email() }),
      execute: async ({ email }) => {
        const result = await client.searchCustomers({ email, limit: 1 });
        const customer = result.results[0] ?? null;
        return customer
          ? {
              found: true,
              customer_id: customer.id,
              email: customer.email,
              first_name: customer.first_name,
              last_name: customer.last_name,
            }
          : { found: false, customer_id: null };
      },
    }),

    list_customer_cards: tool({
      description: desc("list_customer_cards"),
      inputSchema: z.object({ customer_id: z.string() }),
      execute: async ({ customer_id }) => {
        const cards = await client.listCustomerCards(customer_id);
        return {
          customer_id,
          count: cards.length,
          cards: cards.map((c) => ({
            card_id: c.id,
            last_four_digits: c.last_four_digits,
            expiration_month: c.expiration_month,
            expiration_year: c.expiration_year,
            payment_method: c.payment_method?.id ?? null,
            payment_method_name: c.payment_method?.name ?? null,
          })),
        };
      },
    }),

    delete_customer_card: tool({
      description: desc("delete_customer_card"),
      inputSchema: z.object({
        customer_id: z.string(),
        card_id: z.string(),
      }),
      execute: async ({ customer_id, card_id }) => {
        await client.deleteCustomerCard(customer_id, card_id);
        return { customer_id, card_id, deleted: true };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Payment Methods + Installments
    // ─────────────────────────────────────────────────────────────────────────

    list_payment_methods: tool({
      description: desc("list_payment_methods"),
      inputSchema: z.object({}),
      execute: async () => {
        const methods = await client.listPaymentMethods();
        return {
          count: methods.length,
          methods: methods.map((m) => ({
            id: m.id,
            name: m.name,
            payment_type: m.payment_type_id,
            status: m.status,
            min_amount: m.min_allowed_amount,
            max_amount: m.max_allowed_amount,
          })),
        };
      },
    }),

    calculate_installments: tool({
      description: desc("calculate_installments"),
      inputSchema: z.object({
        amount_ars: z.number().positive(),
        payment_method_id: z.string().optional().describe("E.g. 'visa', 'master', 'naranja'. Omit for all available methods."),
        bin: z.string().min(6).max(8).optional().describe("First 6-8 digits of card for issuer-specific offers (e.g., Naranja interest-free promotions)"),
      }),
      execute: async (input) => {
        const offers = await client.getInstallments({
          amount: input.amount_ars,
          ...(input.payment_method_id !== undefined ? { paymentMethodId: input.payment_method_id } : {}),
          ...(input.bin !== undefined ? { bin: input.bin } : {}),
        });
        return {
          amount: input.amount_ars,
          offers: offers.map((o) => ({
            payment_method_id: o.payment_method_id,
            payment_type_id: o.payment_type_id,
            issuer_name: o.issuer?.name ?? null,
            options: o.payer_costs.map((pc) => ({
              installments: pc.installments,
              installment_amount: pc.installment_amount,
              total_amount: pc.total_amount,
              installment_rate: pc.installment_rate,
              recommended_message: pc.recommended_message,
            })),
          })),
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Account
    // ─────────────────────────────────────────────────────────────────────────

    get_account_info: tool({
      description: desc("get_account_info"),
      inputSchema: z.object({}),
      execute: async () => {
        const me = await client.getMe();
        return {
          account_id: me.id,
          email: me.email,
          nickname: me.nickname,
          country_id: me.country_id,
          site_id: me.site_id,
          user_type: me.user_type,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Saved-card charging (v0.3)
    // ─────────────────────────────────────────────────────────────────────────

    charge_saved_card: tool({
      description: desc("charge_saved_card"),
      inputSchema: z.object({
        customer_id: z.string().describe("MP customer id (from create_customer / find_customer_by_email)"),
        card_id: z.string().describe("Saved card id (from list_customer_cards)"),
        security_code: z.string().regex(/^\d{3,4}$/).describe("CVV — 3 digits (Visa/Master) or 4 (Amex). User must provide this each charge in AR."),
        amount_ars: z.number().positive(),
        description: z.string().min(1).max(255),
        installments: z.number().int().min(1).max(24).optional().describe("Default 1. Use calculate_installments first to pick a valid count."),
        external_reference: z.string().optional(),
        statement_descriptor: z.string().max(13).optional(),
      }),
      execute: async (input) => {
        const payment = await client.chargeSavedCard({
          customerId: input.customer_id,
          cardId: input.card_id,
          securityCode: input.security_code,
          amount: input.amount_ars,
          description: input.description,
          ...(input.installments !== undefined ? { installments: input.installments } : {}),
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
          ...(input.statement_descriptor !== undefined ? { statementDescriptor: input.statement_descriptor } : {}),
          idempotencyKey: deterministicIdempotencyKey(
            "charge_saved_card",
            input.card_id,
            input.amount_ars,
            input.external_reference,
          ),
        });
        return {
          payment_id: payment.id,
          status: payment.status,
          status_detail: payment.status_detail,
          amount: payment.transaction_amount,
          installments: payment.installments,
          payment_method: payment.payment_method_id,
          customer_id: input.customer_id,
          card_id: input.card_id,
          external_reference: payment.external_reference,
          date_approved: payment.date_approved,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // QR in-store (v0.3)
    // ─────────────────────────────────────────────────────────────────────────

    create_qr_payment: tool({
      description: desc("create_qr_payment"),
      inputSchema: z.object({
        external_pos_id: z.string().describe("Pre-configured POS external_id from MP dashboard. Required."),
        amount_ars: z.number().positive(),
        title: z.string().min(1).max(80).describe("Display title shown when scanning"),
        description: z.string().max(255).optional(),
        external_reference: z.string().optional(),
        notification_url: z.string().url().optional().describe("Webhook URL — falls back to dashboard config if omitted"),
        expires_in_seconds: z.number().int().min(60).max(3600).optional().describe("Default 600 (10 min)"),
      }),
      execute: async (input) => {
        // Lazy-load qrcode to keep cold-start lean for users who don't use QR
        const QRCode = (await import("qrcode")).default;
        const me = await client.getMe();
        const userId = String(me.id);
        const expiresAt = new Date(
          Date.now() + (input.expires_in_seconds ?? 600) * 1000,
        ).toISOString();

        const qr = await client.createQrPayment(userId, {
          externalPosId: input.external_pos_id,
          totalAmount: input.amount_ars,
          title: input.title,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
          ...(input.notification_url !== undefined ? { notificationUrl: input.notification_url } : {}),
          expirationDate: expiresAt,
        });

        const qrDataUrl = await QRCode.toDataURL(qr.qr_data, {
          errorCorrectionLevel: "M",
          margin: 1,
          width: 512,
        });

        return {
          in_store_order_id: qr.in_store_order_id,
          qr_data: qr.qr_data,
          qr_data_url: qrDataUrl,
          expires_at: expiresAt,
          external_pos_id: input.external_pos_id,
          amount: input.amount_ars,
          next_step:
            "Display the qr_data_url image to the buyer. Wait for the payment webhook (point_integration_wh fires first, then payment topic). If buyer doesn't scan in time, call cancel_qr_payment to free the POS.",
        };
      },
    }),

    cancel_qr_payment: tool({
      description: desc("cancel_qr_payment"),
      inputSchema: z.object({
        external_pos_id: z.string(),
      }),
      execute: async ({ external_pos_id }) => {
        const me = await client.getMe();
        await client.cancelQrPayment(String(me.id), external_pos_id);
        return { external_pos_id, cancelled: true };
      },
    }),
  } satisfies ToolSet;
}
