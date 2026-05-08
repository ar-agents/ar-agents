// The five ACP `/checkout_sessions` endpoint handlers.
//
//   POST /checkout_sessions                                → create
//   POST /checkout_sessions/{id}                           → update
//   GET  /checkout_sessions/{id}                           → get
//   POST /checkout_sessions/{id}/complete                  → complete
//   POST /checkout_sessions/{id}/cancel                    → cancel
//
// All five share `preflightPost` (or `preflightGet`) for version + idempotency
// handling. Each delegates resource-specific work and returns AcpResponse.

import type { AcpRequest, AcpResponse, FacilitatorOptions } from "./types";
import {
  CheckoutSessionCancelRequest,
  CheckoutSessionCompleteRequest,
  CheckoutSessionCreateRequest,
  CheckoutSessionUpdateRequest,
  type CheckoutSession,
  type CheckoutSessionStatus,
} from "../schemas/checkout-session";
import type { LineItem, LineItemCreateInput } from "../schemas/line-item";
import type { Order } from "../schemas/order";
import type { Buyer } from "../schemas/buyer";
import {
  AcpError,
  sessionNotCancelable,
  sessionNotFound,
  validationFailed,
} from "../schemas/error";
import {
  buildLineItemTotals,
  buildOrderTotals,
} from "../totals";
import {
  generateOrderId as defaultGenerateOrderId,
  generateSessionId as defaultGenerateSessionId,
} from "../ids";
import {
  badRequest,
  errorResponse,
  internalError,
  jsonResponse,
  notFound,
  methodNotAllowed,
} from "./responses";
import { preflightGet, preflightPost } from "./preflight";

const CREATE_SCOPE = "POST /checkout_sessions";
const UPDATE_SCOPE = "POST /checkout_sessions/:id";
const COMPLETE_SCOPE = "POST /checkout_sessions/:id/complete";
const CANCEL_SCOPE = "POST /checkout_sessions/:id/cancel";

// --------------------------------------------------------------------------
// Body parsing helper
// --------------------------------------------------------------------------

function readBody(req: AcpRequest): unknown | AcpError {
  if (req.body !== undefined) return req.body;
  if (req.rawBody === "") return {};
  try {
    return JSON.parse(req.rawBody);
  } catch {
    return validationFailed("Request body is not valid JSON.");
  }
}

// --------------------------------------------------------------------------
// CREATE
// --------------------------------------------------------------------------

export async function handleCreateSession(
  req: AcpRequest,
  options: FacilitatorOptions,
): Promise<AcpResponse> {
  if (req.method !== "POST") {
    return methodNotAllowed(
      validationFailed(`Method ${req.method} not allowed on /checkout_sessions.`),
    );
  }

  const pre = await preflightPost(req, CREATE_SCOPE, options);
  if ("response" in pre) return pre.response;
  const { apiVersion, idempotencyKey } = pre.ok;

  const raw = readBody(req);
  if (isAcpError(raw)) {
    await options.state.release(CREATE_SCOPE, idempotencyKey);
    return badRequest(raw);
  }

  const parsed = CheckoutSessionCreateRequest.safeParse(raw);
  if (!parsed.success) {
    await options.state.release(CREATE_SCOPE, idempotencyKey);
    return badRequest(
      validationFailed(
        `Invalid CheckoutSession create request: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        parsed.error.issues[0]?.path.join(".") || undefined,
      ),
    );
  }
  const input = parsed.data;

  // Resolve each line item against the catalog. Currency must match.
  const resolved = await resolveLineItems(input.line_items, input.currency, options);
  if (!resolved.ok) {
    await options.state.release(CREATE_SCOPE, idempotencyKey);
    return badRequest(resolved.error);
  }
  const lineItems = resolved.lineItems;

  // Optional fulfillment options (host-provided).
  const fulfillmentOptions = options.computeFulfillmentOptions
    ? await options.computeFulfillmentOptions({
        lineItems,
        ...(input.fulfillment_details !== undefined
          ? { fulfillmentDetails: input.fulfillment_details }
          : {}),
        currency: input.currency,
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      })
    : [];

  const selectedFulfillmentIds =
    input.selected_fulfillment_options?.map((o) => o.option_id) ?? [];

  const totals = buildOrderTotals({
    lineItems,
    fulfillmentOptions,
    selectedFulfillmentOptionIds: selectedFulfillmentIds,
  });

  const sessionId = (options.generateSessionId ?? defaultGenerateSessionId)();
  const now = (options.now ?? defaultNow)();
  const nowIso = unixToIso(now);

  const session: CheckoutSession = {
    id: sessionId,
    protocol: { version: apiVersion },
    status: "ready_for_payment",
    currency: input.currency,
    line_items: lineItems,
    fulfillment_options: fulfillmentOptions,
    totals,
    messages: [],
    links: options.defaultLinks ?? [],
    created_at: nowIso,
    updated_at: nowIso,
    capabilities: {
      ...(options.paymentHandlers.length > 0
        ? { payment: { handlers: options.paymentHandlers } }
        : {}),
      ...(options.baseCapabilities ?? {}),
    },
    ...(() => {
      const cb = asCompleteBuyer(input.buyer);
      return cb ? { buyer: cloneBuyer(cb) } : {};
    })(),
    ...(input.fulfillment_details !== undefined
      ? { fulfillment_details: input.fulfillment_details }
      : {}),
    ...(input.selected_fulfillment_options !== undefined
      ? { selected_fulfillment_options: input.selected_fulfillment_options }
      : {}),
    ...(input.metadata !== undefined ? { metadata: { ...input.metadata } } : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.expires_at !== undefined ? { expires_at: input.expires_at } : {}),
    ...(input.presentment_currency !== undefined
      ? { presentment_currency: input.presentment_currency }
      : {}),
  };

  // Let payment providers hook in (e.g. MP creates a preference).
  for (const provider of Object.values(options.paymentProviders)) {
    try {
      const out = await provider.onSessionCreated?.(session);
      if (out?.metadata) {
        session.metadata = { ...(session.metadata ?? {}), ...out.metadata };
      }
    } catch (err) {
      await options.state.release(CREATE_SCOPE, idempotencyKey);
      return internalError(
        `Payment provider ${provider.handlerId} failed onSessionCreated: ${asMessage(err)}`,
      );
    }
  }

  await options.state.saveSession(session);
  await options.hooks?.onSessionCreated?.(session);

  const response = jsonResponse(201, session);
  await options.state.complete(CREATE_SCOPE, idempotencyKey, {
    status: 201,
    body: session,
    headers: response.headers,
  });
  return response;
}

// --------------------------------------------------------------------------
// UPDATE
// --------------------------------------------------------------------------

export async function handleUpdateSession(
  req: AcpRequest,
  sessionId: string,
  options: FacilitatorOptions,
): Promise<AcpResponse> {
  if (req.method !== "POST") {
    return methodNotAllowed(
      validationFailed(`Method ${req.method} not allowed on /checkout_sessions/{id}.`),
    );
  }

  const pre = await preflightPost(req, UPDATE_SCOPE, options);
  if ("response" in pre) return pre.response;
  const { apiVersion, idempotencyKey } = pre.ok;

  const session = await options.state.loadSession(sessionId);
  if (!session) {
    await options.state.release(UPDATE_SCOPE, idempotencyKey);
    return notFound(sessionNotFound(sessionId));
  }

  if (
    session.status === "completed" ||
    session.status === "canceled" ||
    session.status === "expired"
  ) {
    await options.state.release(UPDATE_SCOPE, idempotencyKey);
    return errorResponse(409, {
      type: "invalid_request",
      code: "session_not_completable",
      message: `Cannot update session with status '${session.status}'.`,
    });
  }

  const raw = readBody(req);
  if (isAcpError(raw)) {
    await options.state.release(UPDATE_SCOPE, idempotencyKey);
    return badRequest(raw);
  }

  const parsed = CheckoutSessionUpdateRequest.safeParse(raw);
  if (!parsed.success) {
    await options.state.release(UPDATE_SCOPE, idempotencyKey);
    return badRequest(
      validationFailed(
        `Invalid CheckoutSession update request: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        parsed.error.issues[0]?.path.join(".") || undefined,
      ),
    );
  }
  const input = parsed.data;

  // If line_items are provided, re-resolve them.
  let lineItems: LineItem[] = session.line_items;
  if (input.line_items !== undefined) {
    const resolved = await resolveLineItems(
      input.line_items,
      input.currency ?? session.currency,
      options,
    );
    if (!resolved.ok) {
      await options.state.release(UPDATE_SCOPE, idempotencyKey);
      return badRequest(resolved.error);
    }
    lineItems = resolved.lineItems;
  }

  const currency = input.currency ?? session.currency;
  const fulfillmentDetails =
    input.fulfillment_details ?? session.fulfillment_details;
  const fulfillmentOptions = options.computeFulfillmentOptions
    ? await options.computeFulfillmentOptions({
        lineItems,
        ...(fulfillmentDetails !== undefined
          ? { fulfillmentDetails }
          : {}),
        currency,
        ...((input.locale ?? session.locale) !== undefined
          ? { locale: (input.locale ?? session.locale) as string }
          : {}),
      })
    : session.fulfillment_options;

  const selectedIds =
    (input.selected_fulfillment_options ?? session.selected_fulfillment_options ?? [])
      .map((o) => o.option_id);

  const totals = buildOrderTotals({
    lineItems,
    fulfillmentOptions,
    selectedFulfillmentOptionIds: selectedIds,
  });

  const updated: CheckoutSession = {
    ...session,
    protocol: { version: apiVersion },
    currency,
    line_items: lineItems,
    fulfillment_options: fulfillmentOptions,
    totals,
    updated_at: unixToIso((options.now ?? defaultNow)()),
    ...(() => {
      const merged = mergeBuyer(session.buyer, input.buyer);
      return merged ? { buyer: cloneBuyer(merged) } : {};
    })(),
    ...(input.fulfillment_details !== undefined
      ? { fulfillment_details: input.fulfillment_details }
      : {}),
    ...(input.selected_fulfillment_options !== undefined
      ? { selected_fulfillment_options: input.selected_fulfillment_options }
      : {}),
    ...(input.metadata !== undefined
      ? { metadata: { ...(session.metadata ?? {}), ...input.metadata } }
      : {}),
    ...(input.locale !== undefined ? { locale: input.locale } : {}),
    ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    ...(input.expires_at !== undefined ? { expires_at: input.expires_at } : {}),
  };

  await options.state.saveSession(updated);
  await options.hooks?.onSessionUpdated?.(updated);

  const response = jsonResponse(200, updated);
  await options.state.complete(UPDATE_SCOPE, idempotencyKey, {
    status: 200,
    body: updated,
    headers: response.headers,
  });
  return response;
}

// --------------------------------------------------------------------------
// GET
// --------------------------------------------------------------------------

export async function handleGetSession(
  req: AcpRequest,
  sessionId: string,
  options: FacilitatorOptions,
): Promise<AcpResponse> {
  if (req.method !== "GET") {
    return methodNotAllowed(
      validationFailed(`Method ${req.method} not allowed on /checkout_sessions/{id} GET.`),
    );
  }

  const pre = preflightGet(req, options);
  if ("response" in pre) return pre.response;

  const session = await options.state.loadSession(sessionId);
  if (!session) {
    return notFound(sessionNotFound(sessionId));
  }

  // If the session is already completed, attach the order from the order
  // store to mirror the `complete` response shape.
  if (session.status === "completed") {
    const order = await options.state.loadOrderBySession(sessionId);
    if (order) {
      return jsonResponse(200, { ...session, order });
    }
  }

  return jsonResponse(200, session);
}

// --------------------------------------------------------------------------
// COMPLETE
// --------------------------------------------------------------------------

export async function handleCompleteSession(
  req: AcpRequest,
  sessionId: string,
  options: FacilitatorOptions,
): Promise<AcpResponse> {
  if (req.method !== "POST") {
    return methodNotAllowed(
      validationFailed(`Method ${req.method} not allowed on /checkout_sessions/{id}/complete.`),
    );
  }

  const pre = await preflightPost(req, COMPLETE_SCOPE, options);
  if ("response" in pre) return pre.response;
  const { idempotencyKey } = pre.ok;

  const session = await options.state.loadSession(sessionId);
  if (!session) {
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return notFound(sessionNotFound(sessionId));
  }

  if (session.status === "completed") {
    // Idempotent re-complete: return the current session+order.
    const order = await options.state.loadOrderBySession(sessionId);
    const body = order ? { ...session, order } : session;
    await options.state.complete(COMPLETE_SCOPE, idempotencyKey, {
      status: 200,
      body,
      headers: { "Content-Type": "application/json" },
    });
    return jsonResponse(200, body);
  }
  if (session.status === "canceled" || session.status === "expired") {
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return errorResponse(409, {
      type: "invalid_request",
      code: "session_not_completable",
      message: `Cannot complete session with status '${session.status}'.`,
    });
  }

  const raw = readBody(req);
  if (isAcpError(raw)) {
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return badRequest(raw);
  }

  const parsed = CheckoutSessionCompleteRequest.safeParse(raw);
  if (!parsed.success) {
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return badRequest(
      validationFailed(
        `Invalid complete request: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        parsed.error.issues[0]?.path.join(".") || undefined,
      ),
    );
  }
  const input = parsed.data;

  // Find the registered payment provider matching the handler_id. If
  // handler_id is missing (purchase_order_number path), the provider list
  // must contain a single eligible PO provider.
  const handlerId = input.payment_data.handler_id;
  if (!handlerId) {
    // PO path — no payment processing, mark as pending_approval.
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return badRequest({
      type: "invalid_request",
      code: "validation_failed",
      message:
        "purchase_order_number flow not yet implemented in v0.1; supply payment_data.handler_id + instrument.",
    });
  }
  const provider = options.paymentProviders[handlerId];
  if (!provider) {
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return badRequest({
      type: "invalid_request",
      code: "unsupported_capability",
      message: `Payment handler '${handlerId}' is not registered with this facilitator.`,
      param: "payment_data.handler_id",
    });
  }

  // Apply buyer + payment_data updates to the session before attempting
  // payment so the payment provider sees a consistent snapshot.
  const completeBuyer = asCompleteBuyer(input.buyer);
  const sessionBeforePay: CheckoutSession = {
    ...session,
    status: "complete_in_progress",
    ...(completeBuyer ? { buyer: cloneBuyer(completeBuyer) } : {}),
    updated_at: unixToIso((options.now ?? defaultNow)()),
  };
  await options.state.saveSession(sessionBeforePay);

  let paymentResult: Awaited<ReturnType<typeof provider.processPayment>>;
  try {
    paymentResult = await provider.processPayment({
      session: sessionBeforePay,
      paymentData: input.payment_data,
    });
  } catch (err) {
    // Roll session status back so a retry can proceed with a fresh
    // Idempotency-Key.
    await options.state.saveSession(session);
    await options.state.release(COMPLETE_SCOPE, idempotencyKey);
    return internalError(
      `Payment provider ${handlerId} threw: ${asMessage(err)}`,
    );
  }

  if (!paymentResult.success) {
    await options.state.saveSession(session);
    const code = paymentResult.code || "payment_declined";
    const errBody = errorResponse(402, {
      type: "processing_error",
      code,
      message: paymentResult.message,
      ...(paymentResult.details !== undefined
        ? { details: paymentResult.details }
        : {}),
    });
    await options.state.complete(COMPLETE_SCOPE, idempotencyKey, {
      status: errBody.status,
      body: errBody.body,
      headers: errBody.headers,
    });
    return errBody;
  }

  // Build the order. Hooks may attach metadata (e.g. AR-fiscal CAE).
  const orderId = (options.generateOrderId ?? defaultGenerateOrderId)();
  const now = (options.now ?? defaultNow)();
  const nowIso = unixToIso(now);

  const baseOrder: Order = {
    type: "order",
    id: orderId,
    checkout_session_id: sessionId,
    permalink_url: buildOrderPermalinkUrl(orderId),
    status: "confirmed",
    totals: sessionBeforePay.totals,
    metadata: {
      payment_provider_id: paymentResult.paymentId,
      payment_handler_id: handlerId,
      ...(paymentResult.metadata ?? {}),
    },
    ...(input.client_reference_id !== undefined
      ? { client_reference_id: input.client_reference_id }
      : {}),
  };

  let order = baseOrder;
  try {
    const hookOut = await options.hooks?.onOrderConfirmed?.({
      session: sessionBeforePay,
      order,
    });
    if (hookOut?.metadata) {
      order = {
        ...order,
        metadata: { ...(order.metadata ?? {}), ...hookOut.metadata },
      };
    }
  } catch (err) {
    // Hook failure is logged but doesn't reverse the payment. The order is
    // saved with an error marker so the host can surface this in retries.
    order = {
      ...order,
      metadata: {
        ...(order.metadata ?? {}),
        on_order_confirmed_error: asMessage(err),
      },
    };
  }

  await options.state.saveOrder(order);

  const completedSession: CheckoutSession = {
    ...sessionBeforePay,
    status: "completed",
    updated_at: nowIso,
  };
  await options.state.saveSession(completedSession);

  const responseBody = { ...completedSession, order };

  // Optional outbound webhook emission.
  await emitOrderWebhook("order_create", responseBody.order, options);

  const response = jsonResponse(200, responseBody);
  await options.state.complete(COMPLETE_SCOPE, idempotencyKey, {
    status: 200,
    body: responseBody,
    headers: response.headers,
  });
  return response;
}

// --------------------------------------------------------------------------
// CANCEL
// --------------------------------------------------------------------------

export async function handleCancelSession(
  req: AcpRequest,
  sessionId: string,
  options: FacilitatorOptions,
): Promise<AcpResponse> {
  if (req.method !== "POST") {
    return methodNotAllowed(
      validationFailed(`Method ${req.method} not allowed on /checkout_sessions/{id}/cancel.`),
    );
  }

  const pre = await preflightPost(req, CANCEL_SCOPE, options);
  if ("response" in pre) return pre.response;
  const { idempotencyKey } = pre.ok;

  const session = await options.state.loadSession(sessionId);
  if (!session) {
    await options.state.release(CANCEL_SCOPE, idempotencyKey);
    return notFound(sessionNotFound(sessionId));
  }
  if (
    session.status === "completed" ||
    session.status === "canceled" ||
    session.status === "expired"
  ) {
    await options.state.release(CANCEL_SCOPE, idempotencyKey);
    return errorResponse(405, sessionNotCancelable(sessionId, String(session.status)));
  }

  const raw = readBody(req);
  if (isAcpError(raw)) {
    await options.state.release(CANCEL_SCOPE, idempotencyKey);
    return badRequest(raw);
  }
  const parsed = CheckoutSessionCancelRequest.safeParse(raw);
  if (!parsed.success) {
    await options.state.release(CANCEL_SCOPE, idempotencyKey);
    return badRequest(
      validationFailed(
        `Invalid cancel request: ${parsed.error.issues[0]?.message ?? "unknown"}`,
      ),
    );
  }

  const canceled: CheckoutSession = {
    ...session,
    status: "canceled" as CheckoutSessionStatus,
    updated_at: unixToIso((options.now ?? defaultNow)()),
  };
  await options.state.saveSession(canceled);
  await options.hooks?.onSessionCanceled?.({
    session: canceled,
    ...(parsed.data?.reason !== undefined ? { reason: parsed.data.reason } : {}),
  });

  const response = jsonResponse(200, canceled);
  await options.state.complete(CANCEL_SCOPE, idempotencyKey, {
    status: 200,
    body: canceled,
    headers: response.headers,
  });
  return response;
}

// --------------------------------------------------------------------------
// Internal helpers
// --------------------------------------------------------------------------

function isAcpError(v: unknown): v is AcpError {
  return (
    typeof v === "object" &&
    v !== null &&
    "type" in v &&
    "code" in v &&
    "message" in v
  );
}

function defaultNow(): number {
  return Math.floor(Date.now() / 1000);
}

function unixToIso(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString();
}

function asMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

/**
 * Resolve a list of `LineItemCreateInput` against the catalog. Builds full
 * `LineItem` objects with totals. Returns either the list or an `AcpError`.
 */
async function resolveLineItems(
  inputs: LineItemCreateInput[],
  currency: string,
  options: FacilitatorOptions,
): Promise<
  | { ok: true; lineItems: LineItem[] }
  | { ok: false; error: AcpError }
> {
  const lineItems: LineItem[] = [];
  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    if (!input) continue;
    const resolved = await options.catalog.resolveItem(input.id);
    if (!resolved) {
      return {
        ok: false,
        error: validationFailed(
          `Item '${input.id}' was not found in the catalog.`,
          `line_items[${i}].id`,
        ),
      };
    }
    if (resolved.currency !== currency) {
      return {
        ok: false,
        error: {
          type: "invalid_request",
          code: "unsupported_currency",
          message: `Item '${input.id}' is sold in '${resolved.currency}', not '${currency}'.`,
          param: `line_items[${i}].id`,
        },
      };
    }
    if (
      resolved.available_quantity !== undefined &&
      resolved.available_quantity < input.quantity
    ) {
      return {
        ok: false,
        error: validationFailed(
          `Item '${input.id}' has only ${resolved.available_quantity} available; requested ${input.quantity}.`,
          `line_items[${i}].quantity`,
        ),
      };
    }
    const totals = buildLineItemTotals({
      unitAmount: resolved.unit_amount,
      quantity: input.quantity,
    });
    const li: LineItem = {
      id: `li_${i}_${input.id}`,
      item: {
        id: resolved.id,
        name: resolved.name,
        unit_amount: resolved.unit_amount,
      },
      quantity: input.quantity,
      ...(resolved.name !== undefined ? { name: resolved.name } : {}),
      ...(resolved.description !== undefined
        ? { description: resolved.description }
        : {}),
      ...(resolved.images !== undefined ? { images: resolved.images } : {}),
      unit_amount: resolved.unit_amount,
      ...(resolved.sku !== undefined ? { sku: resolved.sku } : {}),
      ...(resolved.variant_id !== undefined
        ? { variant_id: resolved.variant_id }
        : {}),
      ...(resolved.category !== undefined ? { category: resolved.category } : {}),
      ...(resolved.weight !== undefined ? { weight: resolved.weight } : {}),
      ...(resolved.dimensions !== undefined
        ? { dimensions: resolved.dimensions }
        : {}),
      ...(resolved.available_quantity !== undefined
        ? { available_quantity: resolved.available_quantity }
        : {}),
      ...(resolved.seller_name !== undefined
        ? {
            marketplace_seller_details: { name: resolved.seller_name },
          }
        : {}),
      ...(resolved.tax_exempt !== undefined
        ? { tax_exempt: resolved.tax_exempt }
        : {}),
      totals,
    };
    lineItems.push(li);
  }
  return { ok: true, lineItems };
}

function cloneBuyer<T>(b: T): T {
  return JSON.parse(JSON.stringify(b)) as T;
}

/**
 * The create-request `buyer` is `Buyer.partial()`, but `CheckoutSession.buyer`
 * requires `email`. Returns the buyer cast to `Buyer` only if email is
 * non-empty, otherwise `null`.
 */
function asCompleteBuyer(b: unknown): Buyer | null {
  if (!b || typeof b !== "object") return null;
  const email = (b as { email?: unknown }).email;
  if (typeof email !== "string" || email.length === 0) return null;
  return b as Buyer;
}

/**
 * Merge the existing session buyer with an update patch. Returns the merged
 * buyer if it has a non-empty email, otherwise `null`.
 */
function mergeBuyer(
  existing: Buyer | undefined,
  patch: unknown,
): Buyer | null {
  if (!patch || typeof patch !== "object") return null;
  const merged = { ...(existing ?? {}), ...(patch as Record<string, unknown>) };
  return asCompleteBuyer(merged);
}

function buildOrderPermalinkUrl(orderId: string): string {
  // Default uses a placeholder host. Hosts override via hooks.
  return `https://example.invalid/orders/${orderId}`;
}

async function emitOrderWebhook(
  type: "order_create" | "order_update",
  order: Order,
  options: FacilitatorOptions,
): Promise<void> {
  const hook = options.hooks?.emitWebhook;
  if (!hook) return;
  if (!options.webhookSecret) return;

  const payload = { type, data: order };
  const rawBody = JSON.stringify(payload);
  const { signWebhook } = await import("../webhook");
  const { signature, timestamp } = await signWebhook({
    secret: options.webhookSecret,
    rawBody,
  });
  await hook({ type, payload, signature, timestamp, rawBody });
}
