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
 * NOTE: labels invalidate after 7 days — re-fetch close to ship time.
 */
export async function fetchLabelsBlob(
  client: MeliClient,
  input: FetchLabelsInput,
): Promise<Blob> {
  const ids = input.shipmentIds.join(",");
  const url = new URL("/shipment_labels", client.baseUrl);
  url.searchParams.set("shipment_ids", ids);
  url.searchParams.set("response_type", input.format);

  // We can't use `client.fetch` directly because it expects JSON. Build a
  // request that piggybacks on the same auth + rate limit + retry plumbing
  // by going through a `fetch`-style call here. For Phase 1 we do a plain
  // fetch; advanced retries can be added later.
  const auth = await (client as { resolveAuthHeaderForExternalUse?: () => Promise<string | null> }).resolveAuthHeaderForExternalUse?.();
  const response = await fetch(url.toString(), {
    headers: {
      Accept: input.format === "pdf" ? "application/pdf" : "text/plain",
      ...(auth ? { Authorization: auth } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(
      `MELI label fetch failed: ${response.status} ${response.statusText}`,
    );
  }
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
  if (options.zipCode) query["zip_code"] = options.zipCode;
  if (options.quantity) query["quantity"] = options.quantity;
  return client.fetch<ShippingOptionsResponse>({
    method: "GET",
    path: `/items/${itemId}/shipping_options`,
    query,
    responseSchema: ShippingOptionsResponse,
  });
}

// Re-export so consumers don't need a deep import.
export { LabelFormat, type TLabelFormat as LabelFormatType };
