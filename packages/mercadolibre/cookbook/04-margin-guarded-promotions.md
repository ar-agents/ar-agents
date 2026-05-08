# Recipe 04 — Margin-guarded auto-opt-in to promotions

MELI's "Ofertas del día" / "Mercado Promos" surface candidate items with a suggested discount. Accept blindly and you give away your margin. `autoOptInPromotions` only opts in to candidates that clear a minimum margin floor.

```ts
import { MeliClient, autoOptInPromotions } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

// COGS table — typically loaded from your inventory system.
const cogsByItem: Record<string, number> = {
  MLA1402155766: 600,  // Yerba Amanda 1kg, costs me $600
  MLA1399004412: 4500, // Mate imperial, costs me $4500
  MLA1410987432: 1200,
};

const r = await autoOptInPromotions(client, /* sellerId */ 123_456_789, {
  cogsByItem,

  // Floor margin: enrolled promo must leave at least 20% margin.
  // If a candidate's suggested_price - cogs < 20% of suggested_price → skip.
  defaultMinimumMargin: 0.2,

  // Per-item override — useful for low-margin SKUs you NEVER want to discount.
  perItemMinimumMargin: {
    MLA1399004412: 0.35, // mate imperial: 35% floor
  },

  // Skip (don't try to opt in) if the COGS is missing — fail-safe default.
  skipIfNoCogs: true,
});

console.log(`Opted in: ${r.optedIn.length}`);
console.log(`Skipped: ${r.skipped.length}`);
for (const s of r.skipped) {
  console.log(`  ${s.itemId}: ${s.reason} (margin would have been ${s.actualMargin?.toFixed(2)})`);
}
```

## What `reason` codes mean

`r.skipped[i].reason` is one of:

- `below_margin` — suggested_price would not clear the configured floor.
- `no_cogs` — COGS missing from the table and `skipIfNoCogs` was true.
- `opt_in_failed` — MELI rejected the opt-in (price band exceeded, item paused, blacklisted).

## Margin formula

`autoOptInPromotions` uses **gross margin on the suggested price**:

```
margin = (suggested_price - cogs) / suggested_price
```

That's the most-conservative reading — it counts the whole COGS against the discounted revenue. If you want to factor in MELI fees, MercadoPago fees, or shipping subsidies, pre-adjust your `cogsByItem` to the all-in cost.

## Tracking enrollment over time

The result object also includes `r.optedIn[i].dealPrice` and the original `suggestedPrice`. Drop those into your analytics so you can see which promos actually drove sales lift vs which only ate margin.
