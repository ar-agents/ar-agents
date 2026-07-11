import { describe, expect, it } from "vitest";
import { appendAssistantTurn, appendUserTurn, assistantMessage, userMessage } from "../src/messages";

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
