import { describe, it, expect } from "vitest";
import { buildOrderTotals } from "../src";
import type { LineItem } from "../src/schemas/line-item";

function lineItem(subtotal: number): LineItem {
  return {
    id: "li_1",
    item: { id: "item_a", name: "Test Item", unit_amount: subtotal },
    quantity: 1,
    unit_amount: subtotal,
    totals: [
      { type: "subtotal", display_text: "Subtotal", amount: subtotal },
      { type: "total", display_text: "Total", amount: subtotal },
    ],
  };
}

describe("buildOrderTotals — discount handling", () => {
  it("SUBTRACTS a discount row from the total (1000 - 100 = 900)", () => {
    const rows = buildOrderTotals({
      lineItems: [lineItem(1000)],
      // `Amount` is a non-negative int, so a 100 discount is amount: 100.
      extra: [{ type: "discount", display_text: "Discount", amount: 100 }],
    });
    const total = rows.find((r) => r.type === "total");
    expect(total?.amount).toBe(900);
  });

  it("SUBTRACTS items_discount and store_credit reduction rows", () => {
    const rows = buildOrderTotals({
      lineItems: [lineItem(1000)],
      extra: [
        { type: "items_discount", display_text: "Item discount", amount: 150 },
        { type: "store_credit", display_text: "Store credit", amount: 50 },
      ],
    });
    const total = rows.find((r) => r.type === "total");
    // 1000 - 150 - 50 = 800
    expect(total?.amount).toBe(800);
  });

  it("ADDS charge rows (tax, fee, tip) while subtracting discounts", () => {
    const rows = buildOrderTotals({
      lineItems: [lineItem(1000)],
      extra: [
        { type: "tax", display_text: "Tax", amount: 210 },
        { type: "discount", display_text: "Discount", amount: 100 },
        { type: "tip", display_text: "Tip", amount: 50 },
      ],
    });
    const total = rows.find((r) => r.type === "total");
    // 1000 + 210 + 50 - 100 = 1160
    expect(total?.amount).toBe(1160);
  });

  it("with no reductions, total is the plain sum (regression guard)", () => {
    const rows = buildOrderTotals({
      lineItems: [lineItem(1000)],
      extra: [{ type: "tax", display_text: "Tax", amount: 210 }],
    });
    const total = rows.find((r) => r.type === "total");
    expect(total?.amount).toBe(1210);
  });
});
