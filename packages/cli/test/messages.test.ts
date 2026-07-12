import { describe, expect, it } from "vitest";
import { appendAssistantTurn, appendUserTurn, assistantMessage, toolPart, userMessage } from "../src/messages";

describe("userMessage / assistantMessage", () => {
  it("builds the u-<index> / a-<index> id scheme", () => {
    expect(userMessage("hola", 0)).toEqual({ id: "u-0", role: "user", parts: [{ type: "text", text: "hola" }] });
    expect(assistantMessage("dale", 2)).toEqual({
      id: "a-2",
      role: "assistant",
      parts: [{ type: "text", text: "dale" }],
    });
  });
});

describe("appendUserTurn / appendAssistantTurn", () => {
  it("appends u-0, a-0, u-1 in order without mutating prior arrays", () => {
    const empty: ReturnType<typeof appendUserTurn> = [];
    const afterFirstUser = appendUserTurn(empty, "primera pregunta");
    const afterAssistant = appendAssistantTurn(afterFirstUser, "primera respuesta");
    const afterSecondUser = appendUserTurn(afterAssistant, "segunda pregunta");

    expect(empty).toEqual([]);
    expect(afterFirstUser).toHaveLength(1);
    expect(afterAssistant).toHaveLength(2);
    expect(afterSecondUser.map((m) => m.id)).toEqual(["u-0", "a-0", "u-1"]);

    // Each intermediate array is untouched by later appends.
    expect(afterFirstUser).toEqual([{ id: "u-0", role: "user", parts: [{ type: "text", text: "primera pregunta" }] }]);
    expect(afterAssistant).toHaveLength(2);
  });
});

describe("toolPart", () => {
  it("returns the dynamic-tool / output-available shape", () => {
    expect(toolPart("preview_society", "call_1", { prompt: "peluqueria" }, { ok: true })).toEqual({
      type: "dynamic-tool",
      toolName: "preview_society",
      toolCallId: "call_1",
      state: "output-available",
      input: { prompt: "peluqueria" },
      output: { ok: true },
    });
  });
});

describe("assistantMessage with tool parts", () => {
  it("places tool parts before the text part", () => {
    const part = toolPart("preview_society", "call_1", { prompt: "peluqueria" }, { ok: true });
    expect(assistantMessage("aca esta el borrador", 0, [part])).toEqual({
      id: "a-0",
      role: "assistant",
      parts: [part, { type: "text", text: "aca esta el borrador" }],
    });
  });

  it("with empty text and one tool part yields only the tool part (no text part)", () => {
    const part = toolPart("preview_society", "call_1", { prompt: "peluqueria" }, { ok: true });
    expect(assistantMessage("", 0, [part])).toEqual({
      id: "a-0",
      role: "assistant",
      parts: [part],
    });
  });
});

describe("appendAssistantTurn with tool parts", () => {
  it("threads tool parts through to the appended assistant message", () => {
    const part = toolPart("preview_society", "call_1", { prompt: "peluqueria" }, { ok: true });
    const afterUser = appendUserTurn([], "quiero una peluqueria");
    const afterAssistant = appendAssistantTurn(afterUser, "aca esta el borrador", [part]);

    expect(afterAssistant[1]).toEqual({
      id: "a-0",
      role: "assistant",
      parts: [part, { type: "text", text: "aca esta el borrador" }],
    });
  });
});
