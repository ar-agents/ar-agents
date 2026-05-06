/**
 * Recipe 01 — First-time Checkout Pro sale via an agent.
 *
 * # Pattern
 *
 * 1. Agent receives the user's intent ("comprar 3 unidades a $X")
 * 2. Agent calls `create_payment_preference` to get a hosted checkout URL
 * 3. Agent surfaces the `init_point_url` to the user (or sends via WhatsApp)
 * 4. The buyer completes payment on MP's hosted form (no PCI scope for you)
 * 5. MP fires a `payment` webhook to your endpoint (see recipe 03)
 *
 * # When to use
 *
 * - Single one-off purchase (not recurring → use recipe 02 for that)
 * - You only have a payer email; no card token from MP frontend SDK
 * - You want PCI-out-of-scope (buyer enters card data on MP's form)
 *
 * # Edge Runtime
 *
 * Fully Edge-compatible. Uncomment `export const runtime = "edge"` to deploy
 * as a Vercel Edge Function for sub-100ms global cold starts.
 */

import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  InMemoryStateAdapter,
  MercadoPagoClient,
  mercadoPagoTools,
} from "@ar-agents/mercadopago";

// export const runtime = "edge"; // Uncomment for Edge deployment

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
  // Production robustez defaults: 30s timeout, 1 retry on 5xx, exponential backoff
  requestTimeoutMs: 30_000,
  maxRetries: 1,
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: `Sos el asistente de checkout de un e-commerce argentino.
Cuando el cliente quiere comprar:
1. Confirmá el monto y la descripción del producto.
2. Llamá a create_payment_preference con back_urls de éxito/error.
3. Devolvele el init_point_url (Checkout Pro) al cliente.
4. NO pidas datos de tarjeta — los cargan en MP.`,
  tools: mercadoPagoTools(mp, {
    state: new InMemoryStateAdapter(),
    backUrl: "https://yourapp.com/payment-result",
    notificationUrl: "https://yourapp.com/api/mp/webhook",
  }),
  stopWhen: stepCountIs(5),
});

// In a Next.js route handler:
export async function POST(req: Request) {
  const { prompt } = (await req.json()) as { prompt: string };
  const result = await agent.generate({ prompt });
  return Response.json({ text: result.text });
}

// ─────────────────────────────────────────────────────────────────────────────
// Manual / non-agent path (for direct API use)
// ─────────────────────────────────────────────────────────────────────────────

export async function createCheckoutPreference(input: {
  customerEmail: string;
  productTitle: string;
  unitPriceArs: number;
  quantity: number;
  externalReference: string;
}) {
  const preference = await mp.createPreference({
    items: [
      {
        title: input.productTitle,
        quantity: input.quantity,
        unit_price: input.unitPriceArs,
        currency_id: "ARS",
      },
    ],
    payer: { email: input.customerEmail },
    backUrls: {
      success: "https://yourapp.com/payment-success",
      failure: "https://yourapp.com/payment-failure",
      pending: "https://yourapp.com/payment-pending",
    },
    autoReturn: "approved",
    externalReference: input.externalReference,
    notificationUrl: "https://yourapp.com/api/mp/webhook",
  });

  return {
    preferenceId: preference.id,
    initPoint: preference.init_point,
    sandboxInitPoint: preference.sandbox_init_point, // Use this in TEST mode
  };
}
