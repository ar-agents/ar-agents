# Recipe 07 — Reputation monitor with severity-aware alerts

The MELI reputation thermometer (`5_green` → `1_red`) is what determines whether you keep MercadoEnvíos privileges, lower listing fees, and the reputation badge on your listings. Once it drops, recovering takes weeks.

`evaluateReputationAlerts` translates the raw metrics into actionable severities so your agent (or your Slack channel) knows whether something needs attention TODAY or just on the next review.

```ts
import { MeliClient, getSellerReputation, evaluateReputationAlerts } from "@ar-agents/mercadolibre";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

const rep = await getSellerReputation(client, 123_456_789);
const alerts = evaluateReputationAlerts(rep, {
  // Defaults are MELI's published yellow/red thresholds. Tighten for early warning:
  warningClaimRate: 0.015,    // raise an alert when claims > 1.5%
  criticalClaimRate: 0.03,    // page someone when claims > 3%
  warningDelayedHandlingRate: 0.02,
  criticalDelayedHandlingRate: 0.04,
  warningCancellationRate: 0.01,
  criticalCancellationRate: 0.025,
});

for (const a of alerts) {
  const icon = a.severity === "critical" ? "🚨" : "⚠️";
  console.log(`${icon} [${a.severity}] ${a.title}`);
  console.log(`   ${a.metric}: ${a.value} (threshold ${a.threshold})`);
}
```

## Continuous monitoring with `monitorReputation`

For agents that run as long-lived processes (or as a Vercel cron'd serverless function that sleeps and wakes), `monitorReputation` is an async generator that polls and yields `{ snapshot, alerts }` each cycle:

```ts
import { monitorReputation } from "@ar-agents/mercadolibre";

const ctrl = new AbortController();
setTimeout(() => ctrl.abort(), 60 * 60 * 1000); // run for 1 hour

for await (const tick of monitorReputation(client, 123_456_789, {
  intervalMs: 5 * 60 * 1000,  // poll every 5 minutes
  signal: ctrl.signal,
})) {
  if (tick.alerts.some((a) => a.severity === "critical")) {
    await notifyTelegram(`🚨 Reputación CRÍTICA: ${tick.snapshot.level_id}`);
    break; // wake your human, then exit
  }
}
```

The generator stops cleanly when the AbortController fires.

## What to do when the thermometer turns yellow

In rough priority order:

1. **`delayed_handling_time`** — fastest to fix. Find late-shipped orders, mass-send Mercado Envíos shipping confirmations now.
2. **`cancellations`** — identify the SKU(s) with stock-out cancellations, pause them until you restock.
3. **`claims`** — go through `searchClaims({ stage: "claim", status: "opened" })` and resolve the ones close to SLA via `defendClaim`.

Items with no inventory cancel orders, which raises both cancellation rate AND claims rate. Pausing them is the single fastest action when reputation slips.
