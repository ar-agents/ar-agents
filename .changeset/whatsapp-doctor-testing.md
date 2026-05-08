---
"@ar-agents/whatsapp": minor
---

Add `whatsapp doctor` CLI and `@ar-agents/whatsapp/testing` subpath.

```bash
npx @ar-agents/whatsapp doctor
```

Validates `WHATSAPP_ACCESS_TOKEN` (EAA prefix), `WHATSAPP_PHONE_NUMBER_ID` (numeric), `WHATSAPP_APP_SECRET` (32 chars), `WHATSAPP_VERIFY_TOKEN`, and pings `GET /v23.0/<phone-id>` to confirm the credentials see the phone number. Lists the 6 registered tools and the `scopedTo` mode pattern. Exit codes 0/1 for CI gating.

```ts
import { mockSignedWebhook, MockWhatsAppClient, mockIncomingTextEnvelope } from "@ar-agents/whatsapp/testing";
```

Factories: `mockIncomingTextEnvelope`, `mockIncomingButtonReply`, `mockIncomingListReply`, `mockMessageStatusEnvelope`, `mockSendTextResult`, `mockTemplateResult`. `mockSignedWebhook` produces `{ rawBody, headers }` whose `x-hub-signature-256` passes `verifyWebhookSignature`. `MockWhatsAppClient` records every send call so tests assert on what was dispatched without touching Meta Graph. 12 new tests.
