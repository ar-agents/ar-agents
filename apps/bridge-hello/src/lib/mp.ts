// Mock MercadoPago client + payment provider. No real MP API calls.
//
// In production, replace with `createMercadoPagoPaymentProvider({...})`
// from `@ar-agents/agentic-commerce-bridge` wired against your MP client
// (e.g. `@ar-agents/mercadopago` or raw fetch).
//
// This mock:
//   - "Creates" preferences in-memory and returns deterministic ids.
//   - "Looks up" payments by id from a small in-memory store. Tests can
//     pre-seed payments via `seedPayment()`.

import {
  createMercadoPagoPaymentProvider,
  mercadoPagoPaymentHandler,
  type MpPaymentResponse,
  type MpPreferenceResponse,
} from "@ar-agents/agentic-commerce-bridge";

const preferences = new Map<string, MpPreferenceResponse>();
const payments = new Map<string, MpPaymentResponse>();

/**
 * Pre-seed the mock with a payment record. Useful for the demo / curl
 * walkthroughs — call this before issuing `complete` to make the bridge
 * see an "approved" payment.
 */
export function seedPayment(p: MpPaymentResponse): void {
  payments.set(String(p.id), p);
}

/**
 * Inspect what's currently in the mock — useful for the landing page demo
 * surface.
 */
export function inspectMock(): {
  preferences: Array<MpPreferenceResponse>;
  payments: Array<MpPaymentResponse>;
} {
  return {
    preferences: Array.from(preferences.values()),
    payments: Array.from(payments.values()),
  };
}

let preferenceCounter = 0;

export const mockMpProvider = createMercadoPagoPaymentProvider({
  handlerId: "mercadopago",
  createPreference: async (payload) => {
    const id = `mock_pref_${++preferenceCounter}`;
    const pref: MpPreferenceResponse = {
      id,
      init_point: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
      sandbox_init_point: `https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=${id}`,
      external_reference: payload.external_reference,
    };
    preferences.set(id, pref);
    return pref;
  },
  lookupPayment: async (id) => payments.get(id) ?? null,
  // For the demo the env is "test" — tells discovery clients we're in sandbox.
  acceptableStatuses: ["approved", "in_process"],
});

export const mockMpHandler = mercadoPagoPaymentHandler({
  id: "mercadopago",
  environment: "test",
});
