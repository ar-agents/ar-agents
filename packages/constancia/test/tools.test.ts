import { describe, expect, it } from "vitest";
import {
  type Constancia,
  type ConstanciaResult,
  constanciaTools,
  MockConstanciaFetcher,
} from "../src";

const sample: Constancia = {
  cuit: "20417581015",
  denominacion: "CLEMENTE NAZARENO",
  tipoPersona: "fisica",
  condicion: "monotributo",
  monotributoCategoria: "A",
};

const ctx = { toolCallId: "t1", messages: [] } as never;

describe("constanciaTools", () => {
  it("exposes the single expected tool", () => {
    const tools = constanciaTools();
    expect(Object.keys(tools)).toEqual(["constancia_inscripcion"]);
  });

  it("default fetcher is unconfigured but safe to call", async () => {
    const tools = constanciaTools();
    const r = (await tools.constancia_inscripcion!.execute!(
      { cuit: "20-41758101-5" },
      ctx,
    )) as ConstanciaResult;
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/not configured/i);
    expect(r.data).toBeNull();
  });

  it("uses a provided fetcher and returns the constancia", async () => {
    const tools = constanciaTools({
      fetcher: new MockConstanciaFetcher({ "20417581015": sample }),
    });
    const r = (await tools.constancia_inscripcion!.execute!(
      { cuit: "20417581015" },
      ctx,
    )) as ConstanciaResult;
    expect(r.available).toBe(true);
    expect(r.data?.denominacion).toBe("CLEMENTE NAZARENO");
    expect(r.source).toBe("mock");
  });

  it("returns cuit_not_found through the tool for an unknown CUIT", async () => {
    const tools = constanciaTools({
      fetcher: new MockConstanciaFetcher({ "20417581015": sample }),
    });
    const r = (await tools.constancia_inscripcion!.execute!(
      { cuit: "30-70750012-9" },
      ctx,
    )) as ConstanciaResult;
    expect(r.available).toBe(false);
    expect(r.error).toMatch(/cuit_not_found/);
  });

  it("overrides only the provided tool description", () => {
    const tools = constanciaTools({
      descriptions: { constancia_inscripcion: "Custom description." },
    });
    expect(tools.constancia_inscripcion!.description).toBe(
      "Custom description.",
    );
  });

  it("default description mentions the PDF and the identity tradeoff", () => {
    const tools = constanciaTools();
    expect(tools.constancia_inscripcion!.description).toMatch(/PDF/);
    expect(tools.constancia_inscripcion!.description).toMatch(
      /@ar-agents\/identity/,
    );
  });
});
