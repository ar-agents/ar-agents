import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { MercadoPagoClient } from "./client";
import { sha256Hex } from "./crypto";
import {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  refreshAccessToken,
} from "./oauth";
import { findApplicablePromos } from "./ar-issuer-promos";
import { computeMarketplaceFee, explainPaymentStatus } from "./helpers";
import { collect, paginatePayments, paginateSettlements } from "./pagination";
import type { SubscriptionStateAdapter } from "./state";
import { validateTaxId } from "./tax-id";
import { TEST_CARDS_AR } from "./test-cards";
import { analyze3DS, confirmChallengeAndPoll } from "./three-ds";
import { parseWebhookEvent, verifyWebhookSignature } from "./webhook";

/**
 * Deterministic idempotency key from caller-meaningful fields. Safe to retry:
 * the SAME inputs always produce the same key, so MP dedupes on its side
 * even if the client retries multiple times. Use a hash to keep keys short
 * + opaque (callers can't accidentally extract sensitive data from the key).
 *
 * **Length-prefix encoding to prevent boundary collisions.** Previously
 * joined parts with `|`, but `["a", "b|c"]` and `["a|b", "c"]` would
 * canonicalize to the same string and collide. An attacker controlling
 * `external_reference` (often passed through to user-supplied fields)
 * could craft a value that collides with a future legitimate transaction.
 * Length-prefix (`<len>:<value>` joined by `|`) makes collisions impossible
 * because the `:` is part of the protocol, not the data.
 *
 * **Async**, uses Web Crypto so it works in Edge Runtime.
 */
async function deterministicIdempotencyKey(
  ...parts: Array<string | number | undefined>
): Promise<string> {
  const filtered = parts.filter((p) => p !== undefined && p !== null).map(String);
  // Length-prefix encoding: `<n>:<part0>|<n>:<part1>|...`, boundary-safe.
  const payload = filtered.map((p) => `${p.length}:${p}`).join("|");
  return (await sha256Hex(payload)).slice(0, 32);
}

export interface MercadoPagoToolsOptions {
  /** State adapter for persisting subscription records. */
  state: SubscriptionStateAdapter;
  /**
   * Default back_url used when callers don't supply one. MUST be HTTPS, MP
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
   * Optional, MP falls back to dashboard config if not set.
   */
  notificationUrl?: string;
  /**
   * Webhook secret for the `handle_webhook` tool. Required to verify
   * incoming webhook HMAC-SHA256 signatures. Get it from MP dev panel →
   * "Notificaciones" → "Webhooks" → "Configurar notificaciones".
   * If omitted, `handle_webhook` returns `{ verified: false, error: ... }`
   * and the agent should reject the webhook.
   */
  webhookSecret?: string;
  /**
   * OAuth credentials for the marketplace flow. Required for
   * `oauth_exchange_code` and `oauth_refresh_token` (the secret cannot be
   * passed by the agent, it's a server-side secret). If omitted, those
   * tools return `{ available: false }` with setup instructions.
   */
  oauth?: {
    clientId: string;
    clientSecret: string;
  };
  /**
   * v0.10, Audit logger. When passed, every state-mutating tool call
   * automatically emits an audit entry with operation/actor/inputHash/
   * resourceId/outcome/duration. Read-only tools (get/search/list) skip
   * audit logging.
   */
  audit?: import("./audit").AuditLogger;
  /**
   * v0.10, Logical actor for audit entries (e.g., "agent:billing-bot",
   * "user:42"). Defaults to the AuditLogger's defaultActor.
   */
  auditActor?: string;
  /**
   * v0.10, Webhook deduplication for handle_webhook tool. Caches
   * processed (topic, dataId, requestId) tuples to short-circuit MP's
   * retries (which fire on 5xx and can deliver the same event 5+ times).
   */
  webhookDedup?: import("./webhook-dedup").WebhookDedup;
  /**
   * v0.15, Programmatic Human-In-The-Loop gate for irreversible /
   * money-moving operations. When set, every call to one of the gated
   * tools (cancel_payment, capture_payment, refund_payment,
   * delete_customer_card, cancel_qr_payment, cancel_order,
   * cancel_point_payment_intent, delete_webhook) invokes this callback
   * BEFORE executing. Return `true` to proceed, `false` to reject the
   * call (the tool returns `{ ok: false, reason: "Confirmation declined" }`).
   *
   * The description-based HITL warnings still apply (they nudge the LLM
   * to confirm in-conversation), but those depend on the LLM's heuristic
   * and can be bypassed via prompt injection. This callback is the actual
   * out-of-band enforcement: wire it to your UI / Slack / email / SMS
   * confirmation flow so a human approves money-movement explicitly.
   *
   * @example
   * ```ts
   * mercadoPagoTools(client, {
   *   state, backUrl,
   *   requireConfirmation: async (op, args) => {
   *     // Send a Slack DM to the operator with the operation summary
   *     // and wait for their button click. Throw or return false to reject.
   *     return await slack.confirm({
   *       channel: "#mp-approvals",
   *       text: `Refund $${args.amount ?? "FULL"} on payment ${args.payment_id}?`,
   *       timeoutMs: 60_000,
   *     });
   *   },
   * });
   * ```
   *
   * If omitted (default), the description-based HITL is the only line of
   * defense, fine for trusted/internal agents, NOT recommended for
   * untrusted-input agents (anything reading from a public webhook).
   */
  requireConfirmation?: (
    operation: GatedOperation,
    args: Record<string, unknown>,
  ) => Promise<boolean>;
}

/**
 * Tool names that go through `requireConfirmation` when configured.
 * Adding a new irreversible operation? Add it here AND in the
 * `applyConfirmationGate` wrapper at the bottom of this file.
 */
export type GatedOperation =
  | "cancel_payment"
  | "capture_payment"
  | "refund_payment"
  | "delete_customer_card"
  | "cancel_qr_payment"
  | "cancel_order"
  | "cancel_point_payment_intent"
  | "delete_webhook";

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
  | "cancel_qr_payment"
  // Subscription Plans (v0.4)
  | "create_subscription_plan"
  | "list_subscription_plans"
  | "update_subscription_plan"
  | "subscribe_to_plan"
  | "list_subscription_payments"
  // Stores + POS (v0.4)
  | "create_store"
  | "list_stores"
  | "create_pos"
  | "list_pos"
  // Disputes (v0.4)
  | "list_payment_disputes"
  | "get_dispute"
  // Lookup helpers (v0.4)
  | "list_identification_types"
  | "list_issuers"
  // Webhooks (v0.4)
  | "list_webhooks"
  | "create_webhook"
  | "update_webhook"
  | "delete_webhook"
  // Webhook handler combo (v0.5)
  | "handle_webhook"
  // OAuth Marketplace (v0.5)
  | "oauth_authorize_url"
  | "oauth_exchange_code"
  | "oauth_refresh_token"
  // Order Management API (v0.5)
  | "create_order"
  | "get_order"
  | "update_order"
  | "capture_order"
  | "cancel_order"
  // v0.6, Account / Balance / Movements / Settlements
  | "get_account_balance"
  | "list_account_movements"
  | "list_settlements"
  | "get_settlement"
  // v0.6, 3DS analyzer (pure)
  | "analyze_payment_3ds"
  // v0.6, Test cards (pure)
  | "get_test_cards"
  // v0.7, Customer + Card extensions
  | "get_customer"
  | "update_customer"
  | "create_customer_card"
  | "get_customer_card"
  // v0.7, Subscription / Plan / Refund / Preference extensions
  | "get_subscription_plan"
  | "update_subscription"
  | "search_subscriptions"
  | "get_refund"
  | "update_payment_preference"
  // v0.7, Merchant Orders
  | "get_merchant_order"
  | "search_merchant_orders"
  | "update_merchant_order"
  // v0.7, Stores + POS CRUD completion
  | "get_store"
  | "update_store"
  | "delete_store"
  | "get_pos"
  | "update_pos"
  | "delete_pos"
  // v0.7, Bank Accounts
  | "list_bank_accounts"
  | "register_bank_account"
  // v0.7, Point Devices físicos
  | "list_point_devices"
  | "update_point_device_mode"
  | "create_point_payment_intent"
  | "get_point_payment_intent"
  | "cancel_point_payment_intent"
  // v0.7, Pure helpers
  | "compute_marketplace_fee"
  | "explain_payment_status"
  // v0.9, Health check + observability
  | "mp_health_check"
  // v0.10, AR issuer cuotas promos (pure helper)
  | "find_applicable_promos"
  // v0.10, 3DS challenge resolution (combined poll-and-resolve)
  | "confirm_3ds_challenge"
  // v0.10, Auto-paginate variants (collect-all)
  | "search_payments_all"
  | "list_settlements_all"
  // v0.11, TaxID validation cross-LATAM (pure)
  | "validate_tax_id";

const DEFAULT_DESCRIPTIONS: Record<ToolName, string> = {
  // ── Subscriptions ────────────────────────────────────────────────────────
  create_subscription:
    "Create a Mercado Pago recurring subscription (crear suscripción, cobro recurrente con Mercado Pago). Returns an init_point URL where the customer must complete the FIRST payment with their card and CVV (this is a hard MP requirement; agents cannot bypass it). After they pay, MP will auto-charge at the configured frequency without further intervention.",
  get_subscription_status:
    "Check the status of a Mercado Pago subscription (consultar estado de una suscripción). Use this to confirm the customer completed the first payment (status becomes 'authorized') or to inspect the next charge date.",
  cancel_subscription:
    "Cancel an active Mercado Pago subscription (cancelar suscripción, dar de baja). After cancellation, MP will not charge the customer again. This action is irreversible, confirm with the user before calling.",
  pause_subscription:
    "Pause an authorized Mercado Pago subscription (pausar suscripción). Charges stop until resumed. Only works on subscriptions in 'authorized' status.",
  resume_subscription:
    "Resume a paused Mercado Pago subscription (reactivar suscripción). Charges resume on the next scheduled date. Only works on subscriptions in 'paused' status.",

  // ── Payments ─────────────────────────────────────────────────────────────
  create_payment:
    "Create a one-time Mercado Pago payment (crear un pago, cobrar con Mercado Pago). Two flows: (a) with a card token from MP frontend Cardform, for transparent checkout; (b) without token, for non-card methods like 'account_money', 'rapipago', 'pagofacil'. For most agent flows where you only have a payer email and want to send them a payment link, use create_payment_preference instead (Checkout Pro hosted form). Returns the Payment object with status, typically 'approved' for account_money and 'pending' for tickets.",
  get_payment:
    "Fetch a Mercado Pago payment by ID (consultar un pago). Use to confirm status after webhook arrives, or to inspect details (status_detail explains rejections).",
  search_payments:
    "Search Mercado Pago payments with filters (buscar pagos). Most common: by external_reference (your-system identifier) to find all payments for an order, or by status='approved' to list successful charges in a date range. Returns paginated results.",
  cancel_payment:
    "Cancel a pending or in_process Mercado Pago payment (cancelar un pago pendiente); only works before approval. Once approved, use refund_payment instead. Common use: cancel an unpaid ticket payment that's still pending. **IRREVERSIBLE, confirm with the user before calling. Surface the payment_id, amount, payer_email, and current status, ask 'sí, cancelá' (or equivalent), then proceed.**",
  capture_payment:
    "Capture an authorized credit-card payment (capturar un pago autorizado) that was created with capture=false. Use for hold-then-capture flows (e.g., authorize on order, capture on shipment). Optional partial amount. **MOVES MONEY, confirm the amount with the user before calling.**",

  // ── Refunds ──────────────────────────────────────────────────────────────
  refund_payment:
    "Refund an approved Mercado Pago payment (reembolsar un pago, hacer una devolución). Pass amount for partial refund; omit for full refund. Idempotency key is auto-generated based on paymentId+amount to prevent double-refunds on retries. **IRREVERSIBLE AND MOVES MONEY, confirm with the user before calling. Restate the payment_id, the refund amount (full vs partial), and ask explicit confirmation. Mercado Pago does not support 'undo refund', once issued, the buyer's bank releases the funds.**",
  list_refunds:
    "List all refunds for a payment (listar reembolsos de un pago). Returns array of Refund objects. Useful to confirm a refund was processed or to inspect partial-refund history.",

  // ── Checkout Pro ─────────────────────────────────────────────────────────
  create_payment_preference:
    "Create a Mercado Pago Checkout Pro payment link (crear link de pago, cobrar por Mercado Pago) and get back a payment URL (init_point) to send to the customer. THIS is the recommended way for an agent to take a payment when you only have a payer email, the buyer enters card data on MP's hosted form (no PCI scope needed). Supports cuotas configuration, payment method exclusions, back URLs after success/failure/pending. In sandbox, use sandbox_init_point from the response.",
  get_payment_preference:
    "Fetch a Checkout Pro preference / payment link by ID (consultar un link de pago). Returns the preference config and current init_point URLs. Use to inspect a previously-created link.",

  // ── Customers + Cards ────────────────────────────────────────────────────
  create_customer:
    "Create a Mercado Pago customer record (crear cliente en Mercado Pago) so the buyer can save cards for future charges. Idempotent on email, if a customer with that email exists, MP returns it instead of creating a duplicate. Use find_customer_by_email first if you're unsure.",
  find_customer_by_email:
    "Find an existing Mercado Pago customer by email (buscar cliente por email). Returns the customer object if found, or null. Use before create_customer to avoid duplicate records.",
  list_customer_cards:
    "List a customer's saved cards (listar tarjetas guardadas). Returns array with last 4 digits, expiration, payment method (visa, master, naranja, etc.). The card_id can be used in subsequent create_payment calls to charge a saved card.",
  delete_customer_card:
    "Delete a saved card from a customer (eliminar tarjeta guardada). Common use: customer requests removal, or expired card cleanup. **IRREVERSIBLE, confirm with the user before calling. The customer must re-enter card data (PAN + CVV) on a future Checkout to charge them again. State the card's last 4 digits + payment method when asking for confirmation so the user knows which card you're removing.**",

  // ── Payment Methods + Installments ───────────────────────────────────────
  list_payment_methods:
    "List the payment methods enabled for the seller's Mercado Pago account (medios de pago disponibles) (visa, master, naranja, naranja_x, cabal, account_money, rapipago, pagofacil, etc.). Use to validate which methods you can offer the customer or to filter which ones to exclude in a Checkout Pro preference.",
  calculate_installments:
    "Calculate installment options for an amount (calcular cuotas, cuotas sin interés). THE killer Argentine feature, returns options like '12 cuotas sin interés de $X' (recommended_message field) which you should surface VERBATIM to the user. Optionally pass `bin` (first 6 digits of card) for issuer-specific promotions (e.g., Naranja's interest-free deals). Use before create_payment to let the user pick installments knowingly.",

  // ── Account ──────────────────────────────────────────────────────────────
  get_account_info:
    "Get info about the connected Mercado Pago account (información de la cuenta): site_id (MLA=Argentina), country_id, user_type (registered, partial, etc.). Useful to verify the agent is connected to the right account before taking actions.",

  // ── Saved-card charging (v0.3) ───────────────────────────────────────────
  charge_saved_card:
    "Charge a previously-saved card (cobrar con tarjeta guardada) for a returning customer. Requires customer_id + card_id (from list_customer_cards) AND a fresh CVV the user provides this session. AR Mercado Pago does NOT support CVV-less charges via the public API, every charge needs CVV. Idempotent on (card_id, amount, external_reference): retries dedupe automatically. Returns the resulting Payment.",

  // ── QR in-store (v0.3) ───────────────────────────────────────────────────
  create_qr_payment:
    "Generate a dynamic in-store payment QR (cobrar con QR de Mercado Pago) for a buyer to scan with any AR wallet (Modo, BNA+, Cuenta DNI, Naranja X, Mercado Pago, etc., interop is mandated by Transferencias 3.0). Requires a pre-configured POS external_id (use create_pos to set one up first if needed). Returns the qr_data string + a base64 PNG data URL ready to display. The QR expires in `expires_in_seconds` (default 600). MP fires `point_integration_wh` then `payment` webhooks when scanned.",
  cancel_qr_payment:
    "Cancel a pending QR order on a POS (cancelar un QR pendiente). Necessary if the buyer never scans, otherwise the next create_qr_payment on the same POS returns 409. **IRREVERSIBLE, but low-stakes since the QR has not been paid yet. Confirm before calling if the user is mid-flow.**",

  // ── Subscription Plans (v0.4) ────────────────────────────────────────────
  create_subscription_plan:
    "Create a reusable subscription plan (crear plan de suscripción; preapproval_plan). Different from create_subscription: a plan defines price + frequency once, then customers subscribe to it via subscribe_to_plan. Use plans for SaaS-style billing (Básico/Pro/Enterprise tiers). For per-customer custom amounts, use create_subscription directly.",
  list_subscription_plans:
    "List all subscription plans defined for this MP account. Useful before create_subscription_plan to check if one already exists, or for surfacing options to a customer.",
  update_subscription_plan:
    "Update a subscription plan's reason / amount / status / back_url. Existing customer subscriptions to the plan are NOT automatically updated, only NEW subscribers get the new pricing.",
  subscribe_to_plan:
    "Subscribe a customer to an existing plan (suscribir un cliente a un plan). Returns a Preapproval with init_point URL where the customer completes first payment. Cleaner than create_subscription when you have fixed tiers.",
  list_subscription_payments:
    "List the auto-charges under a subscription (cobros de una suscripción; authorized_payments). Useful for 'show me the cobros del último mes for this client' or to debug a failing recurring charge.",

  // ── Stores + POS (v0.4) ──────────────────────────────────────────────────
  create_store:
    "Create a store under the seller's MP account. Stores are the parent entity for POSes (which generate QR payments). Required ONE-TIME setup before create_pos. Pass a unique external_id and a display name.",
  list_stores:
    "List all stores configured for this MP account. Use this to find an existing store_id before create_pos, or to surface store options to the agent.",
  create_pos:
    "Create a POS (Point of Sale) under a store. The POS's external_id is what create_qr_payment uses. Each physical checkout / counter / agent typically has its own POS. Categories are MP-defined (default 621102 = Other Food and Beverage Services).",
  list_pos:
    "List all POSes for the seller (or filtered by store_id). Use to find an existing POS before create_qr_payment, or to surface options.",

  // ── Disputes (v0.4, read-only) ──────────────────────────────────────────
  list_payment_disputes:
    "List all disputes / chargebacks raised against a payment. Read-only, resolution is dashboard-only. Surface the dashboard URL `https://www.mercadopago.com.ar/disputes/{dispute_id}` to the user when they need to respond.",
  get_dispute:
    "Get details of a specific dispute including reason, amount, resolution status. Read-only.",

  // ── Lookup helpers (v0.4) ────────────────────────────────────────────────
  list_identification_types:
    "List valid identification types for the seller's site. AR returns: DNI, CI, LE, LC, Otro, Pasaporte, CUIT, CUIL with their min/max length. Useful to validate an identification before passing to create_payment.",
  list_issuers:
    "List card issuers (banks) that support a payment_method_id. Optionally filter by `bin` (first 6 digits of the card) for accurate issuer detection. Useful with calculate_installments, issuer-specific promos (e.g., Naranja Galicia 6 cuotas sin interés) only appear when the issuer is identified.",

  // ── Webhooks management (v0.4) ───────────────────────────────────────────
  list_webhooks:
    "List all webhook subscriptions configured for this MP application. Use to see what topics + URLs are wired before adding new ones.",
  create_webhook:
    "Subscribe a webhook URL to a MP topic (payment, subscription_authorized_payment, subscription_preapproval, merchant_order, point_integration_wh). MP will POST to this URL when events of that topic fire.",
  update_webhook:
    "Update a webhook's URL or topic. Useful when you change deployment URLs without resubscribing from scratch.",
  delete_webhook:
    "Delete a webhook subscription. MP stops POSTing to it immediately. **IRREVERSIBLE, confirm before calling. State the webhook URL + topic so the user knows which subscription is being removed. Re-subscribing requires a new create_webhook call.**",

  // ── Webhook handler combo (v0.5) ─────────────────────────────────────────
  handle_webhook:
    "Process an incoming MP webhook in ONE call: verify the HMAC-SHA256 signature, parse the event, and (optionally) auto-fetch the underlying resource (Payment, Subscription, Order). Returns the structured event PLUS the full resource. USE THIS in your webhook endpoint INSTEAD of chaining verify_webhook_signature + parse_webhook_event + get_payment manually. Pass the raw request body, x-signature header, x-request-id header, and your MP webhook secret. SAFE: returns { verified: false } when signature mismatches, caller should respond 401 and stop processing. WHEN auto_fetch is true (default), the resource is fetched as the SAME MP user the client is configured for (so for marketplace integrations, instantiate a per-seller client).",

  // ── OAuth Marketplace (v0.5) ─────────────────────────────────────────────
  oauth_authorize_url:
    "Build the URL the SELLER (third-party MP account) visits to authorize your marketplace app. Pass the seller's redirect uri (must be whitelisted in MP dev panel) and an opaque state token (CSRF protection, bind it to the user's session). PURE FUNCTION: no network. The seller approves, MP redirects them to your `redirect_uri?code=...&state=...`. Then call oauth_exchange_code with the code.",
  oauth_exchange_code:
    "Exchange the authorization code (from the OAuth redirect) for an `OAuthToken`. Returns access_token, refresh_token, user_id, and expires_in. **PERSIST the entire response**, refresh_token is long-lived and the only way to keep the integration alive past 6h. Use the access_token to instantiate a per-seller MercadoPagoClient for marketplace flows.",
  oauth_refresh_token:
    "Refresh a per-seller access_token using the saved refresh_token. Call PROACTIVELY before expires_in elapses, or REACTIVELY on a 401 from a per-seller MercadoPagoClient. Returns a fresh OAuthToken, persist the new refresh_token (MP often returns the same value, but always replace).",

  // ── Order Management API (v0.5, modern Order API) ───────────────────────
  create_order:
    "Create a new Order via MP's modern Order Management API. DIFFERENT from create_payment_preference: Order is a transactional entity with explicit lifecycle (created → processed → captured/canceled), supports MANUAL CAPTURE (auth-only, capture later, for ride-share, hotels, marketplaces) and aggregates multiple payments into one Order. Use Preference (Checkout Pro) for simple hosted pay-links; use Order when you need auth-only or multi-payment-per-order semantics. For marketplace splits, set marketplace + marketplace_fee + collector_id (the SELLER's MP user_id from oauth_exchange_code).",
  get_order:
    "Fetch an Order by ID. Returns the Order with its lifecycle status and any attached payments/refunds.",
  update_order:
    "Patch an existing Order before it's captured/canceled. Common use: update items or external_reference.",
  capture_order:
    "Capture a previously-authorized Order (only for orders created with capture_mode='manual'). Captures up to the originally-authorized amount; pass amount for partial capture. Common use: ride-share marks ride complete → capture; hotel checks-out guest → capture.",
  cancel_order:
    "Cancel an Order. Releases any auth-holds and marks the Order as canceled. For orders that have already been CAPTURED, use refund_payment instead, cancel only works pre-capture. **IRREVERSIBLE, confirm with the user. State the order_id, total_amount, and current status before asking 'sí, cancelá'. The buyer's hold is released to their bank within 24-72h depending on issuer.**",

  // ── Account / Balance / Movements / Settlements (v0.6) ───────────────────
  get_account_balance:
    "Get the seller's current MP wallet balance. Returns { available_balance, unavailable_balance, total_amount, currency_id }. The available balance is what the seller can withdraw or pay with right now; unavailable is in retention (typically 14-21 days for new sellers or risk-flagged transactions). For per-seller marketplace setups, instantiate the client AS THE SELLER first.",
  list_account_movements:
    "List wallet movements (incoming payments, transfers, refunds, holdings) for the active MP account. Filter by date range with `from`/`to` (ISO 8601). Useful for monthly conciliation or 'show me what came in this month' workflows.",
  list_settlements:
    "List settlements (release_money), i.e. transfers from the MP wallet to the seller's registered bank account (CBU). USE WHEN the user asks 'cuándo me deposita MP' or for monthly bank-conciliation reports. Filter by date range and status.",
  get_settlement:
    "Get details of a single settlement: amount, date_scheduled, date_processed, bank_account info (CBU + bank name).",

  // ── 3DS analyzer (v0.6, pure) ───────────────────────────────────────────
  analyze_payment_3ds:
    "Pure local analyzer for a Payment's 3DS (Strong Customer Authentication) state. Pass a payment_id (string) and the tool fetches the Payment then derives { status: 'not_required'|'frictionless'|'challenge_required'|'rejected'|'unknown', mode, challengeUrl, description }. USE THIS after every create_payment for credit cards: when challengeUrl !== null, you MUST redirect the buyer there before the payment can complete. Without 3DS, payments stay in 'pending' indefinitely if the issuer demanded a challenge.",

  // ── Test cards (v0.6, pure) ─────────────────────────────────────────────
  get_test_cards:
    "Pure helper that returns the official MP test cards for AR (MLA): VISA/Mastercard/Amex credit + debit, with the 'magic' holder names that route the payment to specific status_detail values (APRO=approved, OTHE=rejected, CONT=pending, FUND=insufficient_amount, etc.). USE WHEN you need to demo a payment flow without a real card, or to script integration tests. Pure data, no network call.",

  // ── Customer + Card extensions (v0.7) ────────────────────────────────────
  get_customer:
    "Get a customer by id. Returns full Customer object: email, first_name, last_name, identification, address, default_card, registered cards. PURE READ. USE WHEN you have the customer_id from a previous create_customer / find_customer_by_email / payment.payer.id and want the full record.",
  update_customer:
    "Update a customer's profile (first_name, last_name, phone, identification, address, default_card). MP merges the patch, fields you don't send remain unchanged. Use to keep customer records in sync (e.g., shipping address changes) or to set a default card for charge_saved_card.",
  create_customer_card:
    "Add a saved card to an existing customer using a card_token (one-time token from MP frontend Cardform, agents should NEVER take raw card data, that's a PCI violation). Returns the saved CustomerCard with id usable in charge_saved_card. Persists across charges (no need to re-tokenize each time).",
  get_customer_card:
    "Get details of a single saved card by (customer_id, card_id). Returns last 4 digits, expiration, brand, issuer. PURE READ, useful before charge_saved_card to confirm the card is still valid.",

  // ── Subscription / Plan / Refund / Preference extensions (v0.7) ─────────
  get_subscription_plan:
    "Fetch a subscription plan by id. Returns plan config: amount, frequency, status, init_point. Use to inspect a plan before subscribing customers, or to display plan details to the user.",
  update_subscription:
    "Update a subscription's amount, status, reason, external_reference, OR card_token_id (to switch payment method when the buyer's card is expired/declined). For card swap: pass card_token_id from a fresh tokenization. CONSTRAINTS: status changes only support 'paused' | 'cancelled' (use authorize via init_point flow to re-activate).",
  search_subscriptions:
    "Search subscriptions across the seller's account. Filter by status (pending/authorized/paused/cancelled), payer_email, external_reference, or preapproval_plan_id (to find all subscribers of a plan). Paginated. USE WHEN you need to enumerate active subscribers, audit cancellations, or find a subscription by external reference.",
  get_refund:
    "Fetch a single refund by (payment_id, refund_id). Returns the Refund object with amount, status, date_created. PURE READ, useful to verify a refund processed or to reconcile partial-refund history.",
  update_payment_preference:
    "Update a Checkout Pro preference (notification_url, back_urls, items, payer info, payment_methods exclusion list). Only works on preferences NOT yet paid. Common use: regenerate the link with a new notification_url after deployment, or change items if the buyer requested adjustments before paying.",

  // ── Merchant Orders (v0.7) ────────────────────────────────────────────────
  get_merchant_order:
    "Get a merchant_order with all its associated payments + shipments. MerchantOrder is the parent entity for Payments associated with a single Preference, one Order can have multiple partial Payments (retries, installments). USE THIS in webhooks with topic='merchant_order' to get the aggregate paid_amount, refunded_amount, and shipping status in one call.",
  search_merchant_orders:
    "Search merchant_orders by preference_id, external_reference, or status. Paginated. Returns up to 50 per page. USE WHEN you have a preference_id and want all its derived merchant_orders, or when reconciling 'which payments belong to which preference'.",
  update_merchant_order:
    "Update a merchant_order, typically to add items or shipping info. Most agent flows don't need this; use only when integrating with a custom shipping flow that requires updating the MO mid-lifecycle.",

  // ── Stores + POS CRUD completion (v0.7) ──────────────────────────────────
  get_store:
    "Fetch a single store by (user_id, store_id). Returns store details: name, location, business_hours, external_id. PURE READ.",
  update_store:
    "Update a store's properties (name, location, business_hours, external_id). MP merges the patch.",
  delete_store:
    "Delete a store. IRREVERSIBLE. Confirm with user before calling. Will fail if the store has associated POSes, delete those first.",
  get_pos:
    "Fetch a POS by id. Returns: name, store_id, category, external_id, qr_template (if configured). PURE READ. Use when you need to find the external_id for create_qr_payment.",
  update_pos:
    "Update a POS's properties (name, category, external_id). MP merges the patch.",
  delete_pos:
    "Delete a POS. IRREVERSIBLE. Cancels any pending QR orders attached to it. Confirm with user before calling.",

  // ── Bank Accounts (v0.7) ─────────────────────────────────────────────────
  list_bank_accounts:
    "List the bank accounts (CBUs) the seller has registered with MP for receiving payouts. Returns an array, the one with `is_default: true` is where settlements (release_money) go. USE BEFORE list_settlements when the user asks 'a qué cuenta me deposita MP'.",
  register_bank_account:
    "Register a new bank account (CBU) for the seller. NOTE: MP usually requires this through the dashboard for compliance, this endpoint may not work for all accounts. If it fails with 403, redirect the user to https://www.mercadopago.com.ar/banking/dashboard.",

  // ── Point Devices físicos (v0.7) ─────────────────────────────────────────
  list_point_devices:
    "List the physical Point devices (Smart, Tap to Pay, etc.) linked to the seller's MP account. Distinct from logical POS, these are actual terminals at brick-and-mortar shops. Returns each device's id (serial), operating_mode (PDV vs STANDALONE), and pos_id (when bound to a logical POS). Filter by pos_id to find devices for a specific cash register.",
  update_point_device_mode:
    "Switch a Point device's operating_mode between 'PDV' (bound to a logical POS, takes payments triggered through that POS) and 'STANDALONE' (works independently, accepts any payment). PDV is for cash-register integrations; STANDALONE is for free-form retail. Affects how payments hit the device.",
  create_point_payment_intent:
    "Create a payment intent on a physical Point device, the device prompts the buyer to tap/insert/swipe their card. Returns immediately with intent_id; query state via get_point_payment_intent or wait for point_integration_wh webhook. **AMOUNT IS IN CENTAVOS**, NOT pesos (Point API differs from Payments API): 100 = $1, 1000 = $10, 10000 = $100.",
  get_point_payment_intent:
    "Get the current state of a Point payment intent (OPEN, PROCESSING, FINISHED, CANCELED, ERROR). USE in polling loops if you can't wait for the webhook. When state=FINISHED, the intent.payment.id is the resulting Payment id usable with get_payment.",
  cancel_point_payment_intent:
    "Cancel an OPEN point payment intent before the buyer interacts with the device. ONLY WORKS while state='OPEN', once the buyer taps, you can't cancel; refund_payment after the fact instead. **IRREVERSIBLE, confirm with the cashier/operator before calling. State the device_id and amount.**",

  // ── Pure helpers (v0.7) ──────────────────────────────────────────────────
  compute_marketplace_fee:
    "PURE HELPER (no network), given a transaction amount + fee rule (% or flat ARS, with optional min/max floors), returns the exact `marketplace_fee` value in ARS to pass to create_order or create_payment_preference. USE WHEN your platform takes a commission and you need to compute the exact fee per transaction. Examples: { percent: 5, minArs: 50, maxArs: 5000 } for percentage with floor + cap; { flatArs: 200, percent: 2 } for fixed + percentage.",
  explain_payment_status:
    "PURE HELPER (no network), given a Payment object (from get_payment / create_payment / handle_webhook), returns { summary, recommendedAction, final, paid, retryable } in Spanish. Translates MP's cryptic status_detail codes to plain Spanish + actionable guidance ('reintentar con otra tarjeta' vs 'esperar webhook' vs 'estado final'). USE THIS instead of having to memorize 30+ status_detail codes, surface summary + recommendedAction directly to the user.",

  // ── v0.9, Health check + observability ──────────────────────────────────
  mp_health_check:
    "Liveness probe against MP. Returns { ok, latencyMs, userId, circuit }. USE THIS as the first call in long-running agent workflows to verify (a) network path to MP is up, (b) accessToken is valid, (c) MP is responding. Circuit-breaker state included when configured, surface to ops dashboards. Returns ok=false instead of throwing, safe to call in monitoring loops without try/catch.",

  // ── v0.10, AR issuer cuotas promos (pure) ───────────────────────────────
  find_applicable_promos:
    "PURE HELPER (no network, sub-ms), returns the 'cuotas sin interés' promotions applicable to a given (issuer, paymentMethodId, amount, category, date) tuple. Includes the federal Ahora 3/6/12/18/24/30 program AND issuer-specific deals (Naranja con Galicia los jueves, Santander Amex en supermercados los martes, etc.). USE THIS BEFORE checkout to surface 'pagá en 12 cuotas sin interés con tu Galicia' hints to the buyer, drives conversion. Returns an array of CuotasPromo objects; the `description` field is in Spanish and ALWAYS surface verbatim. Catalog updated quarterly.",

  // ── v0.10, 3DS challenge resolution ────────────────────────────────────
  confirm_3ds_challenge:
    "After the buyer completes a 3DS challenge (redirected back from challengeUrl), call this to poll MP and confirm whether the payment is now resolved. Polls get_payment up to N times with exponential backoff. Returns { payment, threeDs, resolved, attempts }. USE THIS as the FINAL step in the 3DS flow (after analyze_payment_3ds detected a challenge_required). Without confirming, the payment stays in 'pending' indefinitely from the buyer's perspective.",

  // ── v0.10, Auto-paginate variants ──────────────────────────────────────
  search_payments_all:
    "Collect ALL payments matching a filter, auto-paginates under the hood. Returns an array (NOT paginated) so the agent doesn't have to manage offset/limit loops manually. SAFETY: pass `max_items` to cap; without it, MP traversal is bounded by the toolkit's internal max (10,000 items) to prevent runaway iterations. USE WHEN the agent needs to enumerate everything (e.g., monthly reconciliation 'all approved payments in March'). For agent flows that only need 'first N matches', pass `max_items` directly.",
  list_settlements_all:
    "Collect ALL settlements matching a filter, auto-paginates. Pass `max_items` to cap. Use for monthly bank-conciliation reports.",

  // ── v0.11, TaxID validation cross-LATAM (pure) ──────────────────────────
  validate_tax_id:
    "PURE HELPER (no network, sub-ms), validates a tax ID against the appropriate country algorithm. Supports AR (DNI/CUIT/CUIL with modulo-11), BR (CPF/CNPJ with two-step weighted modulo), MX (RFC structure), CL (RUT with K digit), CO (NIT modulo-11), UY (RUT 12-digit checksum), PE (RUC 11-digit + prefix validation). Returns { valid, normalized, formatted, type, country, error }. USE THIS BEFORE submitting buyer identification to MP, invalid tax IDs cause 4xx rejections. Surface the Spanish error verbatim.",
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

  const built = buildAllTools(client, options, desc);
  // Apply the programmatic HITL gate to gated tools when the caller wired
  // a `requireConfirmation` callback. Default = no-op (description-only HITL).
  return options.requireConfirmation
    ? applyConfirmationGate(built, options.requireConfirmation)
    : built;
}

function buildAllTools(
  client: MercadoPagoClient,
  options: MercadoPagoToolsOptions,
  desc: (name: ToolName) => string,
): ToolSet {
  return {
    // ─────────────────────────────────────────────────────────────────────────
    // Subscriptions (v0.1, kept identical for backward compatibility)
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
        const created = await client.createPreapproval(
          {
            reason,
            payerEmail: customer_email,
            amount: amount_ars,
            currency: "ARS",
            frequency: frequency_months,
            frequencyType: "months",
            backUrl: options.backUrl,
            ...(external_reference !== undefined ? { externalReference: external_reference } : {}),
            // Deterministic idempotency, if the LLM retries this tool call
            // with the same inputs (e.g., timeout + retry), MP returns the
            // EXISTING subscription instead of creating a duplicate.
            idempotencyKey: await deterministicIdempotencyKey(
              "create_subscription",
              customer_email,
              amount_ars,
              frequency_months,
              external_reference,
            ),
          },
        );
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
        }).optional().describe("Payer identification, required for some payment types in AR"),
        statement_descriptor: z.string().max(13).optional().describe("Shows on buyer's card statement (max 13 chars)"),
        // v0.11, fraud scoring enrichment fields
        additional_info: z
          .object({
            ip_address: z
              .string()
              .optional()
              .describe(
                "Buyer's IP address (from req.headers X-Forwarded-For). STRONGLY RECOMMENDED for card payments, improves MP fraud scoring confidence and reduces false-positive rejections (3-5x lower per RG 5286/2023).",
              ),
            referral_url: z.string().url().optional().describe("Page the buyer came from"),
            payer: z
              .object({
                first_name: z.string().optional(),
                last_name: z.string().optional(),
                phone: z
                  .object({ area_code: z.string().optional(), number: z.string().optional() })
                  .optional(),
                address: z
                  .object({
                    zip_code: z.string().optional(),
                    street_name: z.string().optional(),
                    street_number: z.number().optional(),
                  })
                  .optional(),
                registration_date: z
                  .string()
                  .optional()
                  .describe("ISO 8601, when the buyer registered on YOUR platform"),
                authentication_type: z.string().optional(),
                is_prime_user: z.boolean().optional(),
                is_first_purchase_online: z.boolean().optional(),
                last_purchase: z.string().optional(),
              })
              .optional(),
            shipments: z
              .object({
                receiver_address: z
                  .object({
                    zip_code: z.string().optional(),
                    street_name: z.string().optional(),
                    street_number: z.number().optional(),
                    floor: z.string().optional(),
                    apartment: z.string().optional(),
                    city_name: z.string().optional(),
                    state_name: z.string().optional(),
                    country_name: z.string().optional(),
                  })
                  .optional(),
                express_shipment: z.boolean().optional(),
                local_pickup: z.boolean().optional(),
              })
              .optional(),
          })
          .optional()
          .describe(
            "Fraud scoring enrichment. Pass IP address + payer profile + shipping address for materially better approval rates on card payments.",
          ),
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
          ...(input.additional_info !== undefined
            ? { additionalInfo: input.additional_info as never }
            : {}),
          ...(options.notificationUrl !== undefined ? { notificationUrl: options.notificationUrl } : {}),
          // Deterministic idempotency key, safe to retry, same inputs always
          // produce the same key (MP dedupes on its side).
          idempotencyKey: await deterministicIdempotencyKey(
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
        payer_email: z.string().email().optional().describe("Filter by payer email (exact match)."),
        begin_date: z.string().datetime().optional().describe("ISO 8601, e.g. 2026-01-01T00:00:00Z"),
        end_date: z.string().datetime().optional().describe("ISO 8601"),
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
          idempotencyKey: await deterministicIdempotencyKey("refund", payment_id, amount_ars ?? "full"),
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
        excluded_payment_types: z.array(z.enum(["credit_card", "debit_card", "ticket", "atm", "bank_transfer"])).optional().describe("Block payment types, e.g., ['ticket'] to disable Rapipago/Pago Fácil"),
      }),
      execute: async (input) => {
        // Deterministic idempotency at the request layer: if the LLM
        // retries this tool with the same items + payer + external_ref,
        // MP returns the EXISTING preference instead of creating a duplicate
        // (which would have the same init_point, same buyer, same link).
        const idemKey = await deterministicIdempotencyKey(
          "create_payment_preference",
          input.external_reference ?? input.payer_email ?? "",
          input.items.map((it) => `${it.title}:${it.quantity}:${it.unit_price}`).join("|"),
        );
        const pref = await client.createPreference(
          {
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
            idempotencyKey: idemKey,
          },
        );
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
        security_code: z.string().regex(/^\d{3,4}$/).describe("CVV, 3 digits (Visa/Master) or 4 (Amex). User must provide this each charge in AR."),
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
          idempotencyKey: await deterministicIdempotencyKey(
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
        notification_url: z.string().url().optional().describe("Webhook URL, falls back to dashboard config if omitted"),
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

    // ─────────────────────────────────────────────────────────────────────────
    // Subscription Plans (v0.4)
    // ─────────────────────────────────────────────────────────────────────────

    create_subscription_plan: tool({
      description: desc("create_subscription_plan"),
      inputSchema: z.object({
        reason: z.string().min(3).max(120).describe("Plan name shown at checkout"),
        amount_ars: z.number().positive(),
        frequency_months: z.number().int().min(1).max(12),
        back_url: z.string().url().describe("HTTPS URL where MP redirects after first payment"),
        external_reference: z.string().optional(),
        free_trial_days: z.number().int().min(1).max(60).optional().describe("Free trial period in days before first charge"),
      }),
      execute: async (input) => {
        const plan = await client.createSubscriptionPlan({
          reason: input.reason,
          amount: input.amount_ars,
          currency: "ARS",
          frequency: input.frequency_months,
          frequencyType: "months",
          backUrl: input.back_url,
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
          ...(input.free_trial_days !== undefined ? { freeTrialFrequency: input.free_trial_days, freeTrialFrequencyType: "days" as const } : {}),
        });
        return {
          plan_id: plan.id,
          status: plan.status,
          reason: plan.reason,
          amount: plan.auto_recurring.transaction_amount,
          currency: plan.auto_recurring.currency_id,
          frequency: `${plan.auto_recurring.frequency} ${plan.auto_recurring.frequency_type}`,
          external_reference: plan.external_reference,
          next_step: "Use subscribe_to_plan to enroll customers in this plan, or share its ID for them to subscribe via your frontend.",
        };
      },
    }),

    list_subscription_plans: tool({
      description: desc("list_subscription_plans"),
      inputSchema: z.object({
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const result = await client.listSubscriptionPlans({
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        });
        return {
          total: result.paging.total,
          plans: result.results.map((p) => ({
            plan_id: p.id,
            reason: p.reason,
            status: p.status,
            amount: p.auto_recurring.transaction_amount,
            currency: p.auto_recurring.currency_id,
            frequency: `${p.auto_recurring.frequency} ${p.auto_recurring.frequency_type}`,
          })),
        };
      },
    }),

    update_subscription_plan: tool({
      description: desc("update_subscription_plan"),
      inputSchema: z.object({
        plan_id: z.string(),
        reason: z.string().optional(),
        amount_ars: z.number().positive().optional(),
        status: z.enum(["active", "cancelled"]).optional(),
        back_url: z.string().url().optional(),
      }),
      execute: async (input) => {
        const updated = await client.updateSubscriptionPlan(input.plan_id, {
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
          ...(input.amount_ars !== undefined ? { amount: input.amount_ars } : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.back_url !== undefined ? { backUrl: input.back_url } : {}),
        });
        return {
          plan_id: updated.id,
          status: updated.status,
          reason: updated.reason,
          amount: updated.auto_recurring.transaction_amount,
          message: input.amount_ars !== undefined
            ? "Updated. Existing subscribers keep their old amount; only NEW subscribers get the new pricing."
            : "Plan updated.",
        };
      },
    }),

    subscribe_to_plan: tool({
      description: desc("subscribe_to_plan"),
      inputSchema: z.object({
        plan_id: z.string(),
        customer_email: z.string().email(),
        external_reference: z.string().optional(),
      }),
      execute: async (input) => {
        const sub = await client.subscribeToPlan({
          planId: input.plan_id,
          payerEmail: input.customer_email,
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
        });
        return {
          subscription_id: sub.id,
          status: sub.status,
          payer_email: sub.payer_email,
          init_point_url: sub.init_point,
          next_step: "Send init_point_url to the customer for first payment with card+CVV.",
        };
      },
    }),

    list_subscription_payments: tool({
      description: desc("list_subscription_payments"),
      inputSchema: z.object({
        subscription_id: z.string(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const result = await client.listSubscriptionPayments(input.subscription_id, {
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        });
        return {
          subscription_id: input.subscription_id,
          total: result.paging.total,
          payments: result.results.map((p) => ({
            authorized_payment_id: p.id,
            payment_id: p.payment_id ?? null,
            status: p.status,
            amount: p.transaction_amount ?? null,
            currency: p.currency_id ?? null,
            debit_date: p.debit_date ?? null,
            next_retry_date: p.next_retry_date ?? null,
            retry_attempt: p.retry_attempt ?? 0,
            reason: p.reason ?? null,
          })),
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Stores + POS (v0.4)
    // ─────────────────────────────────────────────────────────────────────────

    create_store: tool({
      description: desc("create_store"),
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        external_id: z.string().min(1).max(64).describe("Unique within the seller's stores"),
        address_line: z.string().optional(),
        city_name: z.string().optional(),
        state_name: z.string().optional(),
      }),
      execute: async (input) => {
        const me = await client.getMe();
        const store = await client.createStore(String(me.id), {
          name: input.name,
          externalId: input.external_id,
          ...(input.address_line || input.city_name || input.state_name
            ? {
                location: {
                  ...(input.address_line ? { addressLine: input.address_line } : {}),
                  ...(input.city_name ? { cityName: input.city_name } : {}),
                  ...(input.state_name ? { stateName: input.state_name } : {}),
                  countryId: "AR",
                },
              }
            : {}),
        });
        return {
          store_id: store.id,
          name: store.name,
          external_id: store.external_id,
          next_step: "Use create_pos with this store_id to add a Point of Sale where create_qr_payment can issue QRs.",
        };
      },
    }),

    list_stores: tool({
      description: desc("list_stores"),
      inputSchema: z.object({
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const me = await client.getMe();
        const result = await client.listStores(String(me.id), {
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        });
        return {
          total: result.paging.total,
          stores: result.results.map((s) => ({
            store_id: s.id,
            name: s.name ?? null,
            external_id: s.external_id ?? null,
          })),
        };
      },
    }),

    create_pos: tool({
      description: desc("create_pos"),
      inputSchema: z.object({
        name: z.string().min(1).max(80),
        external_id: z.string().min(1).max(64).describe("Unique within the store. This is what create_qr_payment uses."),
        store_id: z.string().describe("From create_store / list_stores"),
        category: z.number().int().optional().describe("MP category code, default 621102 (other food/beverage)"),
        fixed_amount: z.boolean().optional().describe("True for static QR with fixed amount; false (default) for dynamic per-order QR"),
      }),
      execute: async (input) => {
        const pos = await client.createPos({
          name: input.name,
          externalId: input.external_id,
          storeId: input.store_id,
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.fixed_amount !== undefined ? { fixedAmount: input.fixed_amount } : {}),
        });
        return {
          pos_id: pos.id,
          external_id: pos.external_id,
          store_id: pos.store_id,
          name: pos.name,
          next_step: "Use create_qr_payment with this external_id to start issuing dynamic QRs from this POS.",
        };
      },
    }),

    list_pos: tool({
      description: desc("list_pos"),
      inputSchema: z.object({
        store_id: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const result = await client.listPos({
          ...(input.store_id !== undefined ? { storeId: input.store_id } : {}),
          ...(input.limit !== undefined ? { limit: input.limit } : {}),
        });
        return {
          total: result.paging.total,
          pos: result.results.map((p) => ({
            pos_id: p.id,
            external_id: p.external_id ?? null,
            store_id: p.store_id ?? null,
            name: p.name ?? null,
          })),
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Disputes (v0.4, read-only)
    // ─────────────────────────────────────────────────────────────────────────

    list_payment_disputes: tool({
      description: desc("list_payment_disputes"),
      inputSchema: z.object({ payment_id: z.string() }),
      execute: async ({ payment_id }) => {
        const disputes = await client.listPaymentDisputes(payment_id);
        return {
          payment_id,
          count: disputes.length,
          disputes: disputes.map((d) => ({
            dispute_id: d.id,
            status: d.status,
            amount: d.amount ?? null,
            reason: d.reason ?? null,
            date_created: d.date_created ?? null,
            dashboard_url: `https://www.mercadopago.com.ar/disputes/${d.id}`,
          })),
        };
      },
    }),

    get_dispute: tool({
      description: desc("get_dispute"),
      inputSchema: z.object({
        payment_id: z.string(),
        dispute_id: z.string(),
      }),
      execute: async ({ payment_id, dispute_id }) => {
        const d = await client.getDispute(payment_id, dispute_id);
        return {
          dispute_id: d.id,
          status: d.status,
          amount: d.amount ?? null,
          reason: d.reason ?? null,
          reason_description: d.reason_description ?? null,
          resolution: d.resolution ?? null,
          date_created: d.date_created ?? null,
          dashboard_url: `https://www.mercadopago.com.ar/disputes/${d.id}`,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Lookup helpers (v0.4)
    // ─────────────────────────────────────────────────────────────────────────

    list_identification_types: tool({
      description: desc("list_identification_types"),
      inputSchema: z.object({}),
      execute: async () => {
        const types = await client.listIdentificationTypes();
        return {
          count: types.length,
          types: types.map((t) => ({
            id: t.id,
            name: t.name,
            type: t.type,
            min_length: t.min_length ?? null,
            max_length: t.max_length ?? null,
          })),
        };
      },
    }),

    list_issuers: tool({
      description: desc("list_issuers"),
      inputSchema: z.object({
        payment_method_id: z.string().describe("E.g. 'visa', 'master', 'naranja'"),
        bin: z.string().min(6).max(8).optional().describe("First 6-8 digits of card for precise issuer detection"),
      }),
      execute: async (input) => {
        const issuers = await client.listIssuers({
          paymentMethodId: input.payment_method_id,
          ...(input.bin !== undefined ? { bin: input.bin } : {}),
        });
        return {
          payment_method_id: input.payment_method_id,
          count: issuers.length,
          issuers: issuers.map((i) => ({
            issuer_id: i.id,
            name: i.name,
            status: i.status ?? null,
          })),
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // Webhooks management (v0.4)
    // ─────────────────────────────────────────────────────────────────────────

    list_webhooks: tool({
      description: desc("list_webhooks"),
      inputSchema: z.object({}),
      execute: async () => {
        const hooks = await client.listWebhooks();
        return {
          count: hooks.length,
          webhooks: hooks.map((h) => ({
            webhook_id: h.id,
            url: h.url ?? null,
            topic: h.topic ?? null,
            status: h.status ?? null,
            date_created: h.date_created ?? null,
          })),
        };
      },
    }),

    create_webhook: tool({
      description: desc("create_webhook"),
      inputSchema: z.object({
        url: z.string().url(),
        topic: z.string().describe("E.g. 'payment', 'subscription_authorized_payment', 'subscription_preapproval', 'merchant_order', 'point_integration_wh'"),
      }),
      execute: async ({ url, topic }) => {
        const hook = await client.createWebhook({ url, topic });
        return {
          webhook_id: hook.id,
          url: hook.url ?? url,
          topic: hook.topic ?? topic,
          status: hook.status ?? null,
        };
      },
    }),

    update_webhook: tool({
      description: desc("update_webhook"),
      inputSchema: z.object({
        webhook_id: z.string(),
        url: z.string().url().optional(),
        topic: z.string().optional(),
      }),
      execute: async (input) => {
        const hook = await client.updateWebhook(input.webhook_id, {
          ...(input.url !== undefined ? { url: input.url } : {}),
          ...(input.topic !== undefined ? { topic: input.topic } : {}),
        });
        return {
          webhook_id: hook.id,
          url: hook.url ?? null,
          topic: hook.topic ?? null,
          status: hook.status ?? null,
        };
      },
    }),

    delete_webhook: tool({
      description: desc("delete_webhook"),
      inputSchema: z.object({ webhook_id: z.string() }),
      execute: async ({ webhook_id }) => {
        await client.deleteWebhook(webhook_id);
        return { webhook_id, deleted: true };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.5, Webhook handler combo
    // ─────────────────────────────────────────────────────────────────────────

    handle_webhook: tool({
      description: desc("handle_webhook"),
      inputSchema: z.object({
        raw_body: z
          .string()
          .describe(
            "The raw JSON body of the webhook request, exactly as received (do NOT re-stringify). Pass `await req.text()` from your handler.",
          ),
        signature_header: z
          .string()
          .nullable()
          .describe("Value of the `x-signature` request header."),
        request_id_header: z
          .string()
          .nullable()
          .describe("Value of the `x-request-id` request header."),
        auto_fetch: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "If true (default), fetch the underlying resource (Payment, Subscription, etc.) AS the MP user the client is configured for. Set to false to skip the fetch (faster, useful when you only need the topic+id).",
          ),
      }),
      execute: async ({
        raw_body,
        signature_header,
        request_id_header,
        auto_fetch,
      }) => {
        if (!options.webhookSecret) {
          return {
            verified: false,
            error:
              "webhookSecret not configured in mercadoPagoTools options. Pass it from MP dev panel → Notificaciones → Webhooks.",
            event: null,
            resource: null,
          };
        }
        let parsedBody: unknown;
        try {
          parsedBody = JSON.parse(raw_body);
        } catch {
          return {
            verified: false,
            error: "raw_body is not valid JSON.",
            event: null,
            resource: null,
          };
        }
        const event = parseWebhookEvent(parsedBody);
        if (!event) {
          return {
            verified: false,
            error: "Could not extract topic + dataId from webhook body.",
            event: null,
            resource: null,
          };
        }
        const verified = await verifyWebhookSignature({
          requestId: request_id_header,
          dataId: event.dataId,
          signatureHeader: signature_header,
          secret: options.webhookSecret,
        });
        if (!verified) {
          return {
            verified: false,
            error: "HMAC-SHA256 signature mismatch. Reject the webhook (HTTP 401).",
            event,
            resource: null,
          };
        }
        // Webhook dedup, MP retries the same notification 5+ times on 5xx
        // responses. Without dedup, every retry re-runs the agent's downstream
        // side effects (re-charge confirmations, re-emit emails, double-update
        // state). The WebhookDedup adapter keys on (topic, dataId, requestId)
        // and returns shouldProcess=false for replays inside the dedup window.
        if (options.webhookDedup && request_id_header) {
          const { shouldProcess } = await options.webhookDedup.check({
            topic: event.topic,
            dataId: event.dataId,
            requestId: request_id_header,
          });
          if (!shouldProcess) {
            return {
              verified: true,
              deduplicated: true,
              event,
              resource: null,
              resource_error:
                "Webhook is a duplicate (same topic+dataId+requestId seen recently). Side effects skipped.",
            };
          }
        }
        let resource: unknown = null;
        let resourceError: string | null = null;
        if (auto_fetch) {
          try {
            switch (event.topic) {
              case "payment":
              case "payment.created":
              case "payment.updated":
                resource = await client.getPayment(event.dataId);
                break;
              case "preapproval":
              case "subscription_preapproval":
                resource = await client.getPreapproval(event.dataId);
                break;
              case "subscription_authorized_payment":
                // No direct fetch endpoint; the data id IS the authorized_payment id.
                resource = { id: event.dataId, hint: "Use list_subscription_payments to enumerate parent." };
                break;
              default:
                resource = null;
                resourceError = `No auto-fetch handler for topic '${event.topic}' yet.`;
            }
          } catch (err) {
            resourceError = err instanceof Error ? err.message : String(err);
          }
        }
        return {
          verified: true,
          event,
          resource,
          resource_error: resourceError,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.5, OAuth Marketplace flow
    // ─────────────────────────────────────────────────────────────────────────

    oauth_authorize_url: tool({
      description: desc("oauth_authorize_url"),
      inputSchema: z.object({
        redirect_uri: z
          .string()
          .url()
          .describe(
            "Where MP redirects the seller after approval. MUST be whitelisted in MP dev panel → Aplicaciones → tu app → Redirect URIs.",
          ),
        state: z
          .string()
          .min(8)
          .describe(
            "Opaque CSRF/session token echoed back. Bind to the user's session and verify on redirect.",
          ),
      }),
      execute: async ({ redirect_uri, state }) => {
        if (!options.oauth?.clientId) {
          return {
            available: false,
            error:
              "OAuth not configured. Pass `oauth: { clientId, clientSecret }` to mercadoPagoTools options.",
            url: null,
          };
        }
        const url = buildAuthorizeUrl({
          clientId: options.oauth.clientId,
          redirectUri: redirect_uri,
          state,
        });
        return {
          available: true,
          url,
          next_step:
            "Redirect the seller to `url`. After approval MP sends them to redirect_uri?code=...&state=..., verify state matches, then call oauth_exchange_code with the code.",
        };
      },
    }),

    oauth_exchange_code: tool({
      description: desc("oauth_exchange_code"),
      inputSchema: z.object({
        code: z
          .string()
          .describe("The `code` query param from the OAuth redirect URL."),
        redirect_uri: z
          .string()
          .url()
          .describe(
            "Must EXACTLY match the redirect_uri used in oauth_authorize_url.",
          ),
      }),
      execute: async ({ code, redirect_uri }) => {
        if (!options.oauth?.clientId || !options.oauth?.clientSecret) {
          return {
            available: false,
            error:
              "OAuth not configured. Pass `oauth: { clientId, clientSecret }` to mercadoPagoTools options.",
            token: null,
          };
        }
        try {
          const token = await exchangeCodeForToken({
            clientId: options.oauth.clientId,
            clientSecret: options.oauth.clientSecret,
            code,
            redirectUri: redirect_uri,
          });
          return {
            available: true,
            token,
            next_step:
              "PERSIST { user_id, access_token, refresh_token, expires_in } against this seller. Use access_token to instantiate `new MercadoPagoClient({ accessToken })` AS the seller for marketplace API calls.",
          };
        } catch (err) {
          return {
            available: true,
            error: err instanceof Error ? err.message : String(err),
            token: null,
          };
        }
      },
    }),

    oauth_refresh_token: tool({
      description: desc("oauth_refresh_token"),
      inputSchema: z.object({
        refresh_token: z
          .string()
          .describe("The saved refresh_token for this seller."),
      }),
      execute: async ({ refresh_token }) => {
        if (!options.oauth?.clientId || !options.oauth?.clientSecret) {
          return {
            available: false,
            error:
              "OAuth not configured. Pass `oauth: { clientId, clientSecret }` to mercadoPagoTools options.",
            token: null,
          };
        }
        try {
          const token = await refreshAccessToken({
            clientId: options.oauth.clientId,
            clientSecret: options.oauth.clientSecret,
            refreshToken: refresh_token,
          });
          return {
            available: true,
            token,
            next_step:
              "Replace the persisted access_token + refresh_token with these new values (refresh_token may have rotated).",
          };
        } catch (err) {
          return {
            available: true,
            error: err instanceof Error ? err.message : String(err),
            token: null,
          };
        }
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.5, Order Management API
    // ─────────────────────────────────────────────────────────────────────────

    create_order: tool({
      description: desc("create_order"),
      inputSchema: z.object({
        type: z
          .enum(["online", "in_store"])
          .describe("'online' for hosted/checkout flow, 'in_store' for QR/POS"),
        currency_id: z.string().optional().default("ARS"),
        external_reference: z.string().optional(),
        total_amount: z.number().positive().optional(),
        items: z
          .array(
            z.object({
              title: z.string(),
              unit_price: z.number(),
              quantity: z.number(),
              description: z.string().optional(),
            }),
          )
          .optional(),
        payer_email: z.string().email().optional(),
        capture_mode: z
          .enum(["automatic", "manual"])
          .optional()
          .describe(
            "'automatic' charges immediately; 'manual' authorizes only, capture later via capture_order.",
          ),
        notification_url: z.string().url().optional(),
        marketplace: z
          .string()
          .optional()
          .describe(
            "Marketplace identifier (your app's name). Required for split payments.",
          ),
        marketplace_fee: z
          .number()
          .optional()
          .describe(
            "Fee in ARS (NOT %) credited to the marketplace's MP account.",
          ),
        collector_id: z
          .union([z.string(), z.number()])
          .optional()
          .describe(
            "Seller's MP user_id (from oauth_exchange_code.user_id). Funds route here; marketplace_fee is split off to your account.",
          ),
      }),
      execute: async (input) => {
        const params: Parameters<typeof client.createOrder>[0] = {
          type: input.type,
        };
        if (input.currency_id) params.currency_id = input.currency_id;
        if (input.external_reference) params.external_reference = input.external_reference;
        if (input.total_amount !== undefined) params.total_amount = input.total_amount;
        if (input.items) params.items = input.items;
        if (input.payer_email) params.payer = { email: input.payer_email };
        if (input.capture_mode) params.capture_mode = input.capture_mode;
        if (input.notification_url) params.notification_url = input.notification_url;
        if (input.marketplace) params.marketplace = input.marketplace;
        if (input.marketplace_fee !== undefined) params.marketplace_fee = input.marketplace_fee;
        if (input.collector_id !== undefined) params.collector_id = input.collector_id;
        const order = await client.createOrder(params, {
          idempotencyKey: await deterministicIdempotencyKey(
            "create_order",
            input.external_reference,
            input.total_amount,
            input.collector_id,
          ),
        });
        return {
          order_id: order.id,
          status: order.status ?? null,
          capture_mode: order.capture_mode ?? params.capture_mode ?? "automatic",
          total_amount: order.total_amount ?? null,
        };
      },
    }),

    get_order: tool({
      description: desc("get_order"),
      inputSchema: z.object({ order_id: z.string() }),
      execute: async ({ order_id }) => {
        const order = await client.getOrder(order_id);
        return order;
      },
    }),

    update_order: tool({
      description: desc("update_order"),
      inputSchema: z.object({
        order_id: z.string(),
        external_reference: z.string().optional(),
        total_amount: z.number().optional(),
      }),
      execute: async ({ order_id, external_reference, total_amount }) => {
        const patch: Parameters<typeof client.updateOrder>[1] = {};
        if (external_reference !== undefined) patch.external_reference = external_reference;
        if (total_amount !== undefined) patch.total_amount = total_amount;
        const order = await client.updateOrder(order_id, patch);
        return order;
      },
    }),

    capture_order: tool({
      description: desc("capture_order"),
      inputSchema: z.object({
        order_id: z.string(),
        amount: z
          .number()
          .positive()
          .optional()
          .describe(
            "Optional partial-capture amount. Omit to capture the full authorized amount.",
          ),
      }),
      execute: async ({ order_id, amount }) => {
        const order = await client.captureOrder(order_id, amount);
        return {
          order_id: order.id,
          status: order.status ?? null,
          captured_amount: amount ?? order.total_amount ?? null,
        };
      },
    }),

    cancel_order: tool({
      description: desc("cancel_order"),
      inputSchema: z.object({ order_id: z.string() }),
      execute: async ({ order_id }) => {
        const order = await client.cancelOrder(order_id);
        return {
          order_id: order.id,
          status: order.status ?? "canceled",
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.6, Account / Balance / Movements / Settlements
    // ─────────────────────────────────────────────────────────────────────────

    get_account_balance: tool({
      description: desc("get_account_balance"),
      inputSchema: z.object({}),
      execute: async () => {
        const balance = await client.getAccountBalance();
        return balance;
      },
    }),

    list_account_movements: tool({
      description: desc("list_account_movements"),
      inputSchema: z.object({
        from: z
          .string()
          .optional()
          .describe("ISO 8601 start date (e.g. 2026-05-01)"),
        to: z
          .string()
          .optional()
          .describe("ISO 8601 end date"),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      execute: async ({ from, to, limit, offset }) => {
        const params: Parameters<typeof client.listAccountMovements>[0] = {};
        if (from !== undefined) params.from = from;
        if (to !== undefined) params.to = to;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.listAccountMovements(params);
      },
    }),

    list_settlements: tool({
      description: desc("list_settlements"),
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      execute: async ({ from, to, status, limit, offset }) => {
        const params: Parameters<typeof client.listSettlements>[0] = {};
        if (from !== undefined) params.from = from;
        if (to !== undefined) params.to = to;
        if (status !== undefined) params.status = status;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.listSettlements(params);
      },
    }),

    get_settlement: tool({
      description: desc("get_settlement"),
      inputSchema: z.object({ settlement_id: z.string() }),
      execute: async ({ settlement_id }) => {
        return client.getSettlement(settlement_id);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.6, 3DS analyzer (combined: fetch payment + analyze)
    // ─────────────────────────────────────────────────────────────────────────

    analyze_payment_3ds: tool({
      description: desc("analyze_payment_3ds"),
      inputSchema: z.object({
        payment_id: z.string().describe("MP payment id"),
      }),
      execute: async ({ payment_id }) => {
        const payment = await client.getPayment(payment_id);
        const info = analyze3DS(payment);
        return {
          payment_id,
          payment_status: payment.status,
          payment_status_detail: payment.status_detail ?? null,
          ...info,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.6, Test cards (pure)
    // ─────────────────────────────────────────────────────────────────────────

    get_test_cards: tool({
      description: desc("get_test_cards"),
      inputSchema: z.object({}),
      execute: async () => {
        return {
          site: "MLA",
          cards: TEST_CARDS_AR,
          usage:
            "Pass holderName='APRO' for an approved payment, 'OTHE' for rejected, 'CONT' for pending, 'FUND' for insufficient amount, 'CALL' for call-for-authorize. Use a NEW payer email per call (append a timestamp) to avoid MP idempotency-on-email deduping.",
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Customer + Card extensions
    // ─────────────────────────────────────────────────────────────────────────

    get_customer: tool({
      description: desc("get_customer"),
      inputSchema: z.object({ customer_id: z.string() }),
      execute: async ({ customer_id }) => {
        return client.getCustomer(customer_id);
      },
    }),

    update_customer: tool({
      description: desc("update_customer"),
      inputSchema: z.object({
        customer_id: z.string(),
        first_name: z.string().optional(),
        last_name: z.string().optional(),
        phone: z
          .object({ area_code: z.string().optional(), number: z.string().optional() })
          .optional(),
        identification: z
          .object({ type: z.string(), number: z.string() })
          .optional(),
        address: z
          .object({
            street_name: z.string().optional(),
            street_number: z.number().optional(),
            zip_code: z.string().optional(),
          })
          .optional(),
        description: z.string().optional(),
        default_card: z.string().optional(),
      }),
      execute: async ({ customer_id, ...patch }) => {
        // Filter out undefined to satisfy exactOptionalPropertyTypes.
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) cleaned[k] = v;
        }
        return client.updateCustomer(customer_id, cleaned as never);
      },
    }),

    create_customer_card: tool({
      description: desc("create_customer_card"),
      inputSchema: z.object({
        customer_id: z.string(),
        card_token: z.string().describe("Card token from MP frontend Cardform OR create_card_token."),
      }),
      execute: async ({ customer_id, card_token }) => {
        return client.createCustomerCard(customer_id, card_token);
      },
    }),

    get_customer_card: tool({
      description: desc("get_customer_card"),
      inputSchema: z.object({
        customer_id: z.string(),
        card_id: z.string(),
      }),
      execute: async ({ customer_id, card_id }) => {
        return client.getCustomerCard(customer_id, card_id);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Subscription / Plan / Refund / Preference extensions
    // ─────────────────────────────────────────────────────────────────────────

    get_subscription_plan: tool({
      description: desc("get_subscription_plan"),
      inputSchema: z.object({ plan_id: z.string() }),
      execute: async ({ plan_id }) => {
        return client.getSubscriptionPlan(plan_id);
      },
    }),

    update_subscription: tool({
      description: desc("update_subscription"),
      inputSchema: z.object({
        subscription_id: z.string(),
        transaction_amount: z.number().positive().optional(),
        card_token_id: z.string().optional(),
        status: z.enum(["authorized", "paused", "cancelled"]).optional(),
        reason: z.string().optional(),
        external_reference: z.string().optional(),
      }),
      execute: async ({ subscription_id, ...patch }) => {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) cleaned[k] = v;
        }
        return client.updatePreapproval(subscription_id, cleaned as never);
      },
    }),

    search_subscriptions: tool({
      description: desc("search_subscriptions"),
      inputSchema: z.object({
        status: z.string().optional(),
        payer_email: z.string().email().optional(),
        external_reference: z.string().optional(),
        plan_id: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      execute: async ({ status, payer_email, external_reference, plan_id, limit, offset }) => {
        const params: Parameters<typeof client.searchPreapprovals>[0] = {};
        if (status !== undefined) params.status = status;
        if (payer_email !== undefined) params.payerEmail = payer_email;
        if (external_reference !== undefined) params.externalReference = external_reference;
        if (plan_id !== undefined) params.preapproval_plan_id = plan_id;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.searchPreapprovals(params);
      },
    }),

    get_refund: tool({
      description: desc("get_refund"),
      inputSchema: z.object({
        payment_id: z.string(),
        refund_id: z.string(),
      }),
      execute: async ({ payment_id, refund_id }) => {
        return client.getRefund(payment_id, refund_id);
      },
    }),

    update_payment_preference: tool({
      description: desc("update_payment_preference"),
      inputSchema: z.object({
        preference_id: z.string(),
        notification_url: z.string().url().optional(),
        external_reference: z.string().optional(),
        statement_descriptor: z.string().optional(),
      }),
      execute: async ({ preference_id, ...patch }) => {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) cleaned[k] = v;
        }
        return client.updatePreference(preference_id, cleaned);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Merchant Orders
    // ─────────────────────────────────────────────────────────────────────────

    get_merchant_order: tool({
      description: desc("get_merchant_order"),
      inputSchema: z.object({ merchant_order_id: z.string() }),
      execute: async ({ merchant_order_id }) => {
        return client.getMerchantOrder(merchant_order_id);
      },
    }),

    search_merchant_orders: tool({
      description: desc("search_merchant_orders"),
      inputSchema: z.object({
        preference_id: z.string().optional(),
        external_reference: z.string().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      execute: async ({ preference_id, external_reference, status, limit, offset }) => {
        const params: Parameters<typeof client.searchMerchantOrders>[0] = {};
        if (preference_id !== undefined) params.preferenceId = preference_id;
        if (external_reference !== undefined) params.externalReference = external_reference;
        if (status !== undefined) params.status = status;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.searchMerchantOrders(params);
      },
    }),

    update_merchant_order: tool({
      description: desc("update_merchant_order"),
      inputSchema: z.object({
        merchant_order_id: z.string().min(1),
        // Narrow to MP's documented merchant_order PATCH fields. Previously
        // this was z.record(z.string(), z.unknown()) which let the LLM pass
        // arbitrary JSON; MP would silently ignore unknown keys, masking
        // typos. Strict schema = LLM gets a clear validation error instead.
        patch: z
          .object({
            external_reference: z
              .string()
              .max(256)
              .optional()
              .describe("Your system's id for this order. Updateable while order is open."),
            notification_url: z
              .string()
              .url()
              .optional()
              .describe("Where MP sends webhook notifications for this order."),
            additional_info: z
              .string()
              .max(600)
              .optional()
              .describe("Free-form metadata stored alongside the order."),
            status: z
              .enum(["opened", "closed", "expired"])
              .optional()
              .describe("Open orders can be closed (final) or expired (cleanup)."),
          })
          .strict()
          .describe("Subset of merchant_order fields to update. Unknown keys rejected."),
      }),
      execute: async ({ merchant_order_id, patch }) => {
        return client.updateMerchantOrder(merchant_order_id, patch);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Stores + POS CRUD completion
    // ─────────────────────────────────────────────────────────────────────────

    get_store: tool({
      description: desc("get_store"),
      inputSchema: z.object({
        user_id: z.string(),
        store_id: z.string(),
      }),
      execute: async ({ user_id, store_id }) => {
        return client.getStore(user_id, store_id);
      },
    }),

    update_store: tool({
      description: desc("update_store"),
      inputSchema: z.object({
        user_id: z.string(),
        store_id: z.string(),
        name: z.string().optional(),
        external_id: z.string().optional(),
      }),
      execute: async ({ user_id, store_id, ...patch }) => {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) cleaned[k] = v;
        }
        return client.updateStore(user_id, store_id, cleaned as never);
      },
    }),

    delete_store: tool({
      description: desc("delete_store"),
      inputSchema: z.object({
        user_id: z.string(),
        store_id: z.string(),
      }),
      execute: async ({ user_id, store_id }) => {
        await client.deleteStore(user_id, store_id);
        return { user_id, store_id, deleted: true };
      },
    }),

    get_pos: tool({
      description: desc("get_pos"),
      inputSchema: z.object({ pos_id: z.string() }),
      execute: async ({ pos_id }) => {
        return client.getPos(pos_id);
      },
    }),

    update_pos: tool({
      description: desc("update_pos"),
      inputSchema: z.object({
        pos_id: z.string(),
        name: z.string().optional(),
        external_id: z.string().optional(),
        category: z.number().optional(),
      }),
      execute: async ({ pos_id, ...patch }) => {
        const cleaned: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(patch)) {
          if (v !== undefined) cleaned[k] = v;
        }
        return client.updatePos(pos_id, cleaned as never);
      },
    }),

    delete_pos: tool({
      description: desc("delete_pos"),
      inputSchema: z.object({ pos_id: z.string() }),
      execute: async ({ pos_id }) => {
        await client.deletePos(pos_id);
        return { pos_id, deleted: true };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Bank Accounts
    // ─────────────────────────────────────────────────────────────────────────

    list_bank_accounts: tool({
      description: desc("list_bank_accounts"),
      inputSchema: z.object({}),
      execute: async () => {
        const accounts = await client.listBankAccounts();
        return { accounts };
      },
    }),

    register_bank_account: tool({
      description: desc("register_bank_account"),
      inputSchema: z.object({
        cbu: z.string().regex(/^\d{22}$/),
        alias: z.string().optional(),
      }),
      execute: async (input) => {
        const params: Parameters<typeof client.registerBankAccount>[0] = {
          cbu: input.cbu,
        };
        if (input.alias !== undefined) params.alias = input.alias;
        return client.registerBankAccount(params);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Point Devices físicos
    // ─────────────────────────────────────────────────────────────────────────

    list_point_devices: tool({
      description: desc("list_point_devices"),
      inputSchema: z.object({
        pos_id: z.union([z.string(), z.number()]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      }),
      execute: async ({ pos_id, limit, offset }) => {
        const params: Parameters<typeof client.listPointDevices>[0] = {};
        if (pos_id !== undefined) params.posId = pos_id;
        if (limit !== undefined) params.limit = limit;
        if (offset !== undefined) params.offset = offset;
        return client.listPointDevices(params);
      },
    }),

    update_point_device_mode: tool({
      description: desc("update_point_device_mode"),
      inputSchema: z.object({
        device_id: z.string(),
        operating_mode: z.enum(["PDV", "STANDALONE"]),
      }),
      execute: async ({ device_id, operating_mode }) => {
        return client.updatePointDeviceOperatingMode(device_id, operating_mode);
      },
    }),

    create_point_payment_intent: tool({
      description: desc("create_point_payment_intent"),
      inputSchema: z.object({
        device_id: z.string(),
        amount_centavos: z
          .number()
          .int()
          .positive()
          .describe("Amount in CENTAVOS (NOT pesos). 100 = $1, 1000 = $10, 10000 = $100."),
        description: z.string().optional(),
        external_reference: z.string().optional(),
        installments: z.number().int().min(1).max(24).optional(),
        installments_cost: z.enum(["seller", "buyer"]).optional(),
        print_on_terminal: z.boolean().optional(),
        ticket_number: z.string().optional(),
      }),
      execute: async (input) => {
        const params: Parameters<typeof client.createPointPaymentIntent>[1] = {
          amount: input.amount_centavos,
        };
        if (input.description !== undefined) params.description = input.description;
        if (input.external_reference !== undefined) params.externalReference = input.external_reference;
        if (input.installments !== undefined) params.installments = input.installments;
        if (input.installments_cost !== undefined) params.installmentsCost = input.installments_cost;
        if (input.print_on_terminal !== undefined) params.printOnTerminal = input.print_on_terminal;
        if (input.ticket_number !== undefined) params.ticketNumber = input.ticket_number;
        return client.createPointPaymentIntent(input.device_id, params);
      },
    }),

    get_point_payment_intent: tool({
      description: desc("get_point_payment_intent"),
      inputSchema: z.object({ intent_id: z.string() }),
      execute: async ({ intent_id }) => {
        return client.getPointPaymentIntent(intent_id);
      },
    }),

    cancel_point_payment_intent: tool({
      description: desc("cancel_point_payment_intent"),
      inputSchema: z.object({
        device_id: z.string(),
        intent_id: z.string(),
      }),
      execute: async ({ device_id, intent_id }) => {
        return client.cancelPointPaymentIntent(device_id, intent_id);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────────
    // v0.7, Pure helpers
    // ─────────────────────────────────────────────────────────────────────────

    compute_marketplace_fee: tool({
      description: desc("compute_marketplace_fee"),
      inputSchema: z.object({
        amount_ars: z.number().positive(),
        flat_ars: z.number().nonnegative().optional(),
        percent: z.number().min(0).max(100).optional(),
        min_ars: z.number().nonnegative().optional(),
        max_ars: z.number().nonnegative().optional(),
        round: z.boolean().optional(),
      }),
      execute: async (input) => {
        const rule: Parameters<typeof computeMarketplaceFee>[1] = {};
        if (input.flat_ars !== undefined) rule.flatArs = input.flat_ars;
        if (input.percent !== undefined) rule.percent = input.percent;
        if (input.min_ars !== undefined) rule.minArs = input.min_ars;
        if (input.max_ars !== undefined) rule.maxArs = input.max_ars;
        if (input.round !== undefined) rule.round = input.round;
        const fee = computeMarketplaceFee(input.amount_ars, rule);
        return {
          amount_ars: input.amount_ars,
          marketplace_fee: fee,
          seller_receives: input.amount_ars - fee,
          rule_applied: rule,
        };
      },
    }),

    mp_health_check: tool({
      description: desc("mp_health_check"),
      inputSchema: z.object({
        timeout_ms: z
          .number()
          .int()
          .positive()
          .max(30_000)
          .optional()
          .describe("Cap the wait time (default 5s). Use lower for status-page polling."),
      }),
      execute: async ({ timeout_ms }) => {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), timeout_ms ?? 5000);
        try {
          return await client.healthCheck(controller.signal);
        } finally {
          clearTimeout(t);
        }
      },
    }),

    explain_payment_status: tool({
      description: desc("explain_payment_status"),
      inputSchema: z.object({
        payment_id: z
          .string()
          .min(1)
          .optional()
          .describe(
            "If provided, fetches the Payment first. RECOMMENDED PATH for agents, pass the id and let the lib fetch.",
          ),
        // Loose object kept for advanced manual callers that have already
        // fetched a Payment from another path. LLMs should prefer payment_id.
        // We don't strictly type the Payment shape here because MP's actual
        // response includes 100+ optional fields; the helper consumes only
        // status / status_detail / payment_method_id / etc. Exposed loosely
        // for ergonomic interop, NOT for LLM use.
        payment: z
          .object({
            id: z.union([z.string(), z.number()]).optional(),
            status: z.string().optional(),
            status_detail: z.string().optional(),
            payment_method_id: z.string().optional(),
            transaction_amount: z.number().optional(),
          })
          .passthrough()
          .optional()
          .describe(
            "ADVANCED, pass a pre-fetched Payment object to skip the network call. LLMs: use payment_id instead.",
          ),
      }),
      execute: async ({ payment_id, payment }) => {
        let p: import("./types").Payment;
        if (payment) {
          p = payment as unknown as import("./types").Payment;
        } else if (payment_id) {
          p = await client.getPayment(payment_id);
        } else {
          return {
            ok: false,
            error: "Pass either payment_id or payment.",
          };
        }
        const explanation = explainPaymentStatus(p);
        return {
          ok: true,
          payment_status: p.status,
          payment_status_detail: p.status_detail ?? null,
          ...explanation,
        };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────
    // v0.10, AR issuer promos (pure)
    // ─────────────────────────────────────────────────────────────────────

    find_applicable_promos: tool({
      description: desc("find_applicable_promos"),
      inputSchema: z.object({
        issuer: z.string().optional().describe("Issuer name (e.g. 'Banco Galicia')"),
        payment_method_id: z.string().optional().describe("e.g. 'visa', 'master', 'naranja'"),
        amount_ars: z.number().positive().optional(),
        category: z
          .enum([
            "electronics",
            "appliances",
            "clothing",
            "supermarket",
            "travel",
            "education",
            "health",
            "general",
          ])
          .optional(),
        date: z.string().datetime().optional(),
        include_ahora_program: z.boolean().optional(),
      }),
      execute: async (input) => {
        const args: Parameters<typeof findApplicablePromos>[0] = {};
        if (input.issuer !== undefined) args.issuer = input.issuer;
        if (input.payment_method_id !== undefined) args.paymentMethodId = input.payment_method_id;
        if (input.amount_ars !== undefined) args.amountArs = input.amount_ars;
        if (input.category !== undefined) args.category = input.category;
        if (input.date !== undefined) args.date = new Date(input.date);
        if (input.include_ahora_program !== undefined) args.includeAhoraProgram = input.include_ahora_program;
        const promos = findApplicablePromos(args);
        return { ok: true, count: promos.length, promos };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────
    // v0.10, 3DS challenge resolution (poll-and-confirm)
    // ─────────────────────────────────────────────────────────────────────

    confirm_3ds_challenge: tool({
      description: desc("confirm_3ds_challenge"),
      inputSchema: z.object({
        payment_id: z.string(),
        max_attempts: z.number().int().positive().max(20).optional(),
        poll_interval_ms: z.number().int().positive().max(10_000).optional(),
      }),
      execute: async ({ payment_id, max_attempts, poll_interval_ms }) => {
        const args: Parameters<typeof confirmChallengeAndPoll>[2] = {};
        if (max_attempts !== undefined) args.maxAttempts = max_attempts;
        if (poll_interval_ms !== undefined) args.pollIntervalMs = poll_interval_ms;
        return confirmChallengeAndPoll(client, payment_id, args);
      },
    }),

    // ─────────────────────────────────────────────────────────────────────
    // v0.10, Auto-paginate variants (collect-all)
    // ─────────────────────────────────────────────────────────────────────

    search_payments_all: tool({
      description: desc("search_payments_all"),
      inputSchema: z.object({
        status: z.string().optional(),
        external_reference: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        max_items: z
          .number()
          .int()
          .positive()
          .max(10_000)
          .optional()
          .describe("Cap on total items returned (default 10,000 hard limit)."),
      }),
      execute: async ({ max_items, ...filter }) => {
        const filterClean: Record<string, string> = {};
        for (const [k, v] of Object.entries(filter)) {
          if (v !== undefined) filterClean[k] = v;
        }
        const opts: { maxItems?: number } = {};
        if (max_items !== undefined) opts.maxItems = max_items;
        else opts.maxItems = 10_000; // hard cap to prevent runaway
        const all = await collect(paginatePayments(client, filterClean as never, opts));
        return { ok: true, count: all.length, payments: all };
      },
    }),

    list_settlements_all: tool({
      description: desc("list_settlements_all"),
      inputSchema: z.object({
        from: z.string().optional(),
        to: z.string().optional(),
        status: z.string().optional(),
        max_items: z.number().int().positive().max(10_000).optional(),
      }),
      execute: async ({ max_items, ...filter }) => {
        const filterClean: { from?: string; to?: string; status?: string } = {};
        if (filter.from !== undefined) filterClean.from = filter.from;
        if (filter.to !== undefined) filterClean.to = filter.to;
        if (filter.status !== undefined) filterClean.status = filter.status;
        const opts: { maxItems?: number } = {};
        if (max_items !== undefined) opts.maxItems = max_items;
        else opts.maxItems = 10_000;
        const all = await collect(paginateSettlements(client, filterClean, opts));
        return { ok: true, count: all.length, settlements: all };
      },
    }),

    // ─────────────────────────────────────────────────────────────────────
    // v0.11, TaxID validation cross-LATAM (pure)
    // ─────────────────────────────────────────────────────────────────────

    validate_tax_id: tool({
      description: desc("validate_tax_id"),
      inputSchema: z.object({
        tax_id: z.string().min(1).describe(
          "The tax ID to validate. Accepts any format with or without separators (20-41758101-5, 20.41758101.5, 20417581015 all work for AR CUIT).",
        ),
        type: z
          .enum([
            "DNI",
            "CUIT",
            "CUIL",
            "CPF",
            "CNPJ",
            "RFC",
            "RUT_CL",
            "NIT",
            "RUT_UY",
            "RUC",
          ])
          .describe(
            "TaxID type. AR: DNI/CUIT/CUIL. BR: CPF (persona física) / CNPJ (persona jurídica). MX: RFC. CL: RUT_CL. CO: NIT. UY: RUT_UY. PE: RUC.",
          ),
      }),
      execute: async ({ tax_id, type }) => {
        return validateTaxId(tax_id, type);
      },
    }),
  } satisfies ToolSet;
}

/**
 * Wrap the gated tools with a `requireConfirmation` check. The callback
 * runs BEFORE the tool's original execute. If it returns false, the tool
 * returns `{ ok: false, reason: "Confirmation declined", operation, args }`
 * instead of executing.
 *
 * If the callback throws, the error propagates, let the agent handle it
 * (so connection issues surfacing to the user are distinguishable from
 * declined confirmations).
 */
const GATED_TOOL_NAMES: readonly GatedOperation[] = [
  "cancel_payment",
  "capture_payment",
  "refund_payment",
  "delete_customer_card",
  "cancel_qr_payment",
  "cancel_order",
  "cancel_point_payment_intent",
  "delete_webhook",
];

function applyConfirmationGate(
  tools: ToolSet,
  requireConfirmation: NonNullable<MercadoPagoToolsOptions["requireConfirmation"]>,
): ToolSet {
  const wrapped: ToolSet = { ...tools };
  for (const name of GATED_TOOL_NAMES) {
    const original = tools[name];
    if (!original) continue;
    wrapped[name] = {
      ...original,
      execute: async (input: unknown, ctx: unknown) => {
        const args = (input ?? {}) as Record<string, unknown>;
        const approved = await requireConfirmation(name, args);
        if (!approved) {
          return {
            ok: false,
            reason: "Confirmation declined by requireConfirmation gate.",
            operation: name,
            args,
          };
        }
        // Original execute keeps its own typing; we cast inputs/ctx to any
        // for the wrapper layer because tool() generics aren't preserved
        // through the ToolSet container.
        return await (original.execute as (i: unknown, c: unknown) => Promise<unknown>)(
          input,
          ctx,
        );
      },
    } as ToolSet[string];
  }
  return wrapped;
}
