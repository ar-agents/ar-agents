// Wires up the ACP facilitator for `bridge-hello`. Single source of truth
// imported by every API route.

import {
  createFacilitator,
  InMemoryStateAdapter,
} from "@ar-agents/agentic-commerce-bridge";
import { demoCatalog } from "./catalog";
import { mockMpProvider, mockMpHandler } from "./mp";

const state = new InMemoryStateAdapter();

export const facilitator = createFacilitator({
  state,
  catalog: demoCatalog,
  paymentProviders: { [mockMpProvider.handlerId]: mockMpProvider },
  paymentHandlers: [mockMpHandler],
  webhookSecret: process.env["ACP_WEBHOOK_SECRET"] ?? "demo_only_change_in_prod",
  defaultLinks: [
    {
      type: "terms_of_use",
      url: "https://github.com/ar-agents/ar-agents/blob/main/LICENSE",
      display_text: "MIT License",
    },
    {
      type: "shipping_policy",
      url: "https://github.com/ar-agents/ar-agents/tree/main/apps/bridge-hello",
      display_text: "Demo App",
    },
  ],
  dispatcher: { basePath: "/api/acp" },
  hooks: {
    // For the demo we don't issue real Facturas (no AFIP cert in scope).
    // The `metadata.factura_demo_note` is what would hold the CAE in prod.
    onOrderConfirmed: async ({ order }) => ({
      metadata: {
        factura_demo_note:
          "in production, @ar-agents/facturacion would emit Factura A/B/C/E here",
        order_id: order.id,
      },
    }),
  },
});

export const stateAdapter = state;
