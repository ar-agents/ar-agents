/**
 * Adapter tests. The whole point of HttpPadronAdapter is that we never
 * hit the real network here — every test injects a deterministic
 * FetchLike. If you find yourself wanting to add a real-network test,
 * stop and write a host-side integration test instead.
 */
import { describe, expect, it, vi } from "vitest";
import {
  AgipPublicAdapter,
  ArbaCitAdapter,
  type FetchLike,
  HttpPadronAdapter,
  UnconfiguredIibbAdapter,
} from "../src/adapter";
import { IibbUnconfiguredError } from "../src/errors";
import type { JurisdictionCode, Padron } from "../src/types";

function mockFetch(
  responder: (url: string, init: { method?: string; body?: string }) => {
    ok: boolean;
    status: number;
    text: string;
  } | Promise<{ ok: boolean; status: number; text: string }>,
): FetchLike {
  return async (url, init = {}) => {
    const r = await responder(url, init);
    return {
      ok: r.ok,
      status: r.status,
      text: async () => r.text,
    };
  };
}

describe("UnconfiguredIibbAdapter", () => {
  it("throws IibbUnconfiguredError on lookupPadron", async () => {
    const a = new UnconfiguredIibbAdapter("CABA");
    await expect(a.lookupPadron("20000000000")).rejects.toThrow(
      IibbUnconfiguredError,
    );
  });

  it("throws IibbUnconfiguredError on submitDdjj", async () => {
    const a = new UnconfiguredIibbAdapter("BSAS");
    await expect(a.submitDdjj({})).rejects.toThrow(IibbUnconfiguredError);
  });
});

describe("HttpPadronAdapter (via AgipPublicAdapter)", () => {
  it("calls the configured endpoint with the cuit interpolated", async () => {
    const spy = vi.fn(() => ({ ok: true, status: 200, text: "" }));
    const a = new AgipPublicAdapter({
      fetch: mockFetch(spy),
      endpointTemplate: "https://example.test/{cuit}",
    });
    // Empty body fails parse, but we only assert the URL got built.
    await expect(a.lookupPadron("20417581015")).rejects.toThrow(
      IibbUnconfiguredError,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const [url] = spy.mock.calls[0]!;
    expect(url).toBe("https://example.test/20417581015");
  });

  it("returns null when HTTP 404 (taxpayer-not-found in some jurisdictions)", async () => {
    const a = new AgipPublicAdapter({
      fetch: mockFetch(() => ({ ok: false, status: 404, text: "Not Found" })),
    });
    const r = await a.lookupPadron("20111111110");
    expect(r).toBeNull();
  });

  it("surfaces non-2xx non-404 as IibbUnconfiguredError (not a silent null)", async () => {
    const a = new AgipPublicAdapter({
      fetch: mockFetch(() => ({
        ok: false,
        status: 503,
        text: "Service Unavailable",
      })),
    });
    await expect(a.lookupPadron("20111111110")).rejects.toThrow(
      /HTTP 503/,
    );
  });

  it("surfaces fetch errors with the jurisdiction prefix", async () => {
    const a = new AgipPublicAdapter({
      fetch: () => Promise.reject(new Error("connection refused")),
    });
    await expect(a.lookupPadron("20111111110")).rejects.toThrow(
      /CABA HTTP error: connection refused/,
    );
  });

  it("times out long-running requests", async () => {
    const a = new AgipPublicAdapter({
      fetch: () => new Promise(() => {}), // never resolves
      timeoutMs: 50,
    });
    await expect(a.lookupPadron("20111111110")).rejects.toThrow(/timeout/);
  });

  it("includes a User-Agent header by default", async () => {
    const spy = vi.fn(() => ({ ok: true, status: 200, text: "" }));
    const a = new AgipPublicAdapter({ fetch: mockFetch(spy) });
    await expect(a.lookupPadron("20111111110")).rejects.toThrow();
    const [, init] = spy.mock.calls[0]!;
    expect(init).toBeDefined();
    const headers = (init as { headers: Record<string, string> }).headers;
    expect(headers["user-agent"]).toMatch(/@ar-agents\/iibb/);
  });
});

describe("AgipPublicAdapter parsing", () => {
  function adapterFor(text: string, status = 200) {
    return new AgipPublicAdapter({
      fetch: mockFetch(() => ({ ok: status < 400, status, text })),
    });
  }

  it("parses JSON inscripto:true as inscribed local", async () => {
    const a = adapterFor(
      JSON.stringify({ inscripto: true, regimen: "local" }),
    );
    const r = await a.lookupPadron("20111111110");
    expect(r).toEqual<Padron>({
      cuit: "20111111110",
      jurisdiction: "CABA",
      inscribed: true,
      regime: "local",
    });
  });

  it("parses JSON regimen:CM as cm regime", async () => {
    const a = adapterFor(JSON.stringify({ inscripto: true, regimen: "CM" }));
    const r = await a.lookupPadron("20111111110");
    expect(r?.regime).toBe("cm");
  });

  it("parses JSON inscripto:false as null", async () => {
    const a = adapterFor(JSON.stringify({ inscripto: false }));
    const r = await a.lookupPadron("20111111110");
    expect(r).toBeNull();
  });

  it("parses HTML 'no se encuentra inscripto' as null", async () => {
    const a = adapterFor(
      "<html><body>El contribuyente no se encuentra inscripto.</body></html>",
    );
    const r = await a.lookupPadron("20111111110");
    expect(r).toBeNull();
  });

  it("parses HTML 'inscripto' token as inscribed", async () => {
    const a = adapterFor(
      "<html><body>Contribuyente inscripto en el régimen local.</body></html>",
    );
    const r = await a.lookupPadron("20111111110");
    expect(r?.inscribed).toBe(true);
    expect(r?.regime).toBe("local");
  });

  it("recognizes 'convenio multilateral' phrase in HTML", async () => {
    const a = adapterFor(
      "<html><body>Inscripto en Convenio Multilateral.</body></html>",
    );
    const r = await a.lookupPadron("20111111110");
    expect(r?.regime).toBe("cm");
  });

  it("throws when the response shape is unrecognized (no silent null)", async () => {
    const a = adapterFor("<html><body>maintenance window</body></html>");
    await expect(a.lookupPadron("20111111110")).rejects.toThrow(
      /did not match known shapes/,
    );
  });

  it("captures nroInscripcion when present in JSON", async () => {
    const a = adapterFor(
      JSON.stringify({ inscripto: true, nroInscripcion: "901-12345-678" }),
    );
    const r = await a.lookupPadron("20111111110");
    expect(r?.inscriptionNumber).toBe("901-12345-678");
  });
});

describe("ArbaCitAdapter parsing", () => {
  function adapterFor(text: string, status = 200) {
    return new ArbaCitAdapter({
      fetch: mockFetch(() => ({ ok: status < 400, status, text })),
    });
  }

  it("parses JSON inscripto:true as inscribed local", async () => {
    const a = adapterFor(JSON.stringify({ inscripto: true }));
    const r = await a.lookupPadron("20111111110");
    expect(r).toEqual<Padron>({
      cuit: "20111111110",
      jurisdiction: "BSAS",
      inscribed: true,
      regime: "local",
    });
  });

  it("parses JSON regimen:Convenio as cm", async () => {
    const a = adapterFor(
      JSON.stringify({ inscripto: true, regimen: "Convenio" }),
    );
    const r = await a.lookupPadron("20111111110");
    expect(r?.regime).toBe("cm");
  });

  it("parses XML <inscripto>true</inscripto>", async () => {
    const a = adapterFor(
      "<?xml version='1.0'?><respuesta><inscripto>true</inscripto><regimen>LOCAL</regimen></respuesta>",
    );
    const r = await a.lookupPadron("20111111110");
    expect(r?.inscribed).toBe(true);
    expect(r?.regime).toBe("local");
  });

  it("parses XML <inscripto>false</inscripto> as null", async () => {
    const a = adapterFor(
      "<?xml version='1.0'?><respuesta><inscripto>false</inscripto></respuesta>",
    );
    const r = await a.lookupPadron("20111111110");
    expect(r).toBeNull();
  });

  it("recognizes CM in XML regimen tag", async () => {
    const a = adapterFor(
      "<respuesta><inscripto>true</inscripto><regimen>CM</regimen></respuesta>",
    );
    const r = await a.lookupPadron("20111111110");
    expect(r?.regime).toBe("cm");
  });

  it("requires a fetch wrapper at the type level (CIT auth)", () => {
    // ArbaCitAdapter's *type* makes `fetch` required (because plain
    // globalThis.fetch won't carry CIT). Runtime can't tell the
    // difference once the type guard is bypassed, so this test only
    // documents the type-level contract — see the // @ts-expect-error
    // line below: removing the assertion would compile-error.
    // @ts-expect-error fetch is required on ArbaCitAdapterOptions.
    const x: ArbaCitAdapter = new ArbaCitAdapter({});
    expect(x.jurisdiction).toBe("BSAS");
  });
});

describe("HttpPadronAdapter submitDdjj", () => {
  it("explicitly refuses submission with a clear message", async () => {
    const a = new AgipPublicAdapter({
      fetch: mockFetch(() => ({ ok: true, status: 200, text: "" })),
    });
    await expect(a.submitDdjj({})).rejects.toThrow(
      /not exposed via this package/,
    );
  });
});

describe("Subclassing HttpPadronAdapter", () => {
  class DgrSantaFeAdapter extends HttpPadronAdapter {
    readonly jurisdiction: JurisdictionCode = "SF";
    protected buildLookupRequest(cuit: string) {
      return { url: `https://example.api/sf/${cuit}`, method: "GET" };
    }
    protected parseLookupResponse(text: string, cuit: string): Padron | null {
      if (text === "NF") return null;
      return {
        cuit,
        jurisdiction: "SF",
        inscribed: true,
        regime: "local",
      };
    }
  }

  it("hosts can subclass for jurisdictions the package doesn't ship", async () => {
    const a = new DgrSantaFeAdapter({
      fetch: mockFetch(() => ({ ok: true, status: 200, text: "OK" })),
    });
    const r = await a.lookupPadron("20999999999");
    expect(r?.jurisdiction).toBe("SF");
    expect(r?.inscribed).toBe(true);
  });

  it("subclass returns null when its parser detects not-found", async () => {
    const a = new DgrSantaFeAdapter({
      fetch: mockFetch(() => ({ ok: true, status: 200, text: "NF" })),
    });
    const r = await a.lookupPadron("20999999999");
    expect(r).toBeNull();
  });
});
