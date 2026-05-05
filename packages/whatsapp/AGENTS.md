# @ar-agents/whatsapp — agent instructions

This file is for LLMs that load `@ar-agents/whatsapp` at runtime. It explains when to call each tool, what to expect back, and the WhatsApp-specific landmines.

## Tool selection

| Tool | When to use | When NOT to use |
|---|---|---|
| `send_whatsapp_text` | Replying inside the 24-hour customer service window after the user messaged you | Outside the 24h window — Meta will return code 131026 ("outside window"). Use `send_whatsapp_template` instead. |
| `send_whatsapp_template` | Proactive messages, transactional notifications, marketing, re-engagement (any time, in or out of the 24h window) | Casual conversational replies — templates require pre-approval and feel formal. |
| `send_whatsapp_media` | Sending an image / audio / video / document / sticker | Audio messages from the agent itself unless the agent is generating real audio. |
| `send_whatsapp_buttons` | Asking the user to pick from 1-3 short options ("Sí / No / Cambiar") | When you have more than 3 options — use `send_whatsapp_list`. |
| `send_whatsapp_list` | Asking the user to pick from 4-10 options, optionally grouped into sections ("Plan Básico / Pro / Enterprise") | Single yes/no questions — overkill, use buttons. |
| `mark_whatsapp_read` | Immediately when you process an inbound message — the user sees the read receipt | Bots that don't want to indicate they're "reading" the message. |

## Result schemas to memorize

```ts
// All send_* tools return:
type SendResult = {
  messageId: string;   // wamid.XXXX — use this to thread-reply or correlate webhooks
  recipient: string;   // E.164 no plus, e.g., "5491112345678"
};

// mark_whatsapp_read returns:
type MarkResult = { ok: true; messageId: string };
```

## Error patterns (catch and surface to user)

| Error class | What happened | What to tell the user |
|---|---|---|
| `WhatsAppRecipientNotOnPlatformError` | Phone not registered on WhatsApp | "Ese número no tiene WhatsApp activo." |
| `WhatsAppOutsideWindowError` | Tried free-form outside 24h window | Switch to a template. Don't surface raw error. |
| `WhatsAppApiError` (other) | Generic API error — check `.code` | Surface the message; common codes documented in errors.ts |
| `WhatsAppWebhookSignatureError` | Webhook came from non-Meta source | Reject with 401. Don't process. |

## Argentine phone number normalization

The lib auto-normalizes recipient phones — you can pass any of these formats and they all become `5491112345678`:

- `+54 9 11 1234-5678`
- `54 9 11 1234 5678`
- `+5491112345678`
- `011 1234-5678` (domestic with trunk 0)
- `1112345678` (no prefix, assumes AR mobile)

**The WhatsApp `9`** after the country code is mandatory for AR mobile numbers — without it, Meta returns "recipient not on WhatsApp" even when the number IS registered. The lib handles this for you.

## The 24-hour customer service window

Critical Meta rule: you can ONLY send free-form messages within 24 hours of the user's last message to you. Outside that window, you MUST use an approved template message.

Heuristic for the agent: if the latest webhook event for this conversation is older than ~23 hours, switch to `send_whatsapp_template`. Be conservative — Meta's window starts from THEIR timestamp, not yours.

## Webhook events you'll see

Subscribe to the `messages` field on your WABA. Meta will POST events shaped like:

```ts
type WebhookEvent =
  | { kind: "message", from, fromName, messageId, message: { type: "text", text } | ... }
  | { kind: "status", messageId, status: "sent" | "delivered" | "read" | "failed", errors }
  | { kind: "unknown", raw };
```

Use `parseWebhookEvent(payload)` for single events or `parseWebhookEvents(payload)` for batches (Meta sometimes sends 3+ status updates in one POST).

**Always verify `X-Hub-Signature-256`** with `verifyWebhookSignature(rawBody, signature, appSecret)` before processing. Pass the RAW body (not parsed JSON).

## Latency

| Operation | Typical | Worst case |
|---|---|---|
| `sendText` / `sendTemplate` | 200-500ms | 2s |
| `sendMedia` (link) | 800ms-2s | 5s (Meta downloads first) |
| `markAsRead` | 100-300ms | 1s |
| `downloadMedia` | 500ms-3s | 10s (depends on file size) |

Meta has a global rate limit of 80 messages/second per WABA on the verified tier. Dev tier is much lower (~5 msgs/day to non-test recipients).

## AR-specific defaults

- Default template language: `es_AR`. Override with `languageCode` if your template is registered in `es` or `en_US`.
- Phone normalizer assumes AR formats. For non-AR numbers, pass them in canonical E.164 (with or without `+`) and they'll pass through.
