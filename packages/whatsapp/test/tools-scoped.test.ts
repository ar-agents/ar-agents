import { describe, expect, it, vi } from "vitest";
import { whatsappTools } from "../src/tools";
import type { WhatsAppClient } from "../src/client";

/**
 * F5 (security audit /cso) — agent hijacking prevention.
 *
 * When the agent factory is invoked with `scopedTo: senderPhone`, all
 * outbound `send_*` tools must IGNORE any `to` argument the LLM might
 * provide and route to the bound phone. The schemas should also drop the
 * `to` field so a sane LLM never even attempts to override it.
 */

function fakeClient() {
  const sendText = vi.fn().mockResolvedValue({
    messageId: "wamid.MOCK",
    recipient: "549TEST",
  });
  const sendTemplate = vi.fn().mockResolvedValue({
    messageId: "wamid.MOCK",
    recipient: "549TEST",
  });
  const sendMedia = vi.fn().mockResolvedValue({
    messageId: "wamid.MOCK",
    recipient: "549TEST",
  });
  const sendInteractive = vi.fn().mockResolvedValue({
    messageId: "wamid.MOCK",
    recipient: "549TEST",
  });
  const markAsRead = vi.fn().mockResolvedValue(undefined);
  return {
    client: {
      sendText,
      sendTemplate,
      sendMedia,
      sendInteractive,
      markAsRead,
    } as unknown as WhatsAppClient,
    spies: { sendText, sendTemplate, sendMedia, sendInteractive, markAsRead },
  };
}

describe("whatsappTools — scopedTo (F5 hijacking prevention)", () => {
  const SENDER = "5491111111111";
  const ATTACKER = "5499999999999";

  it("removes `to` from send_whatsapp_text inputSchema when scoped", () => {
    const { client } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    // Zod parses against the schema. Attempting to pass `to` should fail.
    const result = tools.send_whatsapp_text.inputSchema.safeParse({
      to: ATTACKER,
      text: "hi",
    });
    // safeParse passes (extra keys are stripped by default, not rejected),
    // but the parsed output does NOT contain `to`.
    expect(result.success).toBe(true);
    if (result.success) {
      expect("to" in result.data).toBe(false);
    }
  });

  it("send_whatsapp_text routes to scoped sender, not LLM-provided `to`", async () => {
    const { client, spies } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    // Even if we manually pass `to` via execute (bypassing schema), the
    // scoped wrapper should ignore it.
    await tools.send_whatsapp_text.execute(
      // Schema-validated inputs have no `to` field, but we pass it as `unknown`
      // to verify defense-in-depth.
      { to: ATTACKER, text: "hi" } as never,
      {} as never,
    );
    expect(spies.sendText).toHaveBeenCalledTimes(1);
    expect(spies.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ to: SENDER, text: "hi" }),
    );
    // ATTACKER must NEVER appear in the actual API call args.
    expect(spies.sendText).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: ATTACKER }),
    );
  });

  it("send_whatsapp_template routes to scoped sender", async () => {
    const { client, spies } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    await tools.send_whatsapp_template.execute(
      { templateName: "hello", bodyParams: ["x"] } as never,
      {} as never,
    );
    expect(spies.sendTemplate).toHaveBeenCalledWith(
      expect.objectContaining({ to: SENDER, templateName: "hello" }),
    );
  });

  it("send_whatsapp_media routes to scoped sender", async () => {
    const { client, spies } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    await tools.send_whatsapp_media.execute(
      { type: "image", link: "https://example.com/x.png" } as never,
      {} as never,
    );
    expect(spies.sendMedia).toHaveBeenCalledWith(
      expect.objectContaining({ to: SENDER, type: "image" }),
    );
  });

  it("send_whatsapp_buttons routes to scoped sender", async () => {
    const { client, spies } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    await tools.send_whatsapp_buttons.execute(
      {
        bodyText: "pick one",
        buttons: [{ id: "yes", title: "Sí" }],
      } as never,
      {} as never,
    );
    expect(spies.sendInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ to: SENDER, bodyText: "pick one" }),
    );
  });

  it("send_whatsapp_list routes to scoped sender", async () => {
    const { client, spies } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    await tools.send_whatsapp_list.execute(
      {
        bodyText: "menu",
        buttonText: "Ver",
        sections: [{ rows: [{ id: "a", title: "A" }] }],
      } as never,
      {} as never,
    );
    expect(spies.sendInteractive).toHaveBeenCalledWith(
      expect.objectContaining({ to: SENDER, bodyText: "menu" }),
    );
  });

  it("scoped description warns the LLM about the binding", () => {
    const { client } = fakeClient();
    const tools = whatsappTools(client, { scopedTo: SENDER });
    expect(tools.send_whatsapp_text.description).toContain(SENDER);
    expect(tools.send_whatsapp_text.description).toContain("BOUND");
  });

  it("unscoped (no options) still accepts LLM-provided `to`", async () => {
    const { client, spies } = fakeClient();
    const tools = whatsappTools(client);
    await tools.send_whatsapp_text.execute(
      { to: ATTACKER, text: "hi" } as never,
      {} as never,
    );
    // In unscoped mode, the LLM-provided `to` is honored. This is the
    // intended behavior for batch/proactive flows.
    expect(spies.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ to: ATTACKER }),
    );
  });

  it("mark_whatsapp_read works in both scoped and unscoped modes", async () => {
    const { client, spies } = fakeClient();
    const scoped = whatsappTools(client, { scopedTo: SENDER });
    const unscoped = whatsappTools(client);
    await scoped.mark_whatsapp_read.execute(
      { messageId: "wamid.A" } as never,
      {} as never,
    );
    await unscoped.mark_whatsapp_read.execute(
      { messageId: "wamid.B" } as never,
      {} as never,
    );
    expect(spies.markAsRead).toHaveBeenCalledTimes(2);
    expect(spies.markAsRead).toHaveBeenCalledWith("wamid.A");
    expect(spies.markAsRead).toHaveBeenCalledWith("wamid.B");
  });
});
