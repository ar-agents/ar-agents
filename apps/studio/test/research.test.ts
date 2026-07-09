import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { researchWeb, tavilyConfigured } from "../src/lib/research";

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

describe("tavilyConfigured", () => {
  it("false when TAVILY_API_KEY is unset", () => {
    expect(tavilyConfigured()).toBe(false);
  });

  it("true when TAVILY_API_KEY is set", () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    expect(tavilyConfigured()).toBe(true);
  });

  it("false for a blank/whitespace-only key", () => {
    process.env.TAVILY_API_KEY = "   ";
    expect(tavilyConfigured()).toBe(false);
  });
});

describe("researchWeb", () => {
  it("returns a string without hitting the network when TAVILY_API_KEY is unset", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const result = await researchWeb("mercado de pagos en Argentina");
    expect(typeof result).toBe("string");
    expect(result).toBe("busqueda_web_no_configurada");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a formatted string on a successful Tavily response, never throwing", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          answer: "Resumen de prueba",
          results: [
            { title: "Título 1", url: "https://example.com/1", content: "fragmento 1" },
            { title: "Título 2", url: "https://example.com/2", content: "fragmento 2" },
          ],
        }),
      }),
    );
    const result = await researchWeb("competencia de billeteras virtuales");
    expect(typeof result).toBe("string");
    expect(result).toContain("https://example.com/1");
    expect(result).toContain("Título 2");
  });

  it("degrades to an error string (never throws) on a fetch timeout/network failure", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new DOMException("The operation was aborted", "TimeoutError")),
    );
    let result: string | undefined;
    await expect(
      (async () => {
        result = await researchWeb("query que tardo demasiado");
      })(),
    ).resolves.not.toThrow();
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^busqueda_web_fallo/);
  });

  it("degrades to an error string (never throws) on a non-200 response", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "unauthorized" }),
      }),
    );
    const result = await researchWeb("query con api key invalida");
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^busqueda_web_fallo/);
    expect(result).toContain("401");
  });

  it("degrades to an error string when the response body is not valid JSON", async () => {
    process.env.TAVILY_API_KEY = "tvly-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("invalid json");
        },
      }),
    );
    const result = await researchWeb("query con respuesta rota");
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^busqueda_web_fallo/);
  });
});
