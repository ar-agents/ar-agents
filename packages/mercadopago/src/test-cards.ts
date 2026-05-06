/**
 * MP sandbox test cards for AR (MLA) — the official numbers MP publishes for
 * its TEST environment. Use these in unit tests + integration tests to
 * exercise the create_payment / charge_saved_card flows without touching a
 * real card.
 *
 * # When this matters
 *
 * Most non-trivial dev flows hit the issue of "I want to test approved /
 * rejected / pending paths" but MP's docs scatter the test card numbers
 * across multiple pages. This module collects them so you can `import { TEST_CARDS_AR }`
 * and pick the scenario you need.
 *
 * # Source
 *
 * AR (MLA) test cards published at
 * https://www.mercadopago.com.ar/developers/es/docs/checkout-api/additional-content/test-cards
 *
 * Last sync: 2026-05.
 */

/**
 * The full data needed to test a payment:
 * - `number` — 16 digits
 * - `cvv` — 3 digits
 * - `exp` — MM/YY (use any future date in TEST mode)
 * - `paymentMethodId` — what to pass as `payment_method_id` to create_payment
 * - `holderName` — special string that triggers the desired status
 *   (e.g. "APRO" → approved, "OTHE" → rejected with bad CVV)
 */
export interface TestCard {
  brand: string;
  number: string;
  cvv: string;
  exp: string;
  paymentMethodId: string;
  /**
   * Holder-name "magic strings" — MP routes the payment to a specific
   * status_detail based on this:
   * - `APRO` → status: approved
   * - `OTHE` → rejected (status_detail: cc_rejected_other_reason)
   * - `CONT` → pending (status_detail: pending_contingency)
   * - `CALL` → rejected (status_detail: cc_rejected_call_for_authorize)
   * - `FUND` → rejected (status_detail: cc_rejected_insufficient_amount)
   * - `SECU` → rejected (status_detail: cc_rejected_bad_filled_security_code)
   * - `EXPI` → rejected (status_detail: cc_rejected_bad_filled_date)
   * - `FORM` → rejected (status_detail: cc_rejected_bad_filled_other)
   */
  holderNameToTest: Record<string, string>;
}

/**
 * The MP-published test cards for AR. Pass `holderName: "APRO"` for an
 * approved payment, `"OTHE"` for a rejected one, etc.
 */
export const TEST_CARDS_AR: Record<string, TestCard> = {
  VISA_CREDIT: {
    brand: "Visa (crédito)",
    number: "4509 9535 6623 3704".replace(/\s/g, ""),
    cvv: "123",
    exp: "11/30",
    paymentMethodId: "visa",
    holderNameToTest: {
      APRO: "approved",
      OTHE: "cc_rejected_other_reason",
      CONT: "pending_contingency",
      CALL: "cc_rejected_call_for_authorize",
      FUND: "cc_rejected_insufficient_amount",
      SECU: "cc_rejected_bad_filled_security_code",
      EXPI: "cc_rejected_bad_filled_date",
      FORM: "cc_rejected_bad_filled_other",
    },
  },
  MASTERCARD_CREDIT: {
    brand: "Mastercard (crédito)",
    number: "5031 7557 3453 0604".replace(/\s/g, ""),
    cvv: "123",
    exp: "11/30",
    paymentMethodId: "master",
    holderNameToTest: {
      APRO: "approved",
      OTHE: "cc_rejected_other_reason",
      CONT: "pending_contingency",
      CALL: "cc_rejected_call_for_authorize",
      FUND: "cc_rejected_insufficient_amount",
    },
  },
  AMEX_CREDIT: {
    brand: "American Express (crédito)",
    number: "3711 803032 57522".replace(/\s/g, ""),
    cvv: "1234",
    exp: "11/30",
    paymentMethodId: "amex",
    holderNameToTest: { APRO: "approved", OTHE: "cc_rejected_other_reason" },
  },
  VISA_DEBIT: {
    brand: "Visa (débito)",
    number: "4002 7686 9439 5619".replace(/\s/g, ""),
    cvv: "123",
    exp: "11/30",
    paymentMethodId: "debvisa",
    holderNameToTest: { APRO: "approved", OTHE: "cc_rejected_other_reason" },
  },
  MASTERCARD_DEBIT: {
    brand: "Mastercard (débito)",
    number: "5287 3383 0125 4634".replace(/\s/g, ""),
    cvv: "123",
    exp: "11/30",
    paymentMethodId: "debmaster",
    holderNameToTest: { APRO: "approved", OTHE: "cc_rejected_other_reason" },
  },
};

/**
 * Pre-built payer objects that MP recognizes as test buyers. Pair with
 * an APRO test card → status: approved.
 *
 * **Use a NEW email per call** if you don't want MP's idempotency-on-email
 * to dedupe — append a timestamp.
 */
export const TEST_PAYERS_AR = {
  approvedBuyer: () => ({
    email: `test_user_${Date.now()}@testuser.com`,
    identification: { type: "DNI", number: "12345678" },
  }),
} as const;

/**
 * Resolve a `(card, scenario)` pair to a ready-to-use `CreatePaymentParams`-like
 * object. Reduces boilerplate in test files.
 *
 * @example
 * ```ts
 * const card = buildTestCardScenario("VISA_CREDIT", "APRO", 1500);
 * await client.createPayment({ ...card, externalReference: "test-1" });
 * ```
 */
export function buildTestCardScenario(
  cardKey: keyof typeof TEST_CARDS_AR,
  scenario: string,
  amountArs: number,
): {
  transactionAmount: number;
  paymentMethodId: string;
  payerEmail: string;
  description: string;
  installments: number;
  /**
   * Magic holder name — pass to MP frontend's CardForm `cardholderName`
   * field. (For server-side create_payment, pass via additional_info.)
   */
  holderName: string;
} {
  const card = TEST_CARDS_AR[cardKey];
  if (!card) throw new Error(`Unknown test card: ${cardKey}`);
  if (!card.holderNameToTest[scenario]) {
    throw new Error(
      `Card ${cardKey} doesn't define scenario ${scenario}. Available: ${Object.keys(card.holderNameToTest).join(", ")}`,
    );
  }
  return {
    transactionAmount: amountArs,
    paymentMethodId: card.paymentMethodId,
    payerEmail: TEST_PAYERS_AR.approvedBuyer().email,
    description: `TEST ${scenario} via ${cardKey}`,
    installments: 1,
    holderName: scenario,
  };
}
