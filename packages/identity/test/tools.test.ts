import { describe, expect, it } from "vitest";
import {
  type AfipPadronAdapter,
  type AfipPadronResult,
  identityTools,
  validateCuitTool,
} from "../src";

describe("identityTools", () => {
  it("exposes both expected tools", () => {
    const tools = identityTools();
    expect(Object.keys(tools).sort()).toEqual([
      "lookup_cuit_afip",
      "validate_cuit",
    ]);
  });

  describe("validate_cuit (algorithm tool)", () => {
    it("returns a valid CUIT result", async () => {
      const tools = identityTools();
      const result = (await tools.validate_cuit!.execute!(
        { cuit: "20-12345678-6" },
        { toolCallId: "t1", messages: [] } as never,
      )) as { valid: boolean; personType: string; personTypeDescription: string };
      expect(result.valid).toBe(true);
      expect(result.personType).toBe("fisica_masculina");
      expect(result.personTypeDescription).toMatch(/masculino/i);
    });

    it("returns an invalid result with actionable Spanish error message", async () => {
      const tools = identityTools();
      const result = (await tools.validate_cuit!.execute!(
        { cuit: "20-12345678-9" },
        { toolCallId: "t2", messages: [] } as never,
      )) as { valid: boolean; error: string };
      expect(result.valid).toBe(false);
      expect(result.error).toMatch(/Esperado: 6/);
    });
  });

  describe("lookup_cuit_afip (default = unconfigured)", () => {
    it("returns available: false with setup instructions when no afip option given", async () => {
      const tools = identityTools();
      const result = (await tools.lookup_cuit_afip!.execute!(
        { cuit: "20-12345678-6" },
        { toolCallId: "t3", messages: [] } as never,
      )) as AfipPadronResult;
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/not configured/i);
      expect(result.data).toBeNull();
    });
  });

  describe("lookup_cuit_afip with custom adapter", () => {
    class FakeAdapter implements AfipPadronAdapter {
      async lookup(cuit: string): Promise<AfipPadronResult> {
        return {
          cuit,
          available: true,
          error: null,
          data: {
            nombre: "Test Persona",
            condicion: "RESPONSABLE INSCRIPTO",
            monotributoCategoria: null,
            fechaInscripcion: null,
            domicilioFiscal: null,
            actividades: [],
          },
        };
      }
    }

    it("uses the provided adapter and returns its result", async () => {
      const tools = identityTools({ afip: new FakeAdapter() });
      const result = (await tools.lookup_cuit_afip!.execute!(
        { cuit: "20-12345678-6" },
        { toolCallId: "t4", messages: [] } as never,
      )) as AfipPadronResult;
      expect(result.available).toBe(true);
      expect(result.data?.nombre).toBe("Test Persona");
    });
  });

  describe("lookup_cuit_afip — hardening (DeepSec MEDIUM)", () => {
    const ZWSP = "\u200B";
    const ZWJ = "\u200D";
    const RLO = "\u202E";

    class SpyAdapter implements AfipPadronAdapter {
      calls: string[] = [];
      async lookup(cuit: string): Promise<AfipPadronResult> {
        this.calls.push(cuit);
        return {
          cuit,
          available: true,
          error: null,
          data: {
            // Hostile registry record: zero-width + bidi smuggling in name.
            nombre: `ACME${ZWSP} SA${RLO}`,
            condicion: "RESPONSABLE INSCRIPTO",
            monotributoCategoria: null,
            fechaInscripcion: null,
            domicilioFiscal: "CALLE FALSA 123",
            actividades: [`SOFTWARE${ZWJ}`],
          },
        };
      }
    }

    async function run(
      opts: Parameters<typeof identityTools>[0],
      cuit: string,
    ): Promise<AfipPadronResult & { _provenance?: { trust: string } }> {
      const tools = identityTools(opts);
      return (await tools.lookup_cuit_afip!.execute!(
        { cuit },
        { toolCallId: "x", messages: [] } as never,
      )) as AfipPadronResult & { _provenance?: { trust: string } };
    }

    it("rejects a CUIT that fails the checksum WITHOUT querying AFIP", async () => {
      const afip = new SpyAdapter();
      const result = await run({ afip }, "20-12345678-9"); // bad check digit
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/inválido/i);
      expect(afip.calls).toEqual([]); // adapter never called
    });

    it("denies the lookup when authorizeLookup returns false (fail closed)", async () => {
      const afip = new SpyAdapter();
      const result = await run(
        { afip, authorizeLookup: () => false },
        "20-12345678-6",
      );
      expect(result.available).toBe(false);
      expect(result.error).toMatch(/authorizeLookup|denied/i);
      expect(afip.calls).toEqual([]);
    });

    it("surfaces a custom reason from { allowed: false, reason }", async () => {
      const afip = new SpyAdapter();
      const result = await run(
        {
          afip,
          authorizeLookup: () => ({
            allowed: false,
            reason: "Rate limit exceeded.",
          }),
        },
        "20-12345678-6",
      );
      expect(result.available).toBe(false);
      expect(result.error).toBe("Rate limit exceeded.");
      expect(afip.calls).toEqual([]);
    });

    it("passes the validated, normalized CUIT to authorizeLookup and the adapter", async () => {
      const afip = new SpyAdapter();
      const seen: string[] = [];
      await run(
        {
          afip,
          authorizeLookup: ({ cuit, normalizedCuit }) => {
            seen.push(cuit, normalizedCuit);
            return true;
          },
        },
        "20-12345678-6",
      );
      expect(seen).toEqual(["20-12345678-6", "20123456786"]);
      expect(afip.calls).toEqual(["20123456786"]);
    });

    it("sanitizes taxpayer-controlled free-text in the result", async () => {
      const result = await run({ afip: new SpyAdapter() }, "20-12345678-6");
      expect(result.available).toBe(true);
      expect(result.data?.nombre).toBe("ACME SA");
      expect(result.data?.actividades).toEqual(["SOFTWARE"]);
    });

    it("tags the result with untrusted-data provenance", async () => {
      const result = await run({ afip: new SpyAdapter() }, "20-12345678-6");
      expect(result._provenance?.trust).toBe("untrusted-external-data");
    });
  });

  describe("custom descriptions", () => {
    it("overrides only the provided tool descriptions", () => {
      const tools = identityTools({
        descriptions: { validate_cuit: "Custom validate description." },
      });
      expect(tools.validate_cuit!.description).toBe(
        "Custom validate description.",
      );
      // The other tool keeps its default
      expect(tools.lookup_cuit_afip!.description).toMatch(/AFIP/);
    });
  });
});

describe("validateCuitTool standalone export", () => {
  it("works without going through identityTools()", async () => {
    const result = (await validateCuitTool.execute!(
      { cuit: "20-12345678-6" },
      { toolCallId: "t1", messages: [] } as never,
    )) as { valid: boolean };
    expect(result.valid).toBe(true);
  });
});
