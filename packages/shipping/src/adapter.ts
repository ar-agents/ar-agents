/**
 * Adapter contract for shipping carriers. Implement to wire any AR carrier
 * (Andreani, OCA, Correo, your own private courier).
 *
 * # Why an adapter?
 *
 * Each AR carrier has a wildly different API: Andreani is REST/JSON,
 * OCA is SOAP/XML legacy, Correo Argentino has yet another shape.
 * The adapter pattern means callers always work in the normalized
 * `QuoteOption` / `ShipmentCreated` / `TrackingResult` types, and the
 * adapter handles translation.
 *
 * Two ready-to-use adapters ship:
 * - `UnconfiguredShippingAdapter` — always-fail, safe to call without setup.
 * - `MockShippingAdapter` — in-memory deterministic responses, useful for
 *   tests and demos when you don't have carrier credentials yet.
 *
 * Real-carrier adapters: `AndreaniAdapter`, `OcaAdapter`, `CorreoAdapter`.
 */

import type {
  Branch,
  Carrier,
  CancelResult,
  CreateShipmentInput,
  QuoteInput,
  QuoteOption,
  ShipmentCreated,
  TrackingResult,
} from "./types";
import { ShippingNotConfiguredError } from "./errors";

/**
 * The adapter interface. All methods may throw — the agent tools wrap
 * thrown errors into `{ available: false, error }` shapes so the agent
 * never crashes mid-conversation.
 */
export interface ShippingAdapter {
  readonly carrier: Carrier;

  cotizar(input: QuoteInput): Promise<QuoteOption>;
  crear(input: CreateShipmentInput): Promise<ShipmentCreated>;
  trackear(trackingNumber: string): Promise<TrackingResult>;
  cancelar(trackingNumber: string): Promise<CancelResult>;
  listarSucursales(params: { postalCode: string; limit?: number }): Promise<Branch[]>;
}

/**
 * Always-fail adapter. Tools wrap calls with a check; when this is the
 * adapter, they return `{ available: false, error: <setup instructions> }`.
 */
export class UnconfiguredShippingAdapter implements ShippingAdapter {
  constructor(public readonly carrier: Carrier = "andreani") {}

  async cotizar(): Promise<QuoteOption> {
    throw new ShippingNotConfiguredError(this.carrier);
  }
  async crear(): Promise<ShipmentCreated> {
    throw new ShippingNotConfiguredError(this.carrier);
  }
  async trackear(): Promise<TrackingResult> {
    throw new ShippingNotConfiguredError(this.carrier);
  }
  async cancelar(): Promise<CancelResult> {
    throw new ShippingNotConfiguredError(this.carrier);
  }
  async listarSucursales(): Promise<Branch[]> {
    throw new ShippingNotConfiguredError(this.carrier);
  }
}

/**
 * In-memory deterministic mock. Useful for tests + demos.
 *
 * Returns synthetic-but-realistic responses:
 * - cotizar: fixed cost based on weight + ETA based on service level
 * - crear: random tracking number, label URL is a data: URI
 * - trackear: lifecycle simulated based on the tracking number
 *   (numbers ending in 0 = label_created, 1-3 = in_transit, etc.)
 * - cancelar: succeeds for label_created/in_transit, fails otherwise
 * - listarSucursales: returns 3 mock branches near the requested CP
 */
export class MockShippingAdapter implements ShippingAdapter {
  constructor(public readonly carrier: Carrier = "andreani") {}

  async cotizar(input: QuoteInput): Promise<QuoteOption> {
    const totalKg = input.packages.reduce((s, p) => s + p.weightKg, 0);
    const service = input.service ?? "standard";
    const baseCost = service === "express" ? 4500 : service === "same_day" ? 8000 : 2500;
    const costArs = baseCost + Math.round(totalKg * 700);
    const days =
      service === "same_day" ? [0, 0] : service === "express" ? [1, 2] : [2, 5];
    return {
      carrier: this.carrier,
      service,
      costArs,
      estimatedDaysMin: days[0]!,
      estimatedDaysMax: days[1]!,
      productId: `${this.carrier}-${service}`,
      billedWeightKg: totalKg,
    };
  }

  async crear(input: CreateShipmentInput): Promise<ShipmentCreated> {
    const trackingNumber = `${this.carrier.toUpperCase()}${Date.now()}${Math.floor(
      Math.random() * 1000,
    )}`;
    const quote = await this.cotizar(input);
    const result: ShipmentCreated = {
      carrier: this.carrier,
      trackingNumber,
      shipmentId: trackingNumber,
      labelUrl: `https://mock-shipping.test/labels/${trackingNumber}.pdf`,
      costArs: quote.costArs,
      estimatedDeliveryDate: new Date(
        Date.now() + quote.estimatedDaysMax * 24 * 3600 * 1000,
      )
        .toISOString()
        .slice(0, 10),
    };
    if (input.externalReference) result.externalReference = input.externalReference;
    return result;
  }

  async trackear(trackingNumber: string): Promise<TrackingResult> {
    // Deterministic based on last digit
    const lastDigit = Number(trackingNumber.slice(-1)) || 0;
    let status: import("./types").TrackingStatus = "in_transit";
    if (lastDigit === 0) status = "label_created";
    else if (lastDigit >= 1 && lastDigit <= 3) status = "in_transit";
    else if (lastDigit >= 4 && lastDigit <= 6) status = "out_for_delivery";
    else if (lastDigit === 7) status = "delivery_failed";
    else if (lastDigit === 8) status = "delivered";
    else status = "returned";

    const baseTime = Date.now() - 2 * 24 * 3600 * 1000;
    const events: import("./types").TrackingEvent[] = [
      {
        timestamp: new Date(baseTime).toISOString(),
        status: "label_created",
        description: "Etiqueta generada",
        location: "Buenos Aires",
      },
    ];
    if (status !== "label_created") {
      events.push({
        timestamp: new Date(baseTime + 6 * 3600 * 1000).toISOString(),
        status: "in_transit",
        description: "En tránsito hacia destino",
        location: "Centro de distribución CABA",
      });
    }
    if (
      status === "out_for_delivery" ||
      status === "delivery_failed" ||
      status === "delivered" ||
      status === "returned"
    ) {
      events.push({
        timestamp: new Date(baseTime + 24 * 3600 * 1000).toISOString(),
        status: "out_for_delivery",
        description: "En reparto",
      });
    }
    if (status === "delivered") {
      events.push({
        timestamp: new Date(baseTime + 36 * 3600 * 1000).toISOString(),
        status: "delivered",
        description: "Entregado al destinatario",
      });
    }
    const result: TrackingResult = {
      carrier: this.carrier,
      trackingNumber,
      currentStatus: status,
      events,
    };
    if (status === "delivered") {
      result.deliveredAt = events[events.length - 1]!.timestamp;
    }
    return result;
  }

  async cancelar(trackingNumber: string): Promise<CancelResult> {
    const tracking = await this.trackear(trackingNumber);
    const cancelable =
      tracking.currentStatus === "label_created" ||
      tracking.currentStatus === "in_transit";
    const result: CancelResult = {
      carrier: this.carrier,
      trackingNumber,
      canceled: cancelable,
    };
    if (!cancelable) {
      result.reason = `No se puede cancelar un envío en estado '${tracking.currentStatus}'.`;
    }
    return result;
  }

  async listarSucursales(params: {
    postalCode: string;
    limit?: number;
  }): Promise<Branch[]> {
    const limit = params.limit ?? 3;
    return Array.from({ length: limit }).map((_, i) => ({
      carrier: this.carrier,
      id: `mock-branch-${i + 1}`,
      name: `Sucursal Mock ${i + 1}`,
      address: `Av. Mock ${1000 + i * 100}`,
      city: "Buenos Aires",
      state: "CABA",
      postalCode: params.postalCode,
      distanceKm: (i + 1) * 1.5,
      openingHours: "L-V 9-18, S 9-13",
      services: ["dropoff", "pickup"],
    }));
  }
}
