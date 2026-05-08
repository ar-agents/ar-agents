# Recipe 03 — Claim defender within the 2-day SLA window

MELI claims have a hard SLA. Miss it and the claim auto-resolves in the buyer's favor. The `defendClaim` helper packages the typical seller-defence pattern: GET claim → upload N evidences in parallel → optionally post a message — all within the SLA.

```ts
import { MeliClient, defendClaim, type ClaimEvidenceInput } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

// "missing_product" claim: defend with proof of shipment + invoice + a message.
const result = await defendClaim(client, {
  claimId: 5421,
  evidences: [
    {
      evidence_type: "PROOF_OF_SHIPMENT",
      text: "Tracking Andreani 1234567890 — entregado y firmado el 2026-05-07.",
    },
    {
      evidence_type: "INVOICE",
      text: "Factura A 0001-00012345 emitida el 2026-05-05.",
      // To attach an actual file, upload it first via uploadClaimEvidence with a multipart Blob
      // and reference its file_id here instead of `text`.
    },
    {
      evidence_type: "BUYER_AND_SELLER_MESSAGES",
      text: "El comprador confirmó recepción en mensaje del 2026-05-08.",
    },
  ],
  message: "Adjuntamos toda la documentación del envío. Sigamos en contacto si necesitás otra prueba.",
});

console.log(`Defended claim ${result.claim.id}:`);
console.log(`  ${result.uploadedEvidences.length} evidences uploaded`);
console.log(`  message: ${result.messagePosted ? "posted" : "skipped"}`);
```

## Picking the right `evidence_type`

The evidence-type enum (`EvidenceType` in `@ar-agents/mercadolibre`) maps to the 8 categories MELI's mediation backend recognizes:

| `evidence_type` | When to use |
| --- | --- |
| `PROOF_OF_SHIPMENT` | Tracking number + delivery confirmation. The single most useful evidence for `missing_product` claims. |
| `INVOICE` | Factura A/B/C. Required for B2B disputes about price or quantity. |
| `BUYER_AND_SELLER_MESSAGES` | Screenshots or quotes from the in-MELI message thread. |
| `PROOF_OF_REFUND` | If you already refunded the buyer outside MELI's flow. |
| `PROOF_OF_RETURN` | If the buyer claims to have returned the product. |
| `PROOF_OF_INSPECTION` | Quality check on the returned item. |
| `OTHER_DOCUMENTATION` | Anything not fitting the above — explain in `text`. |
| `RETURN_LABEL` | When you've issued a return label and want to demonstrate it. |

The `defendClaim` helper does all uploads **in parallel** — typical 3-evidence + message defence completes in ~800ms even from a cold lambda.

## Discovering claims at risk

```ts
import { searchClaims } from "@ar-agents/mercadolibre";

const r = await searchClaims(client, {
  stage: "claim",
  status: "opened",
  limit: 50,
});

const atRisk = r.data.filter((c) => {
  if (!c.due_date) return false;
  const hoursLeft = (new Date(c.due_date).getTime() - Date.now()) / 3_600_000;
  return hoursLeft < 24;
});

console.log(`${atRisk.length} claims have < 24h left on the SLA`);
```

Pair this with a cron job to get pre-emptive Slack/Telegram alerts.
