# Recipe 11 — Human-in-the-loop on irreversible operations

The agent can drive 14 MELI tools. Four of those are **irreversible** (visible to buyers within seconds, hard to undo):

- `create_item` — emits a public listing.
- `update_item_price_or_stock` — public price change.
- `answer_question` — public answer on the listing page.
- `defend_claim` — uploads evidence (one-shot, no amendment).

Add a few more (`pauseItem`, `closeItem`, `optInPromotion`, `blacklistAsker`) and you have everything an agent shouldn't touch without your blessing.

This recipe wires a **programmatic gate** that blocks each call until your callback returns `{ approve: true }`. The LLM cannot bypass this — it isn't a system-prompt rule; it's a function call that doesn't fire.

## Minimum wiring

```ts
import { Experimental_Agent as Agent } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { MeliClient, type HitlContext } from "@ar-agents/mercadolibre";
import { meliTools } from "@ar-agents/mercadolibre/ai-sdk";

const client = new MeliClient({
  auth: { kind: "bearer", accessToken: process.env.MELI_ACCESS_TOKEN! },
});

const tools = meliTools(client, {
  siteId: "MLA",
  sellerId: 12345,
  hitl: {
    requireConfirmation: async (ctx: HitlContext) => {
      // Render UI / send Slack / await human click — whatever your app does.
      const ok = await yourApp.askUser({
        title: `Confirmar ${ctx.kind}`,
        body: ctx.summary, // already in Spanish, ready to show
        severity: ctx.severity,
        details: ctx.input,
      });
      if (!ok) return { approve: false, reason: "user denied" };
      return { approve: true };
    },
  },
});
```

When the LLM calls `update_item_price_or_stock` with a price change, the seller sees:

> **Confirmar update_item_price_or_stock**
> Modificar item MLA1402155766: precio → 4750.

Click ✅ and the change ships. Click ❌ and the agent gets back `{ ok: false, code: "hitl_rejected", reason: "user denied" }`, which it can either retry-with-modifications or report back to the seller.

## Auto-approve thresholds (the pragmatic 95%)

Asking for confirmation on every single op is annoying. Use `autoApprove` to skip the gate when the change is small / safe enough that you trust the agent:

```ts
hitl: {
  autoApprove: (ctx) => {
    // Auto-approve any price change < 5% delta.
    if (ctx.kind === "update_item_price_or_stock") {
      const input = ctx.input as { price?: number; id: string };
      if (input.price === undefined) return true; // stock-only, low risk
      const current = priceCache.get(input.id);
      if (!current) return false;
      const delta = Math.abs(input.price - current) / current;
      return delta < 0.05;
    }
    // Auto-approve any answer < 200 chars (typical "yes hay stock" reply).
    if (ctx.kind === "answer_question") {
      const input = ctx.input as { text: string };
      return input.text.length < 200;
    }
    // Always ask for create_item, defend_claim, opt_in_promotion.
    return false;
  },
  requireConfirmation: async (ctx) => {
    /* fall-through path */
  },
},
```

The auto-approve runs first; only when it returns `false` does the gate ping the human. For a typical seller, this means **~80% of agent actions auto-flow + ~20% pop a dialog.**

## Override the agent's input before approving

Sometimes the agent's draft is *almost* right. Let the user edit it inline:

```ts
hitl: {
  requireConfirmation: async (ctx) => {
    if (ctx.kind === "answer_question") {
      const input = ctx.input as { question_id: number; text: string };
      const edited = await yourUI.showEditor({
        original: input.text,
        prompt: "Revisá el borrador antes de publicarlo:",
      });
      if (edited === null) return { approve: false };
      if (edited !== input.text) {
        return { approve: true, override: { text: edited } };
      }
      return { approve: true };
    }
    return { approve: true };
  },
},
```

The `override` object replaces fields in the agent's input before the call fires. The agent never knows you edited it — it sees a successful tool result.

## Audit-only mode (no UI, just logging)

For background agents (cron jobs, daily triage) where you want a record but don't want to block:

```ts
hitl: {
  autoApprove: () => true,
  requireConfirmation: async (ctx) => {
    // Never reached — autoApprove catches everything.
    return { approve: true };
  },
},
telemetry: {
  onRequest: (e) => auditLog.append({
    requestId: e.requestId,
    method: e.method,
    path: e.path,
    timestamp: new Date(e.startedAt),
  }),
},
```

The combination of `hitl.autoApprove` + telemetry-onRequest gives you a per-action audit trail with zero blocking — useful for sellers who want autonomy + accountability.

## Severity-based UX

Each HITL context carries a `severity` field (`low` / `medium` / `high`). Use it to drive your UI's intensity:

| Severity | Ops | Suggested UX |
| --- | --- | --- |
| `low` | `answer_question`, `relist_item` | Toast notification with "undo" button |
| `medium` | `update_item_price_or_stock`, `pause_item`, `close_item`, `blacklist_asker` | Modal with one-click confirm |
| `high` | `create_item`, `defend_claim`, `opt_in_promotion` | Modal with full preview + 5-second timeout |

## What this gives you

- **Trust at scale.** A seller can let the agent loose on their account knowing the destructive ops require explicit consent.
- **Compliance.** Every irreversible action has a documented human approver.
- **Better agent feedback loops.** When the user rejects with a reason, the agent gets `{ ok: false, code: "hitl_rejected", reason }` — it can adjust + try again.
- **Programmatic guarantees** the LLM can't skip. This is a function call that won't fire, not a polite system-prompt request.
