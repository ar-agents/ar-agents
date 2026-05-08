// Performance benchmarks for AP2 critical paths.
//
// Run with `pnpm bench`. Targets:
//   - signCheckoutJwt (the inner ES256 sign): < 5ms p99
//   - verifyClosedCheckoutMandate (full single-hop): < 15ms p99
//   - issueClosedCheckoutMandate (build SD-JWT presentation): < 10ms p99
//   - verifyDsdJwtChain (2-hop): < 25ms p99
//   - evaluateBudgetWithRecurrence (memory tracker): < 1ms p99
//   - buildLineItemTotals + max-flow constraint eval (10×10 graph): < 5ms p99

import { bench, describe } from "vitest";
import {
  generateAp2KeyPair,
  signCheckoutJwt,
  computeCheckoutHash,
  issueClosedCheckoutMandate,
  verifyClosedCheckoutMandate,
  buildCheckoutReceipt,
  verifyCheckoutReceipt,
  importPublicJwk,
  evaluateCheckoutConstraint,
  InMemoryBudgetTracker,
  evaluateBudgetWithRecurrence,
  type Ap2KeyPair,
  type CheckoutJwtPayload,
  type ClosedCheckoutMandate,
} from "../src";

// Pre-warm shared state for the benchmarks.
let merchant!: Ap2KeyPair;
let agent!: Ap2KeyPair;
let merchantPublic!: Awaited<ReturnType<typeof importPublicJwk>>;
let agentPublic!: Awaited<ReturnType<typeof importPublicJwk>>;
let samplePayload!: CheckoutJwtPayload;
let preBuiltJwt!: string;
let preBuiltHash!: string;
let preBuiltClosed!: ClosedCheckoutMandate;
let preBuiltPresentation!: string;

async function setup() {
  if (merchant) return;
  merchant = await generateAp2KeyPair("ES256");
  agent = await generateAp2KeyPair("ES256");
  merchantPublic = await importPublicJwk(merchant.publicJwk, "ES256");
  agentPublic = await importPublicJwk(agent.publicJwk, "ES256");
  samplePayload = {
    order_id: "ord_bench",
    merchant: { id: "merchant_bench", name: "Bench" },
    line_items: [
      {
        id: "li_1",
        product: { id: "p1", title: "Bench Item", price: 199, currency: "USD" },
        quantity: 1,
      },
    ],
    total_price: 199,
    currency: "USD",
  };
  preBuiltJwt = await signCheckoutJwt(samplePayload, merchant.privateKey);
  preBuiltHash = await computeCheckoutHash(preBuiltJwt);
  preBuiltClosed = {
    vct: "mandate.checkout.1",
    checkout_jwt: preBuiltJwt,
    checkout_hash: preBuiltHash,
  };
  preBuiltPresentation = await issueClosedCheckoutMandate({
    mandate: preBuiltClosed,
    signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
  });
}

describe("AP2 critical-path benchmarks", () => {
  bench(
    "signCheckoutJwt (ES256 sign + Zod parse)",
    async () => {
      await setup();
      await signCheckoutJwt(samplePayload, merchant.privateKey);
    },
    { iterations: 50 },
  );

  bench(
    "computeCheckoutHash (sha-256 + base64url)",
    async () => {
      await setup();
      await computeCheckoutHash(preBuiltJwt);
    },
    { iterations: 100 },
  );

  bench(
    "issueClosedCheckoutMandate (build SD-JWT presentation)",
    async () => {
      await setup();
      await issueClosedCheckoutMandate({
        mandate: preBuiltClosed,
        signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
      });
    },
    { iterations: 50 },
  );

  bench(
    "verifyClosedCheckoutMandate (full single-hop verification)",
    async () => {
      await setup();
      await verifyClosedCheckoutMandate(preBuiltPresentation, {
        issuerKey: agentPublic,
        checkoutJwtKey: merchantPublic,
      });
    },
    { iterations: 50 },
  );

  bench(
    "buildCheckoutReceipt (sign JWT)",
    async () => {
      await setup();
      await buildCheckoutReceipt({
        receipt: {
          status: "Success",
          iss: "merchant_bench",
          iat: 1717000000,
          reference: "fake-sd-hash",
          order_id: "ord_bench",
        },
        signingKey: merchant.privateKey,
      });
    },
    { iterations: 100 },
  );

  bench(
    "verifyCheckoutReceipt (verify JWT + Zod parse)",
    async () => {
      await setup();
      const jwt = await buildCheckoutReceipt({
        receipt: {
          status: "Success",
          iss: "merchant_bench",
          iat: 1717000000,
          reference: "fake-sd-hash",
          order_id: "ord_bench",
        },
        signingKey: merchant.privateKey,
      });
      await verifyCheckoutReceipt(jwt, merchantPublic);
    },
    { iterations: 50 },
  );
});

describe("Constraint evaluator benchmarks", () => {
  // Build a 10-cart × 10-constraint max-flow case (worst case for typical
  // AP2 cart constraints).
  const cart: CheckoutJwtPayload = {
    order_id: "x",
    merchant: { id: "x" },
    line_items: Array.from({ length: 10 }, (_, i) => ({
      id: `li_${i}`,
      product: { id: `p${i}`, title: `T${i}`, price: 100, currency: "USD" },
      quantity: 1,
    })),
    total_price: 1000,
    currency: "USD",
  };
  const closedMandate: ClosedCheckoutMandate = {
    vct: "mandate.checkout.1",
    checkout_jwt: "stub",
    checkout_hash: "stub",
  };

  bench(
    "checkout.line_items max-flow (10×10)",
    () => {
      evaluateCheckoutConstraint(
        {
          type: "checkout.line_items",
          items: Array.from({ length: 10 }, (_, i) => ({
            id: `c_${i}`,
            acceptable_items: Array.from({ length: 10 }, (_, j) => ({ id: `p${j}` })),
            quantity: 1,
          })),
        },
        { checkoutPayload: cart, closedMandate },
      );
    },
    { iterations: 1000 },
  );

  bench(
    "checkout.allowed_merchants",
    () => {
      evaluateCheckoutConstraint(
        {
          type: "checkout.allowed_merchants",
          allowed: [{ id: "x" }, { id: "y" }, { id: "z" }],
        },
        { checkoutPayload: cart, closedMandate },
      );
    },
    { iterations: 10000 },
  );
});

describe("Budget tracker benchmarks", () => {
  let tracker!: InMemoryBudgetTracker;
  bench(
    "InMemoryBudgetTracker.recordPresentation + inspect",
    async () => {
      tracker ??= new InMemoryBudgetTracker();
      await tracker.recordPresentation({
        openMandateDigest: "d",
        amountMinor: 100,
        currency: "USD",
      });
      await tracker.inspect("d");
    },
    { iterations: 5000 },
  );

  bench(
    "evaluateBudgetWithRecurrence (within budget)",
    async () => {
      tracker ??= new InMemoryBudgetTracker();
      await evaluateBudgetWithRecurrence({
        tracker,
        openMandateDigest: "bench-digest",
        amountMinor: 100,
        currency: "USD",
        budget: { max: 1000000, currency: "USD" }, // huge cap
        divisor: 100,
      });
    },
    { iterations: 5000 },
  );
});
