/**
 * Shared setup for MP sandbox integration tests.
 *
 * Note: NO MSW handlers here — these tests hit api.mercadopago.com directly.
 */

import { MercadoPagoClient } from "../../src";

const TOKEN = process.env.MP_INTEGRATION_TOKEN;
export const SHOULD_RUN = process.env.MP_INTEGRATION_TESTS === "1" && !!TOKEN;

if (!SHOULD_RUN && process.env.MP_INTEGRATION_TESTS === "1" && !TOKEN) {
  console.warn(
    "[integration] MP_INTEGRATION_TESTS=1 but MP_INTEGRATION_TOKEN is missing; skipping",
  );
}

export const client = SHOULD_RUN
  ? new MercadoPagoClient({
      accessToken: TOKEN!,
      requestTimeoutMs: 15_000,
      maxRetries: 2,
    })
  : null;

/** Generate a unique external_reference per test to avoid collisions. */
export function makeExternalRef(prefix = "test"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Generate a unique test buyer email per test. */
export function makeTestBuyerEmail(): string {
  return `test_user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}@testuser.com`;
}
