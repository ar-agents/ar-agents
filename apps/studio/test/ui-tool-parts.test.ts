import { describe, expect, it } from "vitest";
import {
  collectToolParts,
  isToolPending,
  latestToolOutput,
  latestToolPart,
  toolPartName,
  type MinimalUIMessage,
} from "../src/lib/ui/tool-parts";

describe("toolPartName", () => {
  it("reads the name off a static tool part", () => {
    expect(toolPartName({ type: "tool-preview_society" })).toBe("preview_society");
  });

  it("reads the name off a dynamic tool part", () => {
    expect(toolPartName({ type: "dynamic-tool", toolName: "good_standing" })).toBe(
      "good_standing",
    );
  });

  it("returns null for a dynamic-tool part missing a name", () => {
    expect(toolPartName({ type: "dynamic-tool" })).toBeNull();
  });

  it("returns null for a non-tool part", () => {
    expect(toolPartName({ type: "text" })).toBeNull();
    expect(toolPartName({ type: "step-start" })).toBeNull();
  });
});

const messages: MinimalUIMessage[] = [
  {
    id: "m1",
    role: "user",
    parts: [{ type: "text" }],
  },
  {
    id: "m2",
    role: "assistant",
    parts: [
      { type: "text" },
      {
        type: "tool-preview_society",
        state: "output-available",
        output: { draft: { denominacion: "Kiosco SAS" } },
      },
      { type: "dynamic-tool", toolName: "good_standing", state: "input-streaming" },
    ],
  },
  {
    id: "m3",
    role: "assistant",
    parts: [
      {
        type: "tool-preview_society",
        state: "output-available",
        output: { draft: { denominacion: "Kiosco SAS v2" } },
      },
    ],
  },
];

describe("collectToolParts", () => {
  it("collects every tool part across all messages, in order", () => {
    const parts = collectToolParts(messages);
    expect(parts.map((p) => `${p.message.id}:${p.name}:${p.part.state}`)).toEqual([
      "m2:preview_society:output-available",
      "m2:good_standing:input-streaming",
      "m3:preview_society:output-available",
    ]);
  });
});

describe("latestToolOutput", () => {
  it("returns the most recent output-available result for a tool", () => {
    expect(latestToolOutput(messages, "preview_society")).toEqual({
      draft: { denominacion: "Kiosco SAS v2" },
    });
  });

  it("returns undefined for a tool that never completed", () => {
    expect(latestToolOutput(messages, "good_standing")).toBeUndefined();
  });

  it("returns undefined for a tool never called", () => {
    expect(latestToolOutput(messages, "my_society")).toBeUndefined();
  });
});

describe("latestToolPart", () => {
  it("returns the whole part (not just its output) for the most recent completed call", () => {
    const part = latestToolPart(messages, "preview_society");
    expect(part).not.toBeNull();
    expect((part as { output?: unknown })?.output).toEqual({
      draft: { denominacion: "Kiosco SAS v2" },
    });
    // Same object reference as the part in message m3 -- callers (e.g. the
    // chat UI) rely on this to render exactly once, on the latest draft.
    expect(part).toBe(messages[2].parts[0]);
  });

  it("returns null for a tool that never completed", () => {
    expect(latestToolPart(messages, "good_standing")).toBeNull();
  });

  it("returns null for a tool never called", () => {
    expect(latestToolPart(messages, "my_society")).toBeNull();
  });

  it("agrees with latestToolOutput's output for the same tool", () => {
    const part = latestToolPart(messages, "preview_society") as { output?: unknown } | null;
    expect(part?.output).toEqual(latestToolOutput(messages, "preview_society"));
  });
});

describe("isToolPending", () => {
  it("is true while a tool has input but no output yet", () => {
    expect(isToolPending(messages, "good_standing")).toBe(true);
  });

  it("is false once the tool has a result", () => {
    expect(isToolPending(messages, "preview_society")).toBe(false);
  });

  it("is false for a tool never called", () => {
    expect(isToolPending(messages, "my_society")).toBe(false);
  });
});
