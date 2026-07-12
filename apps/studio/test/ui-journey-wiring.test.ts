/**
 * Integration-level test for the journey rail's real signal chain, exactly
 * as src/components/chat.tsx wires it: raw AI-SDK UIMessage parts ->
 * latestToolPart (src/lib/ui/tool-parts.ts) -> hasPreviewDraft ->
 * inferStage/stageIndex (src/lib/ui/stage.ts) -> <JourneyRail>.
 *
 * ROADMAP.md M1-5 friction log (found live 2026-07-12): "TU RECORRIDO"
 * stayed pinned on step 1 "Idea" through a whole stranger conversation, even
 * after a preview_society draft existed and while the constitution dialog
 * was open. test/ui-stage.test.ts already proves inferStage() is correct in
 * isolation, and test/ui-tool-parts.test.ts proves latestToolPart() is
 * correct in isolation, but nothing proved the two compose correctly the way
 * chat.tsx actually calls them -- that seam is exactly where a regression
 * like the one reported could hide undetected. This file closes that gap
 * without any new state store: every signal below is derived purely from
 * the same `messages` array + `constituting` flag chat.tsx already has.
 */

import { describe, expect, it } from "vitest";
import { latestToolPart, type MinimalUIMessage } from "../src/lib/ui/tool-parts";
import { inferStage, stageIndex } from "../src/lib/ui/stage";

/** Mirrors chat.tsx's exact derivation: a completed preview_society part
 *  means a draft exists, full stop. */
function hasPreviewDraft(messages: MinimalUIMessage[]): boolean {
  return latestToolPart(messages, "preview_society") !== null;
}

function userMessage(id: string): MinimalUIMessage {
  return { id, role: "user", parts: [{ type: "text" }] };
}

describe("journey rail wiring: messages -> hasPreviewDraft -> stage", () => {
  it("stays on idea/validacion while no draft has been produced yet", () => {
    const messages: MinimalUIMessage[] = [
      userMessage("u1"),
      { id: "a1", role: "assistant", parts: [{ type: "text" }] },
    ];
    const stage = inferStage({
      hasSociety: false,
      hasPreviewDraft: hasPreviewDraft(messages),
      constituting: false,
      messageCount: messages.length,
    });
    expect(stage).toBe("idea");
    expect(stageIndex(stage)).toBe(0);
  });

  it("advances to spec the moment a preview_society draft completes -- the exact miss in the friction report", () => {
    const messages: MinimalUIMessage[] = [
      userMessage("u1"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          { type: "text" },
          {
            type: "dynamic-tool",
            toolName: "preview_society",
            state: "output-available",
            output: { draft: { denominacion: "Panadería Automatizada SAS" } },
          },
        ],
      },
    ];
    const stage = inferStage({
      hasSociety: false,
      hasPreviewDraft: hasPreviewDraft(messages),
      constituting: false,
      messageCount: messages.length,
    });
    expect(stage).toBe("spec");
    expect(stageIndex(stage)).toBeGreaterThan(0);
  });

  it("does not advance while preview_society is still mid-call (input-streaming, no output yet)", () => {
    const messages: MinimalUIMessage[] = [
      userMessage("u1"),
      {
        id: "a1",
        role: "assistant",
        parts: [{ type: "dynamic-tool", toolName: "preview_society", state: "input-streaming" }],
      },
    ];
    const stage = inferStage({
      hasSociety: false,
      hasPreviewDraft: hasPreviewDraft(messages),
      constituting: false,
      messageCount: messages.length,
    });
    expect(stage).toBe("idea");
  });

  it("moves to constitucion once the confirm dialog opens, even though the draft (and its messages) are unchanged", () => {
    const messages: MinimalUIMessage[] = [
      userMessage("u1"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "preview_society",
            state: "output-available",
            output: { draft: { denominacion: "Kiosco SAS" } },
          },
        ],
      },
    ];
    const draftPresent = hasPreviewDraft(messages);

    const stageWithDialogClosed = inferStage({
      hasSociety: false,
      hasPreviewDraft: draftPresent,
      constituting: false,
      messageCount: messages.length,
    });
    expect(stageWithDialogClosed).toBe("spec");

    // Same messages, same draft -- only the dialog's open/close flag differs.
    const stageWithDialogOpen = inferStage({
      hasSociety: false,
      hasPreviewDraft: draftPresent,
      constituting: true,
      messageCount: messages.length,
    });
    expect(stageWithDialogOpen).toBe("constitucion");
    expect(stageIndex(stageWithDialogOpen)).toBeGreaterThan(stageIndex(stageWithDialogClosed));
  });

  it("reaches operacion once a society exists, regardless of the in-flight draft/dialog state", () => {
    const messages: MinimalUIMessage[] = [
      userMessage("u1"),
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "preview_society",
            state: "output-available",
            output: { draft: { denominacion: "Kiosco SAS" } },
          },
        ],
      },
    ];
    const stage = inferStage({
      hasSociety: true,
      hasPreviewDraft: hasPreviewDraft(messages),
      constituting: true,
      messageCount: messages.length,
    });
    expect(stage).toBe("operacion");
    expect(stageIndex(stage)).toBe(4);
  });
});
