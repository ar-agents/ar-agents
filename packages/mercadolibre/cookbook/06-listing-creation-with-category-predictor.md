# Recipe 06 — Listing creation with the category predictor

Argentine sellers most-frequently get stuck on one thing: **picking the right category** and filling the **mandatory technical attributes**. `categorizeAndPlan` does both in one call.

```ts
import { MeliClient, categorizeAndPlan, createItem } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

// Step 1 — predict.
const plan = await categorizeAndPlan(client, {
  title: "Yerba Mate Amanda 1kg con palo tradicional",
  siteId: "MLA",
});

console.log("Predicted category:", plan.predicted.path.join(" > "));
// → "Alimentos y Bebidas > Almacén > Bebidas e Infusiones > Yerbas y Té > Yerba Mate"

console.log("Required attributes:");
for (const attr of plan.requiredAttributeIds) {
  console.log(`  - ${attr}`);
}
// → BRAND, MODEL, NET_WEIGHT, ITEM_CONDITION, etc.
```

## Step 2 — interview the user for missing attributes

```ts
import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

const agent = new Agent({
  model: anthropic("claude-sonnet-4-6"),
  system: `Vas a guiar al vendedor para completar los atributos obligatorios
de su listado de Mercado Libre. Hacé UNA pregunta a la vez. Sé breve.`,
});

// Walk through plan.technicalSpecs.input.components and ask the user
// for each value, accumulating into a Zod-validated payload.
```

## Step 3 — create the item

```ts
const created = await createItem(client, {
  title: "Yerba Mate Amanda 1kg con palo tradicional",
  category_id: plan.predicted.category_id,
  price: 4500,
  currency_id: "ARS",
  available_quantity: 50,
  buying_mode: "buy_it_now",
  condition: "new",
  listing_type_id: "gold_special",
  attributes: [
    { id: "BRAND", value_name: "Amanda" },
    { id: "MODEL", value_name: "Tradicional 1kg" },
    { id: "NET_WEIGHT", value_name: "1 kg" },
    { id: "ITEM_CONDITION", value_id: "2230284" }, // "Nuevo"
  ],
  pictures: [
    { source: "https://yourcdn.example.com/amanda-1kg.jpg" },
  ],
  shipping: {
    mode: "me2",
    free_shipping: false,
    local_pick_up: true,
  },
  description: { plain_text: "Yerba mate Amanda 1kg, vencimiento 2027." },
});

console.log(`Listed at ${created.permalink}`);
```

## Why one call instead of two

`predictCategory` and `getDomainTechnicalSpecs` are independent endpoints. Calling them sequentially adds round-trip latency. `categorizeAndPlan` runs them **in parallel** the moment it has the predicted `domain_id`, halving wall-clock time.

For batch listing creation (importing a CSV), this matters — 100 items × 600ms vs 100 items × 1.2s is the difference between "noticed" and "felt".
