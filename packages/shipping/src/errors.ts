/**
 * Errors emitted by `@ar-agents/shipping` adapters and helpers.
 */

import type { Carrier } from "./types";

export type ShippingErrorCode =
  | "shipping_not_configured"
  | "shipping_invalid_input"
  | "shipping_carrier_error"
  | "shipping_not_supported"
  | "shipping_unknown_error";

export class ShippingError extends Error {
  constructor(
    public code: ShippingErrorCode,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}

/**
 * Thrown when a tool is called against an adapter that hasn't been
 * configured. Surface the message — it tells the user how to enable.
 */
export class ShippingNotConfiguredError extends ShippingError {
  constructor(public carrier: Carrier) {
    super(
      "shipping_not_configured",
      `${carrier} no está configurado. Para activar: pasá un \`${carrier === "andreani" ? "AndreaniAdapter" : carrier === "oca" ? "OcaAdapter" : "CorreoAdapter"}\` con credenciales (cliente + API key) a \`shippingTools()\`. Mientras tanto, podés usar \`MockShippingAdapter\` para desarrollo local sin credenciales.`,
    );
    this.name = "ShippingNotConfiguredError";
  }
}

/**
 * Thrown when an operation isn't supported by a specific carrier (e.g.
 * cancelar after pickup is OCA-only).
 */
export class ShippingNotSupportedError extends ShippingError {
  constructor(public carrier: Carrier, public operation: string) {
    super(
      "shipping_not_supported",
      `${carrier} no soporta '${operation}' en su API actual.`,
    );
    this.name = "ShippingNotSupportedError";
  }
}

/**
 * Thrown when the carrier's API returns a structured error.
 */
export class ShippingCarrierError extends ShippingError {
  constructor(
    public carrier: Carrier,
    message: string,
    public httpStatus?: number,
    public carrierErrorCode?: string,
    details?: unknown,
  ) {
    super("shipping_carrier_error", `${carrier}: ${message}`, details);
    this.name = "ShippingCarrierError";
  }
}
