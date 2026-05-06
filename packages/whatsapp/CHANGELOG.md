# Changelog

## 0.2.0

### Minor Changes — Agent hijacking prevention (`scopedTo` mode)

- `whatsappTools(client, { scopedTo: senderPhone })` — new option that
  binds every outbound `send_*` tool to a single recipient phone. The
  `to` parameter is REMOVED from the tool schemas, so the LLM cannot
  message a different number even via prompt injection ("send to Y").

  **Use this in webhook handlers**. Without it, an agent that processes
  inbound WhatsApp messages can be tricked into sending payment links
  or content to attacker-chosen recipients. Closes a HIGH security
  audit finding.

  Backward-compatible: omit `scopedTo` (or pass empty options) for the
  previous behavior — useful for batch / proactive flows where the
  agent is sending to a list of recipients you control.

  ```ts
  // BEFORE (still works for batch flows)
  const tools = whatsappTools(wa);
  // LLM picks `to` per call.

  // AFTER (recommended for webhook handlers)
  const event = parseWebhookEvent(payload);
  const tools = whatsappTools(wa, { scopedTo: event.from });
  // LLM cannot specify `to` — it's removed from schema and bound to event.from.
  ```

- 9 new tests in `tools-scoped.test.ts` verifying:
  - `to` is removed from schemas in scoped mode (Zod parse drops it)
  - All 5 send_* tools route to scoped sender, ignoring any `to` arg
  - Descriptions warn the LLM about the binding
  - Unscoped behavior unchanged
  - `mark_whatsapp_read` works in both modes (it never had `to`)

## 0.1.0

### Initial release

WhatsApp Business Cloud API as drop-in tools for the Vercel AI SDK.

**Tools**

- `send_whatsapp_text` — free-form within 24h window
- `send_whatsapp_template` — approved template (any time)
- `send_whatsapp_media` — image/audio/video/document/sticker
- `send_whatsapp_buttons` — 1-3 reply buttons
- `send_whatsapp_list` — sectioned list picker
- `mark_whatsapp_read` — read receipt

**Webhook**

- `parseWebhookEvent` / `parseWebhookEvents` — flatten Meta's nested envelope
- `verifyWebhookSignature` — HMAC-SHA256 (X-Hub-Signature-256)
- `verifyWebhookSubscription` — GET handshake (hub.challenge)

**Phone normalization**

- `normalizeArPhone` — handles all common AR formats, adds the WhatsApp `9` prefix automatically
- `isPlausibleWhatsAppPhone` — loose validation for LLM input

**Errors**

- `WhatsAppRecipientNotOnPlatformError` (Meta code 131009)
- `WhatsAppOutsideWindowError` (Meta code 131026/131047)
- `WhatsAppApiError` (generic)
- `WhatsAppWebhookSignatureError`

48 tests, dual ESM/CJS, MIT.
