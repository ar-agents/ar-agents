// Proves the persisted history round-trips into a shape the studio's own
// `POST /api/agent` handler accepts: apps/studio/src/app/api/agent/route.ts
// calls `safeValidateUIMessages({ messages })` from the real "ai" package
// before ever touching a model, so that validator is the authoritative
// contract for what a client-built history is allowed to look like. This
// test imports it directly (offline: no network, no model call) rather than
// guessing at the AI SDK v7 UIMessage shape.

import { describe, expect, it } from "vitest";
import { safeValidateUIMessages } from "ai";
import { appendAssistantTurn, appendUserTurn, toolPart } from "../src/messages";

describe("persisted history round-trips through safeValidateUIMessages", () => {
  it("accepts a turn with text plus a resolved dynamic-tool part", async () => {
    const afterUser = appendUserTurn([], "quiero armar una sociedad de software");
    const history = appendAssistantTurn(afterUser, "listo, aca esta el borrador", [
      toolPart(
        "preview_society",
        "call_1",
        { prompt: "una sociedad de software" },
        { ok: true, draft: { denominacion: "Sociedad Ejemplo", tipo: "SOCIEDAD-IA" } },
      ),
    ]);

    const result = await safeValidateUIMessages({ messages: history });

    expect(result.success).toBe(true);
  });

  it("accepts a tool-only assistant turn (empty text, one resolved tool part)", async () => {
    const afterUser = appendUserTurn([], "cambia el capital a 500000");
    const history = appendAssistantTurn(afterUser, "", [
      toolPart(
        "preview_society",
        "call_2",
        { prompt: "cambia el capital a 500000" },
        { ok: true, draft: { denominacion: "Sociedad Ejemplo", capitalSocial: 500000 } },
      ),
    ]);

    // The assistant message here has no text part at all (messages.ts never
    // appends an empty one), only the tool part.
    expect(history[1]?.parts).toEqual([
      {
        type: "dynamic-tool",
        toolName: "preview_society",
        toolCallId: "call_2",
        state: "output-available",
        input: { prompt: "cambia el capital a 500000" },
        output: { ok: true, draft: { denominacion: "Sociedad Ejemplo", capitalSocial: 500000 } },
      },
    ]);

    const result = await safeValidateUIMessages({ messages: history });

    expect(result.success).toBe(true);
  });
});
