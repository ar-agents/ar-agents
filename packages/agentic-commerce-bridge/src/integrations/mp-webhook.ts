// MercadoPago → ACP webhook bridge.
//
// MP emits webhooks for `payment.created`, `payment.updated`, etc. with
// `{ topic: "payment", resource: "https://api.mercadopago.com/v1/payments/{id}" }`
// or the v2 shape `{ type: "payment", action: "payment.updated", data: { id } }`.
//
// This module parses MP's webhook envelope and translates the resulting
// payment state into an ACP `WebhookEvent` (`order_update`) that the
// merchant can re-emit to the agent.
//
// Duck-typed: the host provides `lookupPayment` and `loadOrderByMpPaymentId`
// (or by external_reference, which is the session id).

import type { Order } from "../schemas/order";
import type { WebhookEvent } from "../schemas/webhook";
import type { MpPaymentResponse } from "./mp";

export interface MpWebhookV1 {
  topic?: string;
  resource?: string;
  id?: string | number;
  user_id?: string | number;
}

export interface MpWebhookV2 {
  type?: string;
  action?: string;
  data?: { id?: string | number };
  user_id?: string | number;
  date_created?: string;
}

export type MpWebhookPayload = MpWebhookV1 | MpWebhookV2;

/**
 * Parse the `id` of the resource being notified from any MP webhook envelope.
 * Returns the payment id as a string, or `null` if this notification is not
 * about a payment we recognize.
 */
export function parseMpPaymentIdFromWebhook(
  payload: MpWebhookPayload,
): string | null {
  // v2 shape (preferred)
  const v2 = payload as MpWebhookV2;
  if (v2.type === "payment" && v2.data?.id !== undefined) {
    return String(v2.data.id);
  }
  // v1 shape (legacy)
  const v1 = payload as MpWebhookV1;
  if (v1.topic === "payment") {
    if (v1.id !== undefined) return String(v1.id);
    // Some old shapes include `resource: "https://api.mp.com/v1/payments/<id>"`.
    if (typeof v1.resource === "string") {
      const match = /\/payments\/(\d+)/.exec(v1.resource);
      if (match) return match[1] ?? null;
    }
  }
  return null;
}

/**
 * Map MP payment status → ACP order status. The mapping is intentionally
 * conservative — anything other than the well-known set falls back to
 * `processing`.
 */
export function mpStatusToAcpOrderStatus(mpStatus: string):
  | "created"
  | "confirmed"
  | "processing"
  | "manual_review"
  | "completed"
  | "canceled"
  | "refunded"
  | "partially_refunded" {
  switch (mpStatus) {
    case "approved":
      return "confirmed";
    case "in_process":
    case "pending":
      return "processing";
    case "in_mediation":
    case "charged_back":
      return "manual_review";
    case "rejected":
    case "cancelled":
      return "canceled";
    case "refunded":
      return "refunded";
    case "partially_refunded":
      return "partially_refunded";
    case "authorized":
      return "confirmed";
    default:
      return "processing";
  }
}

export interface BuildAcpEventOptions {
  /** Look up an Order by MP payment id (or by external_reference == session.id). */
  loadOrder: (args: {
    mpPaymentId: string;
    externalReference?: string;
  }) => Promise<Order | null>;
  /** Look up the MP payment object. */
  lookupPayment: (paymentId: string) => Promise<MpPaymentResponse | null>;
}

/**
 * Translate an inbound MP webhook into a typed ACP `WebhookEvent`. Returns
 * `null` if the notification doesn't pertain to an order we own (e.g.
 * unrelated app, missing order, payment for a non-ACP preference).
 *
 * The merchant calls `signWebhook` on the result and forwards it to the
 * agent's webhook URL. Doing both at once is the most common pattern; see
 * `bridgeMpWebhookToAgent`.
 */
export async function buildAcpEventFromMpWebhook(
  payload: MpWebhookPayload,
  options: BuildAcpEventOptions,
): Promise<WebhookEvent | null> {
  const mpPaymentId = parseMpPaymentIdFromWebhook(payload);
  if (!mpPaymentId) return null;

  const payment = await options.lookupPayment(mpPaymentId);
  if (!payment) return null;

  const args: { mpPaymentId: string; externalReference?: string } = {
    mpPaymentId,
  };
  if (payment.external_reference !== undefined) {
    args.externalReference = payment.external_reference;
  }
  const order = await options.loadOrder(args);
  if (!order) return null;

  const updatedStatus = mpStatusToAcpOrderStatus(payment.status);
  const updatedOrder: Order = {
    ...order,
    status: updatedStatus,
    metadata: {
      ...(order.metadata ?? {}),
      mp_payment_id: String(payment.id),
      mp_status: payment.status,
      ...(payment.status_detail !== undefined
        ? { mp_status_detail: payment.status_detail }
        : {}),
    },
  };

  return {
    type: "order_update",
    data: updatedOrder,
  };
}
