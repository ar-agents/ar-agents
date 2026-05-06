/**
 * Type definitions for AR shipping operations.
 *
 * Carriers (Andreani, OCA, Correo Argentino) have different APIs and
 * different data shapes; this module normalizes them into a single set of
 * input/output types so the agent doesn't have to think about which carrier
 * it's talking to.
 *
 * # The 5 core operations (every carrier)
 *
 * 1. **cotizar** — quote: dimensions/weight + origin/destination → cost + ETA
 * 2. **crear** — create a shipment, get a tracking number + label URL
 * 3. **trackear** — query the status / events of a shipment
 * 4. **cancelar** — cancel a shipment (when allowed by the carrier)
 * 5. **listar_sucursales** — find drop-off / pickup branches near a CP
 *
 * Some carriers also support pickup scheduling, returns, and bulk operations,
 * but the 5 above cover 95% of agent flows.
 */

/**
 * Carriers this lib normalizes. Add new ones via the adapter pattern.
 */
export type Carrier = "andreani" | "oca" | "correo_argentino";

/**
 * Direction of a shipment. Most agent flows are "to client" (B2C);
 * "to seller" is for returns.
 */
export type ShipmentDirection = "to_client" | "to_seller" | "between_branches";

/**
 * Service level. Each carrier maps these to its own product names internally:
 * - Andreani: standard → Estándar, express → Urgente, same_day → Mismo Día
 * - OCA: standard → Encomienda Pactada, express → Express
 * - Correo: standard → Carta Documento, express → Encomienda Express
 */
export type ServiceLevel = "standard" | "express" | "same_day";

export interface Address {
  /** Recipient/sender full name. */
  name: string;
  /** Optional company / razón social. */
  company?: string;
  /** Street name (e.g., "Av. Cabildo"). */
  street: string;
  /** Street number (e.g., "1234"). String to allow "S/N", "1234-A". */
  number: string;
  /** Apartment / piso / depto / oficina. */
  unit?: string;
  /** Locality / barrio / partido. */
  city: string;
  /** Provincia name OR ISO code OR AFIP code. The lib normalizes. */
  state: string | number;
  /** CPA (Código Postal Argentino) — 4 digits or extended 8-char. */
  postalCode: string;
  /** AR for Argentina. Default. */
  country?: "AR" | string;
  /** Contact phone. Used by carrier for delivery coordination. */
  phone?: string;
  /** Email for tracking notifications (some carriers). */
  email?: string;
  /** Delivery instructions (e.g., "tocar timbre 2 veces"). */
  notes?: string;
}

/**
 * Package dimensions + weight. Most carriers compute "volumetric weight"
 * = (length × width × height) / divisor and bill the greater of actual vs
 * volumetric weight.
 */
export interface PackageInfo {
  /** Actual weight in kg (e.g., 0.5 for 500g, 12 for 12kg). */
  weightKg: number;
  /** Length in cm. */
  lengthCm: number;
  /** Width in cm. */
  widthCm: number;
  /** Height in cm. */
  heightCm: number;
  /**
   * Declared value in ARS — for insurance + lost-package compensation.
   * Most carriers cap their liability at this amount.
   */
  declaredValueArs: number;
  /**
   * Optional content description for customs / handling (e.g., "Ropa", "Electrónica").
   */
  description?: string;
  /** True if the package is fragile (carrier may apply special handling). */
  fragile?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cotizar (quote)
// ─────────────────────────────────────────────────────────────────────────────

export interface QuoteInput {
  origin: Address;
  destination: Address;
  packages: PackageInfo[];
  /** Service level. Default: standard. */
  service?: ServiceLevel;
  /**
   * Direction of the shipment. Default: to_client (B2C).
   */
  direction?: ShipmentDirection;
}

/**
 * A single quote returned by a carrier. When using `quoteAll()`, you get an
 * array of these — one per carrier — for comparison.
 */
export interface QuoteOption {
  carrier: Carrier;
  service: ServiceLevel;
  /** Cost in ARS. */
  costArs: number;
  /** Estimated delivery time in business days, lower bound. */
  estimatedDaysMin: number;
  /** Estimated delivery time in business days, upper bound. */
  estimatedDaysMax: number;
  /** Carrier's internal product/service id (opaque, for create_shipment). */
  productId?: string;
  /** Total weight billed (max of actual + volumetric). */
  billedWeightKg?: number;
  /** Raw carrier response for debugging / advanced use. */
  raw?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Crear envío (create shipment)
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateShipmentInput {
  origin: Address;
  destination: Address;
  packages: PackageInfo[];
  service?: ServiceLevel;
  direction?: ShipmentDirection;
  /**
   * Your-system reference (order id, invoice number) — printed on the label
   * and surfaced in tracking events. Use for reconciliation.
   */
  externalReference?: string;
  /**
   * Carrier-specific product id — pass the value from `QuoteOption.productId`
   * when you want to commit a specific quote.
   */
  productId?: string;
}

export interface ShipmentCreated {
  carrier: Carrier;
  /** Carrier's tracking number (the number the recipient sees). */
  trackingNumber: string;
  /** Carrier-internal shipment id (different from trackingNumber for some carriers). */
  shipmentId: string;
  /** PDF label URL. May require auth — use `labelData` for the actual bytes. */
  labelUrl?: string;
  /** Direct base64 PDF when the carrier returns it inline. */
  labelDataBase64?: string;
  /** Cost in ARS. May differ from the quote (rounding, surcharges). */
  costArs: number;
  /** Estimated delivery date in YYYY-MM-DD. */
  estimatedDeliveryDate?: string;
  /** Echo of the input external reference. */
  externalReference?: string;
  raw?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tracking
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normalized lifecycle states across carriers. Each adapter maps its native
 * status codes to one of these.
 */
export type TrackingStatus =
  | "label_created"     // Label printed but package not picked up yet.
  | "in_transit"        // Carrier has the package, en route.
  | "out_for_delivery"  // On the truck for final delivery TODAY.
  | "delivered"         // Recipient confirmed receipt.
  | "delivery_failed"   // Failed delivery attempt (recipient absent, etc.).
  | "returned"          // Returned to sender after failed attempts.
  | "canceled"          // Sender canceled before shipment.
  | "exception"         // Lost, damaged, in mediation, etc.
  | "unknown";

export interface TrackingEvent {
  /** ISO 8601 timestamp of the event. */
  timestamp: string;
  /** Normalized status. */
  status: TrackingStatus;
  /** Spanish description of what happened (carrier-provided, surface verbatim). */
  description: string;
  /** Location (city, branch) where the event occurred. */
  location?: string;
}

export interface TrackingResult {
  carrier: Carrier;
  trackingNumber: string;
  /** The most recent normalized status. Quick-glance summary field. */
  currentStatus: TrackingStatus;
  /** All events, oldest-first. */
  events: TrackingEvent[];
  /** ISO date when the shipment was delivered, when applicable. */
  deliveredAt?: string;
  /** ETA when not yet delivered. */
  estimatedDeliveryDate?: string;
  raw?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Cancelar
// ─────────────────────────────────────────────────────────────────────────────

export interface CancelResult {
  carrier: Carrier;
  trackingNumber: string;
  canceled: boolean;
  /** Spanish reason if cancellation failed (already in transit, etc.). */
  reason?: string;
  raw?: unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sucursales (branches)
// ─────────────────────────────────────────────────────────────────────────────

export interface Branch {
  carrier: Carrier;
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  /** Distance from the queried CP in km, when computable. */
  distanceKm?: number;
  /** Opening hours as a free-form string (e.g. "L-V 9-18, S 9-13"). */
  openingHours?: string;
  /** GPS coordinates when available. */
  lat?: number;
  lng?: number;
  /** Services this branch offers (drop-off, pickup, returns, etc.). */
  services?: string[];
}
