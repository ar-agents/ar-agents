import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTools, MAX_PREVIEW_CALLS_PER_REQUEST, MAX_RESEARCH_CALLS_PER_REQUEST } from "../src/app/api/agent/route";

const saved: { TAVILY_API_KEY?: string } = {};

beforeEach(() => {
  saved.TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  delete process.env.TAVILY_API_KEY;
});

afterEach(() => {
  if (saved.TAVILY_API_KEY === undefined) delete process.env.TAVILY_API_KEY;
  else process.env.TAVILY_API_KEY = saved.TAVILY_API_KEY;
  vi.unstubAllGlobals();
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

describe("buildTools: research_web per-request cap", () => {
  function stubTavilyFetch() {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        answer: "Resumen de prueba",
        results: [{ title: "Título", url: "https://example.com/1", content: "fragmento" }],
      }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    return fetchSpy;
  }

  async function execResearch(tools: ReturnType<typeof buildTools>, query: string) {
    const research = (tools as Record<string, unknown>).research_web as {
      execute: (input: { query: string }, options: unknown) => Promise<unknown>;
    };
    return research.execute({ query }, { toolCallId: "call-test", messages: [] });
  }

  it(`executes up to ${MAX_RESEARCH_CALLS_PER_REQUEST} real searches, then returns the cap notice without fetching`, async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const fetchSpy = stubTavilyFetch();
    const tools = buildTools("acc_1");

    for (let i = 0; i < MAX_RESEARCH_CALLS_PER_REQUEST; i++) {
      const result = await execResearch(tools, `consulta ${i}`);
      expect(typeof result).toBe("string"); // researchWeb's formatted result
    }
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_RESEARCH_CALLS_PER_REQUEST);

    const capped = await execResearch(tools, "consulta de más");
    expect(capped).toMatchObject({ ok: false, error: "research_cap" });
    // No extra network call past the cap.
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_RESEARCH_CALLS_PER_REQUEST);
  });

  it("the cap counter is per buildTools call (per request), not global", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    const fetchSpy = stubTavilyFetch();

    const first = buildTools("acc_1");
    for (let i = 0; i <= MAX_RESEARCH_CALLS_PER_REQUEST; i++) await execResearch(first, `q${i}`);
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_RESEARCH_CALLS_PER_REQUEST);

    // A fresh request (fresh buildTools) starts from zero again.
    const second = buildTools("acc_1");
    const result = await execResearch(second, "otra consulta");
    expect(typeof result).toBe("string");
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_RESEARCH_CALLS_PER_REQUEST + 1);
  });
});

describe("buildTools: preview_society per-request cap", () => {
  async function execPreview(tools: ReturnType<typeof buildTools>, prompt: string) {
    const preview = (tools as Record<string, unknown>).preview_society as {
      execute: (input: { prompt: string }, options: unknown) => Promise<unknown>;
    };
    return preview.execute({ prompt }, { toolCallId: "call-test", messages: [] });
  }

  it("caps real preview generations per request and returns a no-retry note past the cap", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, dryRun: true, draft: { denominacion: "Prueba SAS" } }),
    });
    vi.stubGlobal("fetch", fetchSpy);
    const tools = buildTools("acc_1");

    for (let i = 0; i < MAX_PREVIEW_CALLS_PER_REQUEST; i++) {
      await execPreview(tools, `sociedad de prueba ${i}`);
    }
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_PREVIEW_CALLS_PER_REQUEST);

    const capped = (await execPreview(tools, "una más")) as { ok: boolean; error: string; note?: string };
    expect(capped).toMatchObject({ ok: false, error: "preview_cap" });
    expect(capped.note).toMatch(/NO vuelvas a llamar preview_society/);
    expect(fetchSpy).toHaveBeenCalledTimes(MAX_PREVIEW_CALLS_PER_REQUEST);
  });

  it("an upstream failure carries the same no-retry note", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({ error: "boom" }) }),
    );
    const tools = buildTools("acc_1");
    const failed = (await execPreview(tools, "sociedad de prueba")) as { ok: boolean; note?: string };
    expect(failed.ok).toBe(false);
    expect(failed.note).toMatch(/NO vuelvas a llamar preview_society/);
  });
});
