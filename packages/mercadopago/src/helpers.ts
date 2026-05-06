/**
 * Pure helpers — no I/O, deterministic, fast. Importable directly from the
 * package root or used via the agent tools (`compute_marketplace_fee`,
 * `explain_payment_status`).
 */

import type { Payment } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace fee calculator
// ─────────────────────────────────────────────────────────────────────────────

export interface MarketplaceFeeRule {
  /** Fixed fee in ARS (added on top of percentage). */
  flatArs?: number;
  /** Percentage of the transaction amount (0-100). */
  percent?: number;
  /** Minimum fee floor in ARS. */
  minArs?: number;
  /** Maximum fee cap in ARS. */
  maxArs?: number;
  /** Round to nearest peso (default true). */
  round?: boolean;
}

/**
 * Compute the exact `marketplace_fee` (in ARS) to pass to `create_order` /
 * `create_payment_preference` for a given transaction amount and fee rule.
 *
 * @example
 * // 5% fee with $50 floor and $5000 cap
 * computeMarketplaceFee(10000, { percent: 5, minArs: 50, maxArs: 5000 })
 * // → 500
 *
 * computeMarketplaceFee(500, { percent: 5, minArs: 50 })
 * // → 50 (would be 25 by percent, floor lifts to 50)
 *
 * @example
 * // Flat $200 + 2%
 * computeMarketplaceFee(10000, { flatArs: 200, percent: 2 })
 * // → 400
 */
export function computeMarketplaceFee(
  amountArs: number,
  rule: MarketplaceFeeRule,
): number {
  if (amountArs <= 0) return 0;
  const percentPart = (rule.percent ?? 0) > 0 ? amountArs * (rule.percent! / 100) : 0;
  const flatPart = rule.flatArs ?? 0;
  let fee = percentPart + flatPart;
  if (rule.minArs !== undefined) fee = Math.max(fee, rule.minArs);
  if (rule.maxArs !== undefined) fee = Math.min(fee, rule.maxArs);
  if (fee > amountArs) fee = amountArs; // can't charge more than the transaction
  if (rule.round !== false) fee = Math.round(fee);
  return fee;
}

// ─────────────────────────────────────────────────────────────────────────────
// Payment status explainer
// ─────────────────────────────────────────────────────────────────────────────

export interface PaymentStatusExplanation {
  /** Spanish summary of the current state — surface to user. */
  summary: string;
  /** What the agent should do next. Actionable guidance. */
  recommendedAction: string;
  /**
   * Whether this state is FINAL (no further changes) or transient
   * (can still flip with another webhook).
   */
  final: boolean;
  /** Whether the buyer paid successfully (approved). */
  paid: boolean;
  /**
   * Whether this is a recoverable rejection (user can retry with another
   * card / different installments) vs a hard rejection (stop trying).
   */
  retryable: boolean;
}

const STATUS_DETAIL_MAP: Record<
  string,
  { summary: string; recommendedAction: string; retryable: boolean }
> = {
  // Approved
  accredited: {
    summary: "Pago aprobado y acreditado.",
    recommendedAction: "Confirmar al cliente y continuar con el flujo (envío, factura).",
    retryable: false,
  },
  partially_refunded: {
    summary: "Pago aprobado con reembolso parcial.",
    recommendedAction: "Mostrar el monto neto y el reembolso. Verificar inventario si corresponde.",
    retryable: false,
  },

  // Pending
  pending_contingency: {
    summary: "Pago en proceso por contingencia. MP está procesando — puede demorar minutos a horas.",
    recommendedAction: "No reintentar todavía. Esperar webhook de actualización (puede demorar 24h máx).",
    retryable: false,
  },
  pending_review_manual: {
    summary: "Pago en revisión manual por el equipo de seguridad de MP.",
    recommendedAction: "No reintentar. MP responderá con webhook en 24-72h. Avisar al cliente sobre la demora.",
    retryable: false,
  },
  pending_waiting_payment: {
    summary: "Esperando que el comprador complete el pago (típico de account_money / boleto / Rapipago).",
    recommendedAction: "Mostrar instrucciones de pago. MP avisará por webhook cuando se complete.",
    retryable: false,
  },
  pending_waiting_transfer: {
    summary: "Esperando confirmación de transferencia bancaria.",
    recommendedAction: "Esperar webhook. Sin acción del agente.",
    retryable: false,
  },
  pending_challenge: {
    summary: "El emisor de la tarjeta requirió autenticación 3DS. El comprador debe completar el desafío.",
    recommendedAction: "Redirigir al comprador a `payment.three_ds_info.external_resource_url` (usá analyze_payment_3ds para obtenerlo).",
    retryable: false,
  },

  // Rejected — RETRYABLE (user can fix and try again)
  cc_rejected_bad_filled_card_number: {
    summary: "El número de tarjeta es incorrecto.",
    recommendedAction: "Pedir al cliente que verifique el número. Reintentable.",
    retryable: true,
  },
  cc_rejected_bad_filled_security_code: {
    summary: "El CVV es incorrecto.",
    recommendedAction: "Pedir el CVV nuevamente. Reintentable.",
    retryable: true,
  },
  cc_rejected_bad_filled_date: {
    summary: "La fecha de vencimiento es incorrecta.",
    recommendedAction: "Pedir al cliente que verifique mes/año. Reintentable.",
    retryable: true,
  },
  cc_rejected_bad_filled_other: {
    summary: "Algún dato de la tarjeta es incorrecto.",
    recommendedAction: "Pedir al cliente que revise todos los datos. Reintentable.",
    retryable: true,
  },
  cc_rejected_call_for_authorize: {
    summary: "El emisor requiere que el cliente autorice el pago llamando al banco.",
    recommendedAction: "Mostrar el teléfono del banco emisor (usá list_issuers para obtenerlo). Reintentable después de la llamada.",
    retryable: true,
  },
  cc_rejected_card_disabled: {
    summary: "La tarjeta está inhabilitada por el banco emisor.",
    recommendedAction: "El cliente debe contactar a su banco. Probar con otra tarjeta. Reintentable con otra tarjeta.",
    retryable: true,
  },
  cc_rejected_insufficient_amount: {
    summary: "Saldo insuficiente en la tarjeta.",
    recommendedAction: "Sugerir tarjeta alternativa o monto menor. Reintentable.",
    retryable: true,
  },
  cc_rejected_invalid_installments: {
    summary: "El emisor no soporta esa cantidad de cuotas para esta tarjeta.",
    recommendedAction: "Llamar a calculate_installments para ver opciones válidas y sugerir otra. Reintentable.",
    retryable: true,
  },
  cc_rejected_other_reason: {
    summary: "Pago rechazado por razón no especificada del emisor.",
    recommendedAction: "Sugerir otra tarjeta o método de pago. Reintentable con otra tarjeta.",
    retryable: true,
  },

  // Rejected — NON-RETRYABLE (don't retry the same card)
  cc_rejected_blacklist: {
    summary: "Pago rechazado por blacklist de seguridad de MP. NO REINTENTAR con esta tarjeta.",
    recommendedAction: "Sugerir un método de pago alternativo (account_money, otra tarjeta de otro titular).",
    retryable: false,
  },
  cc_rejected_high_risk: {
    summary: "Rechazo por análisis de riesgo de MP. La tarjeta es válida pero MP detectó fraude potencial.",
    recommendedAction: "Sugerir otro medio de pago o pedirle al cliente que verifique su identidad en MP.",
    retryable: false,
  },
  cc_rejected_max_attempts: {
    summary: "Excedió el número máximo de intentos con esta tarjeta.",
    recommendedAction: "Pedir al cliente que use otra tarjeta. NO REINTENTAR la misma.",
    retryable: false,
  },
  cc_rejected_duplicated_payment: {
    summary: "Ya se procesó un pago idéntico en los últimos minutos (deduplicación de MP).",
    recommendedAction: "Verificar con search_payments si el pago anterior se acreditó. Sin acción adicional necesaria.",
    retryable: false,
  },

  // Cancelled / refunded / mediation
  by_collector: {
    summary: "El vendedor canceló el pago.",
    recommendedAction: "Sin acción. Estado final.",
    retryable: false,
  },
  by_payer: {
    summary: "El comprador canceló el pago.",
    recommendedAction: "Sin acción. Estado final.",
    retryable: false,
  },
  refunded: {
    summary: "Pago reembolsado al comprador.",
    recommendedAction: "Estado final. Reflejar el reembolso en tu sistema.",
    retryable: false,
  },
  charged_back: {
    summary: "Contracargo (chargeback) iniciado por el banco emisor.",
    recommendedAction: "Revisar list_payment_disputes para responder. Surface al equipo de ops.",
    retryable: false,
  },
};

/**
 * Human-readable explanation of a Payment's current state — derives summary,
 * recommended action, finality, and whether the rejection is retryable from
 * `payment.status` + `payment.status_detail`.
 *
 * Pure function. Use the output to drive agent decisions ("¿reintento?
 * ¿le digo al cliente que cambie de tarjeta?") without having to memorize
 * every MP status_detail code.
 */
export function explainPaymentStatus(payment: Payment): PaymentStatusExplanation {
  const status = payment.status as string;
  const statusDetail = (payment.status_detail as string | null) ?? "";

  const detail = STATUS_DETAIL_MAP[statusDetail];
  if (detail) {
    const isFinal =
      status === "approved" ||
      status === "rejected" ||
      status === "cancelled" ||
      status === "refunded" ||
      status === "charged_back";
    return {
      summary: detail.summary,
      recommendedAction: detail.recommendedAction,
      final: isFinal,
      paid: status === "approved",
      retryable: detail.retryable,
    };
  }

  // Fallbacks by top-level status
  switch (status) {
    case "approved":
      return {
        summary: "Pago aprobado.",
        recommendedAction: "Continuar con el flujo posterior (envío, factura, notificación).",
        final: true,
        paid: true,
        retryable: false,
      };
    case "authorized":
      return {
        summary: "Pago autorizado pero no capturado (auth-only).",
        recommendedAction: "Llamar a capture_payment cuando completés el servicio. Vence en 7 días si no capturás.",
        final: false,
        paid: false,
        retryable: false,
      };
    case "in_process":
      return {
        summary: "Pago en proceso.",
        recommendedAction: "Esperar webhook. Sin acción inmediata.",
        final: false,
        paid: false,
        retryable: false,
      };
    case "in_mediation":
      return {
        summary: "Pago en mediación con MP por disputa del comprador.",
        recommendedAction: "Revisar list_payment_disputes y responder via dashboard.",
        final: false,
        paid: false,
        retryable: false,
      };
    case "pending":
      return {
        summary: "Pago pendiente. El comprador no completó el pago todavía o MP está procesando.",
        recommendedAction: "Esperar webhook (puede demorar minutos a 72h según el método).",
        final: false,
        paid: false,
        retryable: false,
      };
    case "rejected":
      return {
        summary: `Pago rechazado (status_detail: ${statusDetail || "no especificado"}).`,
        recommendedAction: "Verificar status_detail. Considerar otro método de pago.",
        final: true,
        paid: false,
        retryable: true,
      };
    case "cancelled":
      return {
        summary: "Pago cancelado.",
        recommendedAction: "Estado final. Sin acción.",
        final: true,
        paid: false,
        retryable: false,
      };
    case "refunded":
      return {
        summary: "Pago reembolsado.",
        recommendedAction: "Estado final. Reflejar el reembolso.",
        final: true,
        paid: false,
        retryable: false,
      };
    case "charged_back":
      return {
        summary: "Pago con contracargo del banco.",
        recommendedAction: "Surfacear a ops. Revisar disputas.",
        final: true,
        paid: false,
        retryable: false,
      };
    default:
      return {
        summary: `Status no reconocido: '${status}'.`,
        recommendedAction: "Inspeccionar payment.status + payment.status_detail manualmente.",
        final: false,
        paid: false,
        retryable: false,
      };
  }
}
