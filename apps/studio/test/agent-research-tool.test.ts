import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildTools } from "../src/app/api/agent/route";

const saved: { TAVILY_API_KEY?: string } = {};

beforeEach(() => {
  saved.TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
});

afterEach(() => {
  if (saved.TAVILY_API_KEY === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = saved.TAVILY_API_KEY;
});

describe("buildTools: research_web registration", () => {
  it("does not register research_web when TAVILY_API_KEY is unset", () => {
    const tools = buildTools("acc_1");
    expect(Object.keys(tools)).not.toContain("research_web");
    // The always-on tools stay present regardless.
    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining(["preview_society", "good_standing", "my_society"]),
    );
  });

  it("registers research_web when TAVILY_API_KEY is set", () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const tools = buildTools("acc_1");
    expect(Object.keys(tools)).toContain("research_web");
  });
});
