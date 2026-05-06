/**
 * 3DS (Strong Customer Authentication) analyzer for Mercado Pago Payments.
 *
 * # Background
 *
 * 3DS (3-D Secure / "verified by Visa", "Mastercard SecureCode") is the
 * issuer-side 2FA layer for card payments. MP triggers it automatically when:
 * - The card's issuer requires it (driven by MCC + amount + risk).
 * - The buyer's country mandates it (MX, BR, several EU countries).
 *
 * In Argentina (MLA), 3DS is OPTIONAL but strongly recommended for
 * high-value transactions and is required for some FCE MiPyMEs flows.
 *
 * # What this module does
 *
 * Given a `Payment` returned by `getPayment()` or `createPayment()`, derive
 * a normalized `ThreeDSInfo` telling you:
 * - Whether 3DS was triggered at all
 * - Whether it was frictionless (no buyer interaction) or required a challenge
 * - The challenge URL (if any) you must redirect the buyer to
 * - A human-readable description suitable for surfacing to the user
 *
 * # When to use
 *
 * Call `analyze3DS(payment)` after EVERY `createPayment()` for credit cards.
 * If `info.challengeUrl !== null`, you MUST redirect the buyer there before
 * the payment can complete — otherwise it stays in `pending` forever.
 */

import type { Payment } from "./types";
import type { ThreeDSInfo, ThreeDSStatus } from "./types";

/**
 * Analyze a Payment's 3DS state. Pure function, no I/O.
 */
export function analyze3DS(payment: Payment): ThreeDSInfo {
  const raw = payment as unknown as Record<string, unknown>;
  const mode = (raw.three_d_secure_mode as string | undefined) ?? null;
  const statusDetail = (payment.status_detail as string | null) ?? null;

  // No 3DS field at all → not triggered for this payment.
  if (!mode || mode === "not_supported" || mode === "off") {
    return {
      status: "not_required",
      mode,
      challengeUrl: null,
      description:
        "3DS no fue requerido para este pago (riesgo bajo o emisor sin 3DS habilitado).",
    };
  }

  // MP exposes the challenge URL inside `three_ds_info.external_resource_url`
  // when one is required.
  const threeDsInfo = (raw.three_ds_info as
    | { external_resource_url?: string; status?: string; creq?: string }
    | undefined) ?? undefined;

  if (statusDetail === "pending_challenge" && threeDsInfo?.external_resource_url) {
    return {
      status: "challenge_required",
      mode,
      challengeUrl: threeDsInfo.external_resource_url,
      description:
        "El emisor de la tarjeta requirió autenticación 3DS. Redirigí al comprador a challengeUrl para completar el desafío. El pago queda pending hasta que lo haga.",
    };
  }

  // Approved + 3DS field present → frictionless flow (issuer authorized
  // without challenging the buyer).
  if (payment.status === "approved") {
    return {
      status: "frictionless",
      mode,
      challengeUrl: null,
      description: "3DS frictionless: el emisor autorizó sin desafiar al comprador.",
    };
  }

  // Rejected with 3DS-related status_detail.
  if (
    payment.status === "rejected" &&
    typeof statusDetail === "string" &&
    statusDetail.includes("3ds")
  ) {
    return {
      status: "rejected",
      mode,
      challengeUrl: null,
      description: `Autenticación 3DS rechazada (${statusDetail}). El comprador debe usar otra tarjeta o validarla con el emisor.`,
    };
  }

  return {
    status: "unknown" as ThreeDSStatus,
    mode,
    challengeUrl: threeDsInfo?.external_resource_url ?? null,
    description:
      "No se pudo determinar el estado 3DS — revisar payment.three_d_secure_mode + payment.status_detail manualmente.",
  };
}
