/**
 * `@ar-agents/whatsapp/testing` — fixtures + mock client for tests.
 *
 * What you get:
 *
 *   - **Factories**: `mockIncomingTextEnvelope`, `mockIncomingButtonReply`,
 *     `mockIncomingListReply`, `mockMessageStatusEnvelope`. They produce the
 *     raw Meta-shaped JSON envelope (the body Meta posts to your webhook),
 *     ready to feed into `parseWebhookEvents`.
 *
 *   - **`mockSendTextResult`** / **`mockTemplateResult`** — the response
 *     shape Meta returns from `POST /messages`.
 *
 *   - **`mockSignedWebhook`** — produces a `{ rawBody, headers }` pair whose
 *     `x-hub-signature-256` header passes `verifyWebhookSignature` against
 *     the same `appSecret`. Drops directly into your webhook-handler test.
 *
 *   - **`MockWhatsAppClient`** — stand-in for `WhatsAppClient`. Records
 *     every method call so tests assert on what was sent without hitting
 *     the live Meta Graph.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Raw incoming envelope shape — what Meta posts to your webhook
// ─────────────────────────────────────────────────────────────────────────────

export type RawWebhookEnvelope = {
  object: "whatsapp_business_account";
  entry: Array<{
    id: string;
    changes: Array<{
      field: "messages";
      value: Record<string, unknown>;
    }>;
  }>;
};

let counter = 0;
const nextId = () => `wamid.HBgN${(++counter).toString().padStart(8, "0")}`;

const DEFAULT_PHONE = "5491155555555";
const DEFAULT_PHONE_NUMBER_ID = "1234567890123456";
const DEFAULT_DISPLAY_PHONE = "+54 9 11 5555-5555";

function envelope(value: Record<string, unknown>): RawWebhookEnvelope {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "100000000000000", changes: [{ field: "messages", value }] }],
  };
}

export function mockIncomingTextEnvelope(
  overrides: { from?: string; body?: string; messageId?: string; ts?: number } = {},
): RawWebhookEnvelope {
  const ts = String(overrides.ts ?? Math.floor(Date.now() / 1000));
  return envelope({
    messaging_product: "whatsapp",
    metadata: {
      display_phone_number: DEFAULT_DISPLAY_PHONE,
      phone_number_id: DEFAULT_PHONE_NUMBER_ID,
    },
    contacts: [
      {
        profile: { name: "Test Contact" },
        wa_id: overrides.from ?? DEFAULT_PHONE,
      },
    ],
    messages: [
      {
        from: overrides.from ?? DEFAULT_PHONE,
        id: overrides.messageId ?? nextId(),
        timestamp: ts,
        type: "text",
        text: { body: overrides.body ?? "Hola" },
      },
    ],
  });
}

export function mockIncomingButtonReply(
  overrides: { from?: string; buttonId?: string; buttonTitle?: string } = {},
): RawWebhookEnvelope {
  return envelope({
    messaging_product: "whatsapp",
    metadata: {
      display_phone_number: DEFAULT_DISPLAY_PHONE,
      phone_number_id: DEFAULT_PHONE_NUMBER_ID,
    },
    contacts: [{ profile: { name: "Test" }, wa_id: overrides.from ?? DEFAULT_PHONE }],
    messages: [
      {
        from: overrides.from ?? DEFAULT_PHONE,
        id: nextId(),
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: {
            id: overrides.buttonId ?? "btn_yes",
            title: overrides.buttonTitle ?? "Sí",
          },
        },
      },
    ],
  });
}

export function mockIncomingListReply(
  overrides: { from?: string; rowId?: string; rowTitle?: string } = {},
): RawWebhookEnvelope {
  return envelope({
    messaging_product: "whatsapp",
    metadata: {
      display_phone_number: DEFAULT_DISPLAY_PHONE,
      phone_number_id: DEFAULT_PHONE_NUMBER_ID,
    },
    contacts: [{ profile: { name: "Test" }, wa_id: overrides.from ?? DEFAULT_PHONE }],
    messages: [
      {
        from: overrides.from ?? DEFAULT_PHONE,
        id: nextId(),
        timestamp: String(Math.floor(Date.now() / 1000)),
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: {
            id: overrides.rowId ?? "row_1",
            title: overrides.rowTitle ?? "Plan Pro",
          },
        },
      },
    ],
  });
}

export function mockMessageStatusEnvelope(
  args: {
    messageId?: string;
    status?: "sent" | "delivered" | "read" | "failed";
    to?: string;
  } = {},
): RawWebhookEnvelope {
  return envelope({
    messaging_product: "whatsapp",
    metadata: {
      display_phone_number: DEFAULT_DISPLAY_PHONE,
      phone_number_id: DEFAULT_PHONE_NUMBER_ID,
    },
    statuses: [
      {
        id: args.messageId ?? nextId(),
        status: args.status ?? "delivered",
        timestamp: String(Math.floor(Date.now() / 1000)),
        recipient_id: args.to ?? DEFAULT_PHONE,
      },
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Outgoing send results
// ─────────────────────────────────────────────────────────────────────────────

export function mockSendTextResult(overrides: { wamid?: string; to?: string } = {}) {
  return {
    messaging_product: "whatsapp" as const,
    contacts: [
      { wa_id: overrides.to ?? DEFAULT_PHONE, input: overrides.to ?? DEFAULT_PHONE },
    ],
    messages: [{ id: overrides.wamid ?? nextId(), message_status: "accepted" as const }],
  };
}

export function mockTemplateResult(overrides: { wamid?: string; to?: string } = {}) {
  return mockSendTextResult(overrides);
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed webhook
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Produce a `{ rawBody, headers }` pair whose `x-hub-signature-256` is a
 * real HMAC-SHA256 against `appSecret`. Pass to `verifyWebhookSignature`
 * (from `@ar-agents/whatsapp`) and it'll accept it.
 */
export async function mockSignedWebhook(args: {
  appSecret: string;
  envelope?: RawWebhookEnvelope;
}): Promise<{ rawBody: string; headers: Headers; envelope: RawWebhookEnvelope }> {
  const env = args.envelope ?? mockIncomingTextEnvelope();
  const rawBody = JSON.stringify(env);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(args.appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBytes = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sigBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  const headers = new Headers({
    "content-type": "application/json",
    "x-hub-signature-256": `sha256=${hex}`,
  });
  return { rawBody, headers, envelope: env };
}

// ─────────────────────────────────────────────────────────────────────────────
// MockWhatsAppClient
// ─────────────────────────────────────────────────────────────────────────────

type Recorded =
  | { method: "sendText"; args: { to: string; body: string } }
  | { method: "sendTemplate"; args: { to: string; templateName: string; languageCode: string } }
  | { method: "sendMedia"; args: { to: string; mediaType: string; url: string } }
  | { method: "sendButtons"; args: { to: string; body: string; buttons: unknown } }
  | { method: "sendList"; args: { to: string; body: string; sections: unknown } }
  | { method: "markRead"; args: { messageId: string } };

export class MockWhatsAppClient {
  /** Append-only log of every method call. Inspect in your test assertions. */
  readonly calls: Recorded[] = [];

  async sendText(to: string, body: string) {
    this.calls.push({ method: "sendText", args: { to, body } });
    return mockSendTextResult({ to });
  }

  async sendTemplate(to: string, templateName: string, languageCode = "es_AR") {
    this.calls.push({ method: "sendTemplate", args: { to, templateName, languageCode } });
    return mockSendTextResult({ to });
  }

  async sendMedia(to: string, mediaType: string, url: string) {
    this.calls.push({ method: "sendMedia", args: { to, mediaType, url } });
    return mockSendTextResult({ to });
  }

  async sendButtons(to: string, body: string, buttons: unknown) {
    this.calls.push({ method: "sendButtons", args: { to, body, buttons } });
    return mockSendTextResult({ to });
  }

  async sendList(to: string, body: string, sections: unknown) {
    this.calls.push({ method: "sendList", args: { to, body, sections } });
    return mockSendTextResult({ to });
  }

  async markRead(messageId: string) {
    this.calls.push({ method: "markRead", args: { messageId } });
    return { success: true };
  }

  /** Reset the recorded calls between tests. */
  reset() {
    this.calls.length = 0;
  }
}
