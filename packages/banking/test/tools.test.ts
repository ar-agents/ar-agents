import { describe, expect, it } from "vitest";
import { bankingTools } from "../src/tools";
import { VALID_GALICIA_CBU } from "./fixtures/cbus";

describe("bankingTools", () => {
  it("exposes 11 tools by default (5 banking + 6 bcra-vars)", () => {
    const tools = bankingTools();
    expect(Object.keys(tools).sort()).toEqual([
      "get_bcra_variable",
      "get_cer",
      "get_reservas_bcra",
      "get_usd_oficial",
      "get_uva",
      "list_banks",
      "list_bcra_variables",
      "list_psps",
      "lookup_bank_by_code",
      "lookup_credit_situation",
      "validate_cbu",
    ]);
  });

  it("validate_cbu executes against a valid CBU", async () => {
    const tools = bankingTools();
    const result = await (tools.validate_cbu as any).execute({
      cbu: VALID_GALICIA_CBU,
    });
    expect(result.valid).toBe(true);
    expect(result.bank?.shortName).toBe("Banco Galicia");
  });

  it("lookup_bank_by_code executes against a 3-digit code", async () => {
    const tools = bankingTools();
    const result = await (tools.lookup_bank_by_code as any).execute({
      code: "011",
    });
    expect(result.found).toBe(true);
    expect(result.entity?.shortName).toBe("Banco Nación");
  });

  it("lookup_bank_by_code executes against a 7-digit CVU prefix", async () => {
    const tools = bankingTools();
    const result = await (tools.lookup_bank_by_code as any).execute({
      code: "0000031",
    });
    expect(result.found).toBe(true);
    expect(result.entity?.shortName).toBe("Mercado Pago");
  });

  it("list_banks returns an array", async () => {
    const tools = bankingTools();
    const result = await (tools.list_banks as any).execute({});
    expect(Array.isArray(result.banks)).toBe(true);
    expect(result.banks.length).toBeGreaterThan(20);
  });

  it("list_psps returns an array", async () => {
    const tools = bankingTools();
    const result = await (tools.list_psps as any).execute({});
    expect(Array.isArray(result.psps)).toBe(true);
    expect(result.psps.length).toBeGreaterThan(2);
  });

  it("lookup_credit_situation returns 'not configured' by default", async () => {
    const tools = bankingTools();
    const result = await (tools.lookup_credit_situation as any).execute({
      cuit: "20123456786",
    });
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/not configured/i);
    expect(result.worstSituationDescription).toBeNull();
  });

  it("descriptions can be overridden", () => {
    const tools = bankingTools({
      descriptions: { validate_cbu: "Custom desc" },
    });
    expect((tools.validate_cbu as any).description).toBe("Custom desc");
  });
});
