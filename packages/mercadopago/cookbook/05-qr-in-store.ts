/**
 * Recipe 05 — In-store QR payment with WhatsApp notification.
 *
 * # Use case
 *
 * Brick-and-mortar shop. Buyer scans a dynamic QR with any AR wallet (MP,
 * Modo, BNA+, Cuenta DNI, Naranja X — interop is mandated by Transferencias 3.0).
 *
 * # Flow
 *
 * **One-time setup**:
 * 1. `create_store` (per branch)
 * 2. `create_pos` per cash register / agent
 *
 * **Per sale**:
 * 1. Cashier triggers a QR for $X via the agent
 * 2. `create_qr_payment` → returns base64 PNG + qr_data string
 * 3. Display QR on screen (or print)
 * 4. Buyer scans → MP fires `point_integration_wh` then `payment` webhooks
 * 5. Cashier receives notification on WhatsApp ("✓ Cobro $X de Juan")
 *
 * # Why two webhooks (`point_integration_wh` + `payment`)
 *
 * - `point_integration_wh`: fires when the QR is scanned, BEFORE payment confirmation
 * - `payment`: fires when the payment is approved
 *
 * Listen for both — the first is your "cashier knows it's being scanned"
 * heads-up, the second is the source of truth for "money landed".
 */

import {
  InMemoryStateAdapter,
  MercadoPagoClient,
} from "@ar-agents/mercadopago";
import { WhatsAppClient, sendWhatsAppText } from "@ar-agents/whatsapp"; // hypothetical import path

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

const wa = new WhatsAppClient({
  // ... WhatsApp Business credentials ...
} as never);

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — One-time setup: store + POS
// ─────────────────────────────────────────────────────────────────────────────

export async function setupStoreAndPos(input: {
  userId: string; // your MP user id (from get_account_info)
  storeName: string;
  storeExternalId: string; // your-system branch id
  posExternalId: string; // your-system cash register id
}) {
  const store = await mp.createStore(input.userId, {
    name: input.storeName,
    external_id: input.storeExternalId,
    location: { street_name: "—", street_number: 0, city: "Buenos Aires" },
  } as never);

  const pos = await mp.createPos({
    name: `Caja ${input.posExternalId}`,
    external_id: input.posExternalId,
    store_id: store.id,
    category: 621102, // "Other Food and Beverage Services" — adjust per MCC
  } as never);

  return { storeId: store.id, posId: pos.id, posExternalId: input.posExternalId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Cashier triggers a QR for $X
// ─────────────────────────────────────────────────────────────────────────────

export async function generateQrForSale(input: {
  userId: string;
  posExternalId: string; // unique per POS
  amountArs: number;
  description: string;
  externalReference: string; // your-system order id
  cashierWhatsAppNumber: string; // for notifications
}) {
  const qr = await mp.createQrPayment(input.userId, {
    external_pos_id: input.posExternalId,
    title: input.description,
    description: input.description,
    total_amount: input.amountArs,
    items: [
      {
        sku_number: input.externalReference,
        category: "marketplace",
        title: input.description,
        description: input.description,
        unit_price: input.amountArs,
        quantity: 1,
        unit_measure: "unit",
        total_amount: input.amountArs,
      },
    ],
    expires_in_seconds: 600,
    notification_url: "https://yourapp.com/api/mp/webhook",
  } as never);

  return {
    qrDataUrl: qr.qr_data_url, // base64 PNG ready to display
    qrString: qr.qr_data, // raw QR string (alt: emit your own image)
    expiresInSeconds: 600,
    instructions:
      "Mostrale al cliente este QR. Tiene 10 minutos para escanear.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Webhook: payment approved → notify cashier via WhatsApp
// ─────────────────────────────────────────────────────────────────────────────

export async function onPaymentApproved(input: {
  paymentId: string;
  cashierWhatsAppNumber: string;
}) {
  const payment = await mp.getPayment(input.paymentId);

  if (payment.status !== "approved") return; // only notify on success

  const buyerName = (payment.payer as { first_name?: string } | undefined)?.first_name ?? "cliente";
  const amount = payment.transaction_amount;

  await sendWhatsAppText({
    waClient: wa,
    to: input.cashierWhatsAppNumber,
    text: `✓ Cobro confirmado\nMonto: $${amount.toLocaleString("es-AR")}\nCliente: ${buyerName}\nID: ${payment.id}`,
  } as never);
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Cancel a pending QR (buyer didn't scan)
// ─────────────────────────────────────────────────────────────────────────────

export async function cancelStaleQr(userId: string, posExternalId: string) {
  await mp.cancelQrPayment(userId, posExternalId);
  return { ok: true };
}
