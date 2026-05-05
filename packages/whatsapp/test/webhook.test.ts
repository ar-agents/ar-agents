import { describe, expect, it } from "vitest";
import {
  parseWebhookEvent,
  parseWebhookEvents,
  verifyWebhookSignature,
  verifyWebhookSubscription,
} from "../src/webhook";
import { WhatsAppWebhookSignatureError } from "../src/errors";
import { createHmac } from "node:crypto";

describe("verifyWebhookSubscription", () => {
  it("returns the challenge when token + mode match", () => {
    const result = verifyWebhookSubscription(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": "secret-token-123",
        "hub.challenge": "challenge-xyz",
      },
      "secret-token-123",
    );
    expect(result).toBe("challenge-xyz");
  });

  it("returns null when the verify_token doesn't match", () => {
    const result = verifyWebhookSubscription(
      {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge-xyz",
      },
      "secret-token-123",
    );
    expect(result).toBeNull();
  });

  it("returns null when mode is missing", () => {
    const result = verifyWebhookSubscription(
      { "hub.verify_token": "secret-token-123", "hub.challenge": "x" },
      "secret-token-123",
    );
    expect(result).toBeNull();
  });

  it("handles array-valued query params (Express style)", () => {
    const result = verifyWebhookSubscription(
      {
        "hub.mode": ["subscribe"],
        "hub.verify_token": ["secret-token-123"],
        "hub.challenge": ["c"],
      },
      "secret-token-123",
    );
    expect(result).toBe("c");
  });
});

describe("verifyWebhookSignature", () => {
  const secret = "test-app-secret";
  const body = JSON.stringify({ entry: [{ changes: [{ field: "messages" }] }] });

  it("accepts valid signature", () => {
    const sig =
      "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
    expect(() => verifyWebhookSignature(body, sig, secret)).not.toThrow();
  });

  it("throws on tampered body", () => {
    const sig =
      "sha256=" + createHmac("sha256", secret).update(body, "utf8").digest("hex");
    const tampered = body + "!!!";
    expect(() => verifyWebhookSignature(tampered, sig, secret)).toThrow(
      WhatsAppWebhookSignatureError,
    );
  });

  it("throws on signature header from a different secret", () => {
    const sig =
      "sha256=" + createHmac("sha256", "wrong-secret").update(body, "utf8").digest("hex");
    expect(() => verifyWebhookSignature(body, sig, secret)).toThrow(
      WhatsAppWebhookSignatureError,
    );
  });

  it("throws on missing signature header", () => {
    expect(() => verifyWebhookSignature(body, "", secret)).toThrow(
      WhatsAppWebhookSignatureError,
    );
  });
});

describe("parseWebhookEvent — inbound text message", () => {
  const inboundText = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WABA_ID",
        changes: [
          {
            field: "messages",
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5491100000000",
                phone_number_id: "PHONE_NUMBER_ID",
              },
              contacts: [
                {
                  profile: { name: "Lautaro Codes" },
                  wa_id: "5491112345678",
                },
              ],
              messages: [
                {
                  from: "5491112345678",
                  id: "wamid.test123",
                  timestamp: "1714000000",
                  text: { body: "Hola, quiero el plan Pro" },
                  type: "text",
                },
              ],
            },
          },
        ],
      },
    ],
  };

  it("extracts the text body, sender, and metadata", () => {
    const event = parseWebhookEvent(inboundText);
    expect(event.kind).toBe("message");
    if (event.kind !== "message") throw new Error("expected message");
    expect(event.from).toBe("5491112345678");
    expect(event.fromName).toBe("Lautaro Codes");
    expect(event.messageId).toBe("wamid.test123");
    expect(event.phoneNumberId).toBe("PHONE_NUMBER_ID");
    expect(event.message.type).toBe("text");
    if (event.message.type !== "text") throw new Error("expected text");
    expect(event.message.text).toBe("Hola, quiero el plan Pro");
  });
});

describe("parseWebhookEvent — inbound media", () => {
  it("parses image with caption", () => {
    const event = parseWebhookEvent({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "P1" },
                contacts: [{ wa_id: "5491112345678", profile: { name: "L" } }],
                messages: [
                  {
                    from: "5491112345678",
                    id: "wamid.img",
                    timestamp: "1714000000",
                    type: "image",
                    image: {
                      id: "MEDIA_ID_X",
                      caption: "mi factura",
                      mime_type: "image/jpeg",
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(event.kind).toBe("message");
    if (event.kind !== "message") throw new Error();
    expect(event.message.type).toBe("image");
    if (event.message.type !== "image") throw new Error();
    expect(event.message.mediaId).toBe("MEDIA_ID_X");
    expect(event.message.caption).toBe("mi factura");
    expect(event.message.mimeType).toBe("image/jpeg");
  });

  it("parses voice audio (voice flag)", () => {
    const event = parseWebhookEvent({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "P1" },
                messages: [
                  {
                    from: "5491112345678",
                    id: "wamid.audio",
                    timestamp: "1714000000",
                    type: "audio",
                    audio: { id: "M_A", mime_type: "audio/ogg", voice: true },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    if (event.kind !== "message") throw new Error();
    if (event.message.type !== "audio") throw new Error();
    expect(event.message.voice).toBe(true);
  });
});

describe("parseWebhookEvent — interactive replies", () => {
  it("parses button_reply with id + title", () => {
    const event = parseWebhookEvent({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "P1" },
                contacts: [{ wa_id: "5491112345678", profile: { name: "L" } }],
                messages: [
                  {
                    from: "5491112345678",
                    id: "wamid.btn",
                    timestamp: "1714000000",
                    type: "interactive",
                    interactive: {
                      type: "button_reply",
                      button_reply: { id: "plan_pro", title: "Plan Pro" },
                    },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    if (event.kind !== "message") throw new Error();
    if (event.message.type !== "interactive") throw new Error();
    expect(event.message.subtype).toBe("button_reply");
    expect(event.message.id).toBe("plan_pro");
    expect(event.message.title).toBe("Plan Pro");
  });
});

describe("parseWebhookEvent — status updates", () => {
  it("parses delivered status", () => {
    const event = parseWebhookEvent({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "P1" },
                statuses: [
                  {
                    id: "wamid.outbound1",
                    status: "delivered",
                    recipient_id: "5491112345678",
                    timestamp: "1714000000",
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(event.kind).toBe("status");
    if (event.kind !== "status") throw new Error();
    expect(event.status).toBe("delivered");
    expect(event.messageId).toBe("wamid.outbound1");
  });

  it("parses failed status with error details", () => {
    const event = parseWebhookEvent({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "P1" },
                statuses: [
                  {
                    id: "wamid.failed1",
                    status: "failed",
                    recipient_id: "5491112345678",
                    timestamp: "1714000000",
                    errors: [
                      {
                        code: 131009,
                        title: "Recipient is not on WhatsApp",
                        message: "The phone is not registered.",
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    if (event.kind !== "status") throw new Error();
    expect(event.status).toBe("failed");
    expect(event.errors).toHaveLength(1);
    expect(event.errors[0]!.code).toBe(131009);
  });
});

describe("parseWebhookEvents (plural)", () => {
  it("returns all events from a multi-status batch", () => {
    const events = parseWebhookEvents({
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "P1" },
                statuses: [
                  { id: "w1", status: "sent", recipient_id: "x", timestamp: "1" },
                  { id: "w1", status: "delivered", recipient_id: "x", timestamp: "2" },
                  { id: "w1", status: "read", recipient_id: "x", timestamp: "3" },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(events).toHaveLength(3);
    expect(events.map((e) => (e.kind === "status" ? e.status : null))).toEqual([
      "sent",
      "delivered",
      "read",
    ]);
  });

  it("returns unknown event for malformed payload", () => {
    const event = parseWebhookEvent("not a webhook");
    expect(event.kind).toBe("unknown");
  });
});
