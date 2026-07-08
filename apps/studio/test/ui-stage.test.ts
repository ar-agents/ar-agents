import { describe, expect, it } from "vitest";
import { inferStage, stageIndex, STAGES, type StageSignals } from "../src/lib/ui/stage";

function signals(overrides: Partial<StageSignals>): StageSignals {
  return {
    hasSociety: false,
    hasPreviewDraft: false,
    messageCount: 0,
    ...overrides,
  };
}

describe("inferStage", () => {
  it("is idea with no messages, no draft, no society", () => {
    expect(inferStage(signals({ messageCount: 0 }))).toBe("idea");
  });

  it("stays idea below the message threshold", () => {
    expect(inferStage(signals({ messageCount: 4 }))).toBe("idea");
  });

  it("becomes validacion past the message threshold with no draft yet", () => {
    expect(inferStage(signals({ messageCount: 5 }))).toBe("validacion");
  });

  it("is spec once a preview_society draft has been seen, regardless of message count", () => {
    expect(inferStage(signals({ hasPreviewDraft: true, messageCount: 1 }))).toBe("spec");
    expect(inferStage(signals({ hasPreviewDraft: true, messageCount: 20 }))).toBe("spec");
  });

  it("is constitucion while the confirm dialog is open, even with a draft present", () => {
    expect(
      inferStage(signals({ hasPreviewDraft: true, constituting: true, messageCount: 3 })),
    ).toBe("constitucion");
  });

  it("is operacion once a society exists, overriding every other signal", () => {
    expect(
      inferStage(
        signals({
          hasSociety: true,
          hasPreviewDraft: true,
          constituting: true,
          messageCount: 50,
        }),
      ),
    ).toBe("operacion");
  });

  it("constituting has no effect once a society already exists", () => {
    expect(inferStage(signals({ hasSociety: true, constituting: true }))).toBe("operacion");
  });
});

describe("STAGES / stageIndex", () => {
  it("lists all five stages in journey order", () => {
    expect(STAGES.map((s) => s.id)).toEqual([
      "idea",
      "validacion",
      "spec",
      "constitucion",
      "operacion",
    ]);
  });

  it("resolves the index of each stage", () => {
    expect(stageIndex("idea")).toBe(0);
    expect(stageIndex("operacion")).toBe(4);
  });
});
