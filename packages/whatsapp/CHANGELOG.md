# Changelog

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
