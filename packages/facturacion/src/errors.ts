/**
 * Errors emitted by `@ar-agents/facturacion` adapters and helpers.
 *
 * Extends `ArAgentsError` from `@ar-agents/core` so the family contract
 * (code / retryable / context) is uniform.
 */

import { ArAgentsError } from "@ar-agents/core";
import type { WsfeError } from "./types";

export type FacturacionErrorCode =
  | "wsfe_not_configured"
  | "wsfe_validation_error"
  | "wsfe_authentication_failed"
  | "wsfe_request_rejected"
  | "wsfe_service_unavailable"
  | "wsfe_unknown_error";

const RETRYABLE_CODES: Record<FacturacionErrorCode, boolean> = {
  wsfe_not_configured: false,
  wsfe_validation_error: false,
  wsfe_authentication_failed: false,
  wsfe_request_rejected: false,
  wsfe_service_unavailable: true,
  wsfe_unknown_error: false,
};

export class FacturacionError extends ArAgentsError {
  override readonly code: FacturacionErrorCode;
  readonly details?: unknown;

  constructor(code: FacturacionErrorCode, message: string, details?: unknown) {
    super(message, {
      code,
      retryable: RETRYABLE_CODES[code] ?? false,
      context: details !== undefined ? { details } : {},
    });
    this.name = "FacturacionError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Thrown when the WsfeClient is constructed without the required cert/key
 * or CUIT. Surface the message verbatim — it's actionable.
 */
export class WsfeNotConfiguredError extends FacturacionError {
  constructor() {
    super(
      "wsfe_not_configured",
      "WSFE no está configurado. Para emitir facturas: pasá `certPath` (o `certPem`), `keyPath` (o `keyPem`), y `cuit` al `WsfeClient`. El certificado debe estar autorizado para el servicio `wsfe` en tu cuenta AFIP/ARCA (Administrador de Relaciones → Nueva Relación → AFIP → WebServices → Servicio Web de Facturación Electrónica).",
    );
    this.name = "WsfeNotConfiguredError";
  }
}

/**
 * Thrown when the request fails AFIP's pre-emission validation (e.g., the
 * `ImpTotal` doesn't equal the sum of components). Surface the message —
 * it tells the user exactly what to fix.
 */
export class WsfeValidationError extends FacturacionError {
  constructor(message: string, public errors?: WsfeError[]) {
    super("wsfe_validation_error", message, errors);
    this.name = "WsfeValidationError";
  }
}

/**
 * Thrown when AFIP rejects the request (Resultado: "R"). Carries the
 * top-level errors and per-detail observaciones for diagnosis.
 */
export class WsfeRejectedError extends FacturacionError {
  constructor(
    message: string,
    public errors: WsfeError[],
    public observaciones: WsfeError[],
  ) {
    super("wsfe_request_rejected", message, { errors, observaciones });
    this.name = "WsfeRejectedError";
  }
}
