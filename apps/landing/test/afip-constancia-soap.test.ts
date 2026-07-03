import { afterEach, describe, expect, it } from "vitest";
import type { AfipPadronData } from "@ar-agents/identity";
import type { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import {
  isSoapConfigured,
  mapPadronToConstancia,
  SoapConstanciaFetcher,
} from "../src/lib/afip-constancia-soap";

// Fictional identity only (see repo rule: no real PII in fixtures).
const CUIT = "20123456786"; // 20-12345678-6, valid check digit
const CUIT_JURIDICA = "30123456781";

function padron(overrides: Partial<AfipPadronData> = {}): AfipPadronData {
  return {
    nombre: "PEREZ JUAN",
    condicion: "MONOTRIBUTO",
    monotributoCategoria: "a",
    fechaInscripcion: "2026-04-17",
    domicilioFiscal: "CALLE FALSA 123",
    actividades: ["Servicios de programación informática", "Otra actividad"],
    ...overrides,
  };
}

/** Structural fake — SoapConstanciaFetcher only ever calls `.lookup`. */
function fakeAdapter(
  lookup: WsaaWscdcAfipPadronAdapter["lookup"],
): WsaaWscdcAfipPadronAdapter {
  return { lookup } as unknown as WsaaWscdcAfipPadronAdapter;
}

describe("mapPadronToConstancia", () => {
  it("maps a monotributista, uppercasing the categoría", () => {
    const c = mapPadronToConstancia(CUIT, padron());
    expect(c.cuit).toBe(CUIT);
    expect(c.denominacion).toBe("PEREZ JUAN");
    expect(c.tipoPersona).toBe("fisica");
    expect(c.condicion).toBe("monotributo");
    expect(c.monotributoCategoria).toBe("A");
    expect(c.fechaInscripcion).toBe("2026-04-17");
    expect(c.domicilioFiscal).toEqual({ direccion: "CALLE FALSA 123" });
  });

  it("marks only the first actividad as principal and drops blanks", () => {
    const c = mapPadronToConstancia(
      CUIT,
      padron({ actividades: ["  ", "Consultoría", ""] }),
    );
    expect(c.actividades).toEqual([
      { codigo: "", descripcion: "Consultoría", principal: true },
    ]);
  });

  it("infers persona jurídica from the 30/33/34 prefix", () => {
    const c = mapPadronToConstancia(
      CUIT_JURIDICA,
      padron({ nombre: "ACME SA", condicion: "RESPONSABLE INSCRIPTO" }),
    );
    expect(c.tipoPersona).toBe("juridica");
    expect(c.condicion).toBe("responsable_inscripto");
  });

  it("maps NO RESPONSABLE / CONSUMIDOR FINAL to no_alcanzado, unknown to desconocida", () => {
    expect(
      mapPadronToConstancia(CUIT, padron({ condicion: "CONSUMIDOR FINAL" }))
        .condicion,
    ).toBe("no_alcanzado");
    expect(
      mapPadronToConstancia(CUIT, padron({ condicion: "ALGO RARO" })).condicion,
    ).toBe("desconocida");
  });

  it("omits optional fields when absent rather than emitting empties", () => {
    const c = mapPadronToConstancia(
      CUIT,
      padron({
        monotributoCategoria: null,
        domicilioFiscal: null,
        actividades: [],
        fechaInscripcion: null,
      }),
    );
    expect(c.monotributoCategoria).toBeUndefined();
    expect(c.domicilioFiscal).toBeUndefined();
    expect(c.actividades).toBeUndefined();
    expect(c.fechaInscripcion).toBeUndefined();
  });
});

describe("SoapConstanciaFetcher", () => {
  it("returns available:true with source padron-soap and no PDF on success", async () => {
    const fetcher = new SoapConstanciaFetcher(
      fakeAdapter(async (cuit) => ({
        cuit,
        available: true,
        error: null,
        data: padron(),
      })),
    );
    const r = await fetcher.getConstancia("20-12345678-6");
    expect(r.available).toBe(true);
    expect(r.source).toBe("padron-soap");
    expect(r.pdf).toBeNull();
    expect(r.data?.condicion).toBe("monotributo");
  });

  it("surfaces the adapter error verbatim as available:false, never fabricates", async () => {
    const fetcher = new SoapConstanciaFetcher(
      fakeAdapter(async (cuit) => ({
        cuit,
        available: false,
        error: "cert not authorized for ws_sr_constancia_inscripcion",
        data: null,
      })),
    );
    const r = await fetcher.getConstancia(CUIT);
    expect(r.available).toBe(false);
    expect(r.data).toBeNull();
    expect(r.error).toContain("cert not authorized");
    expect(r.source).toBe("padron-soap");
  });

  it("rejects a malformed CUIT before hitting the adapter", async () => {
    let called = false;
    const fetcher = new SoapConstanciaFetcher(
      fakeAdapter(async (cuit) => {
        called = true;
        return { cuit, available: false, error: "x", data: null };
      }),
    );
    const r = await fetcher.getConstancia("123");
    expect(called).toBe(false);
    expect(r.available).toBe(false);
    expect(r.error).toContain("invalid_cuit");
  });
});

describe("isSoapConfigured", () => {
  const KEYS = ["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT"] as const;
  afterEach(() => {
    for (const k of KEYS) delete process.env[k];
  });

  it("is false unless all three env vars are present", () => {
    expect(isSoapConfigured()).toBe(false);
    process.env.AFIP_CERT_PEM = "cert";
    process.env.AFIP_KEY_PEM = "key";
    expect(isSoapConfigured()).toBe(false);
    process.env.AFIP_CUIT = "20123456786";
    expect(isSoapConfigured()).toBe(true);
  });
});
