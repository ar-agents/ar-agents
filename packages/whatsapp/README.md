# @ar-agents/whatsapp

> WhatsApp Business Cloud API as drop-in tools for the [Vercel AI SDK](https://sdk.vercel.ai). Send text/template/media/interactive messages, parse incoming webhooks, mark as read. AR-friendly defaults but works for any WABA.

[![npm version](https://img.shields.io/npm/v/@ar-agents/whatsapp.svg)](https://www.npmjs.com/package/@ar-agents/whatsapp)
[![npm downloads](https://img.shields.io/npm/dm/@ar-agents/whatsapp.svg)](https://www.npmjs.com/package/@ar-agents/whatsapp)
[![license](https://img.shields.io/npm/l/@ar-agents/whatsapp.svg)](./LICENSE)
[![bundle size](https://img.shields.io/bundlephobia/minzip/@ar-agents/whatsapp.svg)](https://bundlephobia.com/package/@ar-agents/whatsapp)

> **Reading this as an agent?** Skip to [AGENTS.md](./AGENTS.md) — tool selection rules, error patterns, latency table, composition with the rest of the @ar-agents stack.

## At a glance

| What | Value |
| --- | --- |
| Tools shipped | 6 — `send_whatsapp_text` / `_template` / `_media` / `_buttons` / `_list` + `mark_whatsapp_read` |
| Webhook helpers | `parseWebhookEvent` / `parseWebhookEvents` (batch) / `verifyWebhookSignature` (HMAC-SHA256 timing-safe) / `verifyWebhookSubscription` (GET handshake) |
| Anti-hijacking (v0.2) | `whatsappTools(client, { scopedTo: senderPhone })` — removes `to` from tool schemas so the LLM cannot message a different number even via prompt injection. **Recommended for webhook handlers.** |
| AR phone normalizer | `normalizeArPhone` handles `+54 9 11 ...`, `011 ...`, legacy `15` prefix, etc. Adds the mandatory WhatsApp `9` for AR mobile. |
| Test coverage | 57 unit tests including 9 dedicated `scopedTo` agent-hijacking tests |
| Bundle | 5.5 KB ESM brotli'd |
| Runtime | Node 20+ (uses `node:crypto` for HMAC). Edge Runtime via Web Crypto in v0.3 (planned). |
| External deps | Meta WhatsApp Business Cloud API access token + phone number ID (Meta Business Suite → WhatsApp → API Setup) |

## Why this lib

You want your Vercel AI SDK agent to chat over WhatsApp Business. Without this, you'd:

- Read Meta's Cloud API docs (200+ pages)
- Implement 6 different message-type payload shapes (text, template, media, buttons, list, location)
- Handle the 24-hour customer service window quirk
- Build webhook signature verification
- Normalize Argentine phone numbers (the WhatsApp `9` mandatory mobile prefix)
- Wrap it all as schema-validated `tool()` calls

This package does all that. Wire it in and the LLM can send/receive WhatsApp messages.

## Install

```bash
pnpm add @ar-agents/whatsapp ai zod
```

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";

const wa = new WhatsAppClient({
  accessToken: process.env.WA_ACCESS_TOKEN!,
  phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: "Sos un asistente de billing por WhatsApp. ...",
  tools: whatsappTools(wa),
  stopWhen: stepCountIs(8),
});

await agent.generate({
  prompt: "Mandale a 5491112345678 un mensaje confirmando su orden #123.",
});
```

## Webhook handling

```ts
import {
  parseWebhookEvent,
  verifyWebhookSignature,
  verifyWebhookSubscription,
} from "@ar-agents/whatsapp";

// GET /api/whatsapp/webhook — Meta's subscription handshake
export async function GET(req: Request) {
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const challenge = verifyWebhookSubscription(
    params,
    process.env.WA_WEBHOOK_VERIFY_TOKEN!,
  );
  return challenge ? new Response(challenge) : new Response("Forbidden", { status: 403 });
}

// POST /api/whatsapp/webhook — inbound messages + status updates
export async function POST(req: Request) {
  const raw = await req.text(); // RAW body — required for signature verification
  try {
    verifyWebhookSignature(
      raw,
      req.headers.get("x-hub-signature-256") ?? "",
      process.env.META_APP_SECRET!,
    );
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
  const event = parseWebhookEvent(JSON.parse(raw));
  if (event.kind === "message" && event.message.type === "text") {
    // Hand off to your agent...
  }
  return new Response("OK");
}
```

## Tools provided

| Tool | Purpose |
|---|---|
| `send_whatsapp_text` | Free-form text inside 24h window |
| `send_whatsapp_template` | Approved template (any time) |
| `send_whatsapp_media` | Image/audio/video/document/sticker |
| `send_whatsapp_buttons` | 1-3 reply buttons |
| `send_whatsapp_list` | 4-10 option list picker |
| `mark_whatsapp_read` | Blue double-check |

See [AGENTS.md](./AGENTS.md) for when to use each.

## Phone normalization

Argentine numbers come in 10+ formats. The lib accepts any and produces the WhatsApp E.164 form:

```ts
import { normalizeArPhone } from "@ar-agents/whatsapp";

normalizeArPhone("+54 9 11 1234-5678"); // "5491112345678"
normalizeArPhone("011 1234-5678");       // "5491112345678"
normalizeArPhone("11-1234-5678");        // "5491112345678"
```

**The WhatsApp `9`** after the country code is mandatory for AR mobile — without it, Meta says "recipient not on WhatsApp" even when they are. The lib handles this for you.

## Setup checklist

1. Create a Meta Business app at [developers.facebook.com](https://developers.facebook.com)
2. Add the WhatsApp product → get a test phone number (or claim your own once Meta verifies your business)
3. Copy `Phone Number ID` and the temporary `Access Token` (24h) — for production, generate a system-user token with `whatsapp_business_messaging` permissions
4. Set webhook URL → `https://yourapp.com/api/whatsapp/webhook` and `Verify Token` of your choosing
5. Subscribe to the `messages` field
6. Set env vars:
   - `WA_ACCESS_TOKEN`
   - `WA_PHONE_NUMBER_ID`
   - `WA_WEBHOOK_VERIFY_TOKEN`
   - `META_APP_SECRET` (Meta dashboard → App Settings → Basic → App Secret)

## Error handling

```ts
import {
  WhatsAppApiError,
  WhatsAppRecipientNotOnPlatformError,
  WhatsAppOutsideWindowError,
} from "@ar-agents/whatsapp";

try {
  await wa.sendText({ to: "...", text: "..." });
} catch (err) {
  if (err instanceof WhatsAppRecipientNotOnPlatformError) {
    // Meta code 131009 — phone not registered
  } else if (err instanceof WhatsAppOutsideWindowError) {
    // Meta code 131026 — switch to a template
  } else if (err instanceof WhatsAppApiError) {
    // Generic — check err.code
  }
}
```

## Scoped mode (v0.2.0+) — anti-hijacking for webhook handlers

When you build the tool set inside a webhook handler, pass `scopedTo: senderPhone` to bind every outbound `send_*` tool to the inbound sender:

```ts
import { whatsappTools, parseWebhookEvent, verifyWebhookSignature } from "@ar-agents/whatsapp";

export async function POST(req: Request) {
  const raw = await req.text();
  verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256") ?? "", appSecret);
  const event = parseWebhookEvent(JSON.parse(raw));
  if (event.kind !== "message") return new Response("OK");

  // The `to` parameter is REMOVED from the tool schemas. The LLM cannot
  // specify a different recipient — even if a crafted user message says
  // "send a payment link to 5491111111111".
  const tools = whatsappTools(client, { scopedTo: event.from });

  const agent = new Agent({ model, instructions, tools });
  await agent.generate({ prompt: event.message.text });
  return new Response("OK");
}
```

Without `scopedTo`, an inbound message could persuade your agent to spam other recipients (LLM agent hijacking via prompt injection). With it, the binding is enforced at schema-time — the LLM doesn't even see a `to` field.

Backward-compatible: omit `options` for the previous behavior, useful for batch / proactive flows where the agent picks `to` per call.

## Composition with the rest of @ar-agents

The same `WhatsAppClient` works as:

| Used by | How |
|---|---|
| `whatsappTools(client, { scopedTo })` | Agent's outbound surface |
| `WhatsAppOtpAdapter` from `@ar-agents/identity-attest` | Send OTPs for trust-level verification |
| Direct `client.sendTemplate(...)` etc. | Manual sends from cron jobs, billing webhooks, etc. |

See [whatsapp-hello demo](https://github.com/ar-agents/ar-agents/tree/main/apps/whatsapp-hello) for an end-to-end example combining `@ar-agents/whatsapp` + `mercadopago` + `identity` + `identity-attest` in one billing assistant.

## License

MIT — © Nazareno Clemente

## Stability

This package is **pre-1.0**. Per [npm convention](https://docs.npmjs.com/about-semantic-versioning), **0.x minor versions may include breaking changes**. We document every breaking change in `CHANGELOG.md` under the corresponding minor bump and flag it explicitly. To avoid surprises:

```bash
# Pin to exact version (recommended for production):
pnpm add @ar-agents/<package>@<exact-version>
```

We commit to **no breaking changes within a patch version**, and we publish `1.0.0` once the public API has stabilized across at least two consecutive minor releases.
