/**
 * Benchmarks for the pure helpers + state adapter ops.
 */

import { bench, describe } from "vitest";
import {
  computeMarketplaceFee,
  explainPaymentStatus,
  InMemoryStateAdapter,
} from "../../src";

describe("helpers.computeMarketplaceFee", () => {
  bench("simple percentage", () => {
    computeMarketplaceFee(10_000, { percent: 5 });
  });

  bench("percentage with min/max bounds", () => {
    computeMarketplaceFee(10_000, { percent: 5, minArs: 50, maxArs: 5000 });
  });

  bench("flat + percentage compound", () => {
    computeMarketplaceFee(10_000, { flatArs: 200, percent: 2, minArs: 50 });
  });
});

describe("helpers.explainPaymentStatus", () => {
  const approved = { id: "1", status: "approved", status_detail: "accredited", transaction_amount: 100, currency_id: "ARS" } as never;
  const rejectedCvv = { id: "1", status: "rejected", status_detail: "cc_rejected_bad_filled_security_code", transaction_amount: 100, currency_id: "ARS" } as never;
  const unknown = { id: "1", status: "in_process", status_detail: "some_unknown_code", transaction_amount: 100, currency_id: "ARS" } as never;

  bench("approved + accredited (hot path)", () => {
    explainPaymentStatus(approved);
  });

  bench("rejected with known status_detail", () => {
    explainPaymentStatus(rejectedCvv);
  });

  bench("unknown status_detail (fallback path)", () => {
    explainPaymentStatus(unknown);
  });
});

describe("state.InMemoryStateAdapter", () => {
  const adapter = new InMemoryStateAdapter();

  bench("set", async () => {
    await adapter.set("sub-1", { status: "authorized", payerEmail: "x@test.com" });
  });

  bench("get", async () => {
    await adapter.get("sub-1");
  });
});
