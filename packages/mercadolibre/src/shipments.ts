// Shipments — `/shipments/{id}`, `/shipments/{id}/history`,
// `/shipment_labels?...`, `/items/{id}/shipping_options`.

import type { MeliClient } from "./client";
import {
  LabelFormat,
  Shipment,
  ShipmentHistoryEntry,
  ShippingOption,
  type LabelFormat as TLabelFormat,
  type Shipment as TShipment,
  type ShipmentHistoryEntry as TShipmentHistoryEntry,
  type ShippingOption as TShippingOption,
} from "./schemas/shipment";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Single shipment
// ---------------------------------------------------------------------------

export async function getShipment(
  client: MeliClient,
  shipmentId: number,
): Promise<TShipment> {
  return client.fetch<TShipment>({
    method: "GET",
    path: `/shipments/${shipmentId}`,
    responseSchema: Shipment,
  });
}

const ShipmentHistoryResponse = z.array(ShipmentHistoryEntry);
export async function getShipmentHistory(
  client: MeliClient,
  shipmentId: number,
): Promise<TShipmentHistoryEntry[]> {
  return client.fetch<TShipmentHistoryEntry[]>({
    method: "GET",
    path: `/shipments/${shipmentId}/history`,
    responseSchema: ShipmentHistoryResponse,
  });
}

// ---------------------------------------------------------------------------
// Labels — returns binary (PDF / ZPL). Use the raw fetch path because the
// response is NOT JSON.
// ---------------------------------------------------------------------------

export interface FetchLabelsInput {
  shipmentIds: number[];
  format: TLabelFormat;
}

/**
 * Fetch shipment labels as a Blob. Caller decides what to do (save to disk,
 * stream to user, attach to email).
 *
 * Goes through the same auth + rate-limit + retry + telemetry plumbing as
 * the rest of the client (via `client.fetchRaw`) — labels never get a
 * silent unauthenticated request and aren't excluded from per-seller rate
 * limiting.
 *
 * NOTE: labels invalidate after 7 days — re-fetch close to ship time.
 */
export async function fetchLabelsBlob(
  client: MeliClient,
  input: FetchLabelsInput,
): Promise<Blob> {
  const response = await client.fetchRaw({
    method: "GET",
    path: "/shipment_labels",
    query: {
      shipment_ids: input.shipmentIds.join(","),
      response_type: input.format,
    },
    acceptHeader: input.format === "pdf" ? "application/pdf" : "text/plain",
  });
  return response.blob();
}

// ---------------------------------------------------------------------------
// Shipping options for an item — `/items/{id}/shipping_options`
// ---------------------------------------------------------------------------

const ShippingOptionsResponse = z.object({
  options: z.array(ShippingOption),
  destination: z
    .object({
      type: z.string().optional(),
      zip_code: z.string().optional(),
    })
    .optional(),
});
export type ShippingOptionsResponse = z.infer<typeof ShippingOptionsResponse>;

export async function getShippingOptions(
  client: MeliClient,
  itemId: string,
  options: { zipCode?: string; quantity?: number } = {},
): Promise<ShippingOptionsResponse> {
  const query: Record<string, string | number> = {};
  if (options.zipCode !== undefined) query["zip_code"] = options.zipCode;
  if (options.quantity !== undefined) query["quantity"] = options.quantity;
  return client.fetch<ShippingOptionsResponse>({
    method: "GET",
    path: `/items/${itemId}/shipping_options`,
    query,
    responseSchema: ShippingOptionsResponse,
  });
}

// Re-export so consumers don't need a deep import.
export { LabelFormat, type TLabelFormat as LabelFormatType };
