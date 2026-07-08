import { describe, expect, it } from "vitest";
import {
  collectToolParts,
  isToolPending,
  latestToolOutput,
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
