// Totals computation utility.
//
// ACP `Total` rolls up at three levels: per-line-item, per-fulfillment-option,
// and order-level. The bridge handles per-line-item rollup automatically; the
// host can override fulfillment-option totals via `computeFulfillmentOptions`.
//
// Tax breakdown is left to the host — when AR-fiscal compliance is wired,
// the `onOrderConfirmed` hook attaches the CAE and (optionally) breakdown
// rows. For non-AR sellers, the host controls tax via line-item `tax_exempt`
// flags or by injecting `Total` rows of `type: "tax"`.

import type { Total } from "./schemas/totals";
import type { LineItem } from "./schemas/line-item";
import type { FulfillmentOption } from "./schemas/fulfillment";

/**
 * Build per-line-item totals from a resolved item + quantity. The basic case
 * is:
 *   - `subtotal = unit_amount × quantity`
 *   - `total = subtotal` (no per-item tax/discount unless host adds them)
 *
 * Returns the array sized to fit the bare minimum the spec requires
 * (`subtotal` + `total`). Hosts can append `tax`, `discount`, etc.
 */
export function buildLineItemTotals(args: {
  unitAmount: number;
  quantity: number;
}): Total[] {
  const subtotal = Math.round(args.unitAmount * args.quantity);
  return [
    {
      type: "subtotal",
      display_text: "Subtotal",
      amount: subtotal,
    },
    {
      type: "total",
      display_text: "Total",
      amount: subtotal,
    },
  ];
}

/**
 * Sum line-item subtotals. Returns the order-level `items_base_amount` total.
 */
export function sumLineItemSubtotals(lineItems: LineItem[]): number {
  let sum = 0;
  for (const li of lineItems) {
    const subtotal = li.totals.find((t) => t.type === "subtotal");
    if (subtotal) {
      sum += subtotal.amount;
    } else {
      // Defensive: if `subtotal` is missing, fall back to `total`.
      const total = li.totals.find((t) => t.type === "total");
      if (total) sum += total.amount;
    }
  }
  return sum;
}

/**
 * Sum the cost of selected fulfillment options. Sums each option's `total`
 * row. Used to construct the order-level `fulfillment` total.
 */
export function sumFulfillmentCost(
  options: FulfillmentOption[],
  selectedIds: string[],
): number {
  let sum = 0;
  for (const opt of options) {
    if (!selectedIds.includes(opt.id)) continue;
    const total = opt.totals.find((t) => t.type === "total");
    if (total) sum += total.amount;
  }
  return sum;
}

/**
 * Build the order-level totals array given line items and (optionally)
 * selected fulfillment options. Returns the minimum required rows:
 *   - `items_base_amount`
 *   - `fulfillment` (only if non-zero)
 *   - `total`
 *
 * Hosts add `tax`, `discount`, `tip`, etc. via the spread operator before
 * returning the session.
 */
export function buildOrderTotals(args: {
  lineItems: LineItem[];
  fulfillmentOptions?: FulfillmentOption[];
  selectedFulfillmentOptionIds?: string[];
  /** Extra rows the host wants to inject before computing `total`. */
  extra?: Total[];
}): Total[] {
  const itemsBase = sumLineItemSubtotals(args.lineItems);
  const fulfillment =
    args.fulfillmentOptions && args.selectedFulfillmentOptionIds
      ? sumFulfillmentCost(
          args.fulfillmentOptions,
          args.selectedFulfillmentOptionIds,
        )
      : 0;

  const rows: Total[] = [
    {
      type: "items_base_amount",
      display_text: "Items",
      amount: itemsBase,
    },
  ];

  if (fulfillment > 0) {
    rows.push({
      type: "fulfillment",
      display_text: "Shipping",
      amount: fulfillment,
    });
  }

  if (args.extra) {
    rows.push(...args.extra);
  }

  // Final total = sum of everything that's meant to add to the bill. The
  // spec leaves "what counts" implementation-defined, so we sum every row
  // that ISN'T a duplicate `total` or a subtotal.
  const billable = rows
    .filter(
      (r) =>
        r.type !== "subtotal" && r.type !== "total" && r.type !== "amount_refunded",
    )
    .reduce((acc, r) => acc + r.amount, 0);

  rows.push({
    type: "total",
    display_text: "Total",
    amount: billable,
  });

  return rows;
}
