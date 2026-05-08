/**
 * Tests for the `@ar-agents/whatsapp/testing` subpath.
 */
import { describe, it, expect } from "vitest";

import {
  mockIncomingTextEnvelope,
  mockIncomingButtonReply,
  mockIncomingListReply,
  mockMessageStatusEnvelope,
  mockSendTextResult,
  mockSignedWebhook,
  MockWhatsAppClient,
} from "../src/testing";
import { verifyWebhookSignature, parseWebhookEvents } from "../src/webhook";

describe("whatsapp testing — factories", () => {
  it("mockIncomingTextEnvelope produces a parseable Meta envelope", () => {
    const env = mockIncomingTextEnvelope({ body: "hola" });
    expect(env.object).toBe("whatsapp_business_account");
    const events = parseWebhookEvents(env);
    expect(events).toHaveLength(1);
    expect(events[0]!.kind).toBe("message");
  });

  it("mockIncomingButtonReply parses as an interactive button_reply event", () => {
    const env = mockIncomingButtonReply({
      buttonId: "btn_confirm",
      buttonTitle: "Confirmar",
    });
    const events = parseWebhookEvents(env);
    expect(events[0]!.kind).toBe("message");
    if (events[0]!.kind === "message" && events[0]!.message.type === "interactive") {
      expect(events[0]!.message.id).toBe("btn_confirm");
      expect(events[0]!.message.title).toBe("Confirmar");
    }
  });

  it("mockIncomingListReply parses as an interactive list_reply event", () => {
    const env = mockIncomingListReply({
      rowId: "plan_pro",
      rowTitle: "Plan Pro",
    });
    const events = parseWebhookEvents(env);
    expect(events[0]!.kind).toBe("message");
    if (events[0]!.kind === "message" && events[0]!.message.type === "interactive") {
      expect(events[0]!.message.id).toBe("plan_pro");
    }
  });

  it("mockMessageStatusEnvelope parses as a status update", () => {
    const env = mockMessageStatusEnvelope({ status: "read" });
    const events = parseWebhookEvents(env);
    expect(events[0]!.kind).toBe("status");
  });

  it("mockSendTextResult has the Meta-shape response", () => {
    const r = mockSendTextResult({ to: "5491122223333" });
    expect(r.messaging_product).toBe("whatsapp");
    expect(r.contacts[0]!.wa_id).toBe("5491122223333");
    expect(r.messages[0]!.id).toMatch(/^wamid\./);
  });
});

describe("whatsapp testing — mockSignedWebhook", () => {
  it("signature verifies against the same appSecret", async () => {
    const appSecret = "12345678901234567890123456789012";
    const { rawBody, headers } = await mockSignedWebhook({ appSecret });

    expect(() =>
      verifyWebhookSignature(
        rawBody,
        headers.get("x-hub-signature-256") ?? "",
        appSecret,
      ),
    ).not.toThrow();
  });

  it("rejects when appSecret doesn't match", async () => {
    const { rawBody, headers } = await mockSignedWebhook({
      appSecret: "right-secret",
    });

    expect(() =>
      verifyWebhookSignature(
        rawBody,
        headers.get("x-hub-signature-256") ?? "",
        "wrong-secret",
      ),
    ).toThrow();
  });

  it("can carry a custom envelope (e.g. button reply)", async () => {
    const envelope = mockIncomingButtonReply({ buttonTitle: "Sí cobrame" });
    const { rawBody, envelope: returned } = await mockSignedWebhook({
      appSecret: "test",
      envelope,
    });
    expect(returned).toBe(envelope);
    expect(rawBody).toContain("Sí cobrame");
  });
});

describe("whatsapp testing — MockWhatsAppClient", () => {
  it("records sendText calls in order", async () => {
    const wa = new MockWhatsAppClient();
    await wa.sendText("5491111111111", "Hola");
    await wa.sendText("5491122223333", "Mundo");
    expect(wa.calls).toHaveLength(2);
    expect(wa.calls[0]).toEqual({
      method: "sendText",
      args: { to: "5491111111111", body: "Hola" },
    });
    expect(wa.calls[1]!.args).toMatchObject({ to: "5491122223333" });
  });

  it("returns Meta-shaped result with a generated wamid", async () => {
    const wa = new MockWhatsAppClient();
    const r = await wa.sendText("5491111111111", "test");
    expect(r.messages[0]!.id).toMatch(/^wamid\./);
  });

  it("records sendTemplate, sendMedia, sendButtons, sendList, markRead", async () => {
    const wa = new MockWhatsAppClient();
    await wa.sendTemplate("5491", "welcome", "es_AR");
    await wa.sendMedia("5491", "image", "https://x/img.png");
    await wa.sendButtons("5491", "?", []);
    await wa.sendList("5491", "?", []);
    await wa.markRead("wamid.X");
    expect(wa.calls.map((c) => c.method)).toEqual([
      "sendTemplate",
      "sendMedia",
      "sendButtons",
      "sendList",
      "markRead",
    ]);
  });

  it("reset() clears the call log", async () => {
    const wa = new MockWhatsAppClient();
    await wa.sendText("5491", "x");
    wa.reset();
    expect(wa.calls).toHaveLength(0);
  });
});
