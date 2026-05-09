import { describe, expect, it, vi } from "vitest";
import {
  describe as describeEndpoint,
  fetchAudit,
  incorporate,
  incorporateOrThrow,
  IncorporateError,
  IncorporateValidationError,
  PIEZA_IDS,
  REQUIRED_PIEZAS,
} from "../src/index";

const baseInput = {
  denominacion: "ACME-AI SAS",
  tipo: "SAS" as const,
  capitalSocial: 200_000,
  objeto: "Desarrollo y comercialización de software propio para empresas argentinas.",
};

describe("constants", () => {
  it("exports the canonical PIEZA_IDS list", () => {
    expect(PIEZA_IDS).toContain("identity");
    expect(PIEZA_IDS).toContain("mercadolibre");
    expect(PIEZA_IDS).toHaveLength(16);
  });
  it("exports REQUIRED_PIEZAS as a strict subset", () => {
    for (const r of REQUIRED_PIEZAS) {
      expect(PIEZA_IDS).toContain(r);
    }
  });
});

describe("incorporate()", () => {
  it("posts to /api/auto-incorporate and returns the success envelope", async () => {
    const fakeResp = {
      ok: true,
      sociedad: { denominacion: "ACME-AI SAS", tipo: "SAS", capitalSocial: 200_000, slug: "acme-ai-sas" },
      validation: { valid: true, findings: [] },
      config: {},
      envVars: [],
      checklist: [],
      deploy: { target: "vercel", oneClickUrl: "https://x", sourceUrl: "https://y", manualSteps: [] },
      audit: { sessionId: "s", backend: "vercel-kv", entry: {}, url: "u", verifyUrl: "vu", dashboardUrl: "du" },
      rfc001: { version: "1.0", url: "https://r" },
      generatedAt: "2026-05-09T00:00:00Z",
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fakeResp), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const r = await incorporate(baseInput, { fetchImpl });
    expect(r.ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ar-agents.vercel.app/api/auto-incorporate");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toMatchObject({ denominacion: "ACME-AI SAS" });
  });

  it("returns the validation-failure envelope for HTTP 422", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          validation: {
            valid: false,
            findings: [
              {
                code: "denominacion_reserved_word",
                severity: "error",
                field: "denominacion",
                message: "reserved",
              },
            ],
          },
          rfc001: { version: "1.0", url: "https://r" },
        }),
        { status: 422, headers: { "content-type": "application/json" } },
      ),
    );
    const r = await incorporate({ ...baseInput, denominacion: "ACME Nacional SAS" }, { fetchImpl });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.validation.findings[0]?.code).toBe("denominacion_reserved_word");
    }
  });

  it("throws IncorporateError on HTTP 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(incorporate(baseInput, { fetchImpl })).rejects.toBeInstanceOf(
      IncorporateError,
    );
  });

  it("throws IncorporateError on HTTP 429", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "rate_limited" }), { status: 429 }),
    );
    try {
      await incorporate(baseInput, { fetchImpl });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(IncorporateError);
      const err = e as IncorporateError;
      expect(err.status).toBe(429);
    }
  });

  it("respects custom baseUrl + headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          sociedad: { denominacion: "x", tipo: "SAS", capitalSocial: 1, slug: "x" },
          validation: { valid: true, findings: [] },
          config: {},
          envVars: [],
          checklist: [],
          deploy: { target: "vercel", oneClickUrl: "x", sourceUrl: "y", manualSteps: [] },
          audit: { sessionId: "s", backend: "in-memory", entry: {}, url: "u", verifyUrl: "v", dashboardUrl: "d" },
          rfc001: { version: "1.0", url: "https://r" },
          generatedAt: "2026-05-09T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    await incorporate(baseInput, {
      fetchImpl,
      baseUrl: "https://staging.example.com/",
      headers: { "x-trace-id": "abc" },
    });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://staging.example.com/api/auto-incorporate");
    expect(init.headers).toMatchObject({ "x-trace-id": "abc" });
  });
});

describe("incorporateOrThrow()", () => {
  it("returns success directly", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          sociedad: { denominacion: "x", tipo: "SAS", capitalSocial: 1, slug: "x" },
          validation: { valid: true, findings: [] },
          config: {},
          envVars: [],
          checklist: [],
          deploy: { target: "vercel", oneClickUrl: "x", sourceUrl: "y", manualSteps: [] },
          audit: { sessionId: "s", backend: "in-memory", entry: {}, url: "u", verifyUrl: "v", dashboardUrl: "d" },
          rfc001: { version: "1.0", url: "https://r" },
          generatedAt: "2026-05-09T00:00:00Z",
        }),
        { status: 200 },
      ),
    );
    const r = await incorporateOrThrow(baseInput, { fetchImpl });
    expect(r.ok).toBe(true);
  });

  it("throws IncorporateValidationError when validation fails", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          validation: {
            valid: false,
            findings: [
              {
                code: "capital_below_minimum",
                severity: "error",
                field: "capitalSocial",
                message: "too low",
              },
            ],
          },
          rfc001: { version: "1.0", url: "https://r" },
        }),
        { status: 422 },
      ),
    );
    await expect(
      incorporateOrThrow(baseInput, { fetchImpl }),
    ).rejects.toBeInstanceOf(IncorporateValidationError);
  });
});

describe("describe()", () => {
  it("hits GET /api/auto-incorporate", async () => {
    const fakeSchema = { endpoint: "/api/auto-incorporate", method: "POST" };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(fakeSchema), { status: 200 }),
    );
    const r = await describeEndpoint({ fetchImpl });
    expect(r).toMatchObject({ endpoint: "/api/auto-incorporate" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ar-agents.vercel.app/api/auto-incorporate");
    expect(init.method).toBe("GET");
  });
});

describe("fetchAudit()", () => {
  it("hits /api/play/audit/{id}", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ sessionId: "abc12345", count: 0, entries: [] }),
        { status: 200 },
      ),
    );
    const r = await fetchAudit("abc12345", { fetchImpl });
    expect(r).toMatchObject({ sessionId: "abc12345" });
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ar-agents.vercel.app/api/play/audit/abc12345");
  });
  it("appends ?verify=1 when verify is true", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    await fetchAudit("abc12345", { fetchImpl, verify: true });
    const [url] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://ar-agents.vercel.app/api/play/audit/abc12345?verify=1");
  });
});
