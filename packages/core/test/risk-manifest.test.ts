import { describe, expect, it, vi } from "vitest";
import {
  classifyTool,
  enforceRiskPolicy,
  levelRequiresApproval,
  requiresApproval,
  type RiskLevel,
} from "../src/risk-manifest";

describe("classifyTool", () => {
  it("incorporation -> legal", () => {
    expect(classifyTool({ name: "incorporar_sociedad" })).toBe("legal");
    expect(classifyTool({ name: "constituir_empresa" })).toBe("legal");
  });
  it("tax acts -> fiscal", () => {
    expect(classifyTool({ name: "emitir_factura" })).toBe("fiscal");
    expect(classifyTool({ name: "calcular_retencion_iva" })).toBe("fiscal");
    expect(classifyTool({ name: "sicore_export" })).toBe("fiscal");
  });
  it("money movement -> money", () => {
    expect(classifyTool({ name: "transfer_funds" })).toBe("money");
    expect(classifyTool({ name: "create_payment" })).toBe("money");
    expect(classifyTool({ name: "cobrar_suscripcion" })).toBe("money");
    expect(classifyTool({ name: "uala_create_payout" })).toBe("money");
  });
  it("destructive -> irreversible", () => {
    expect(classifyTool({ name: "delete_webhook" })).toBe("irreversible");
    expect(classifyTool({ name: "revoke_token" })).toBe("irreversible");
  });
  it("reads -> read", () => {
    expect(classifyTool({ name: "get_payment" })).toBe("read");
    expect(classifyTool({ name: "validate_cuit" })).toBe("read");
    expect(classifyTool({ name: "list_invoices" })).toBe("read");
    expect(classifyTool({ name: "health_check_afip" })).toBe("read");
    expect(classifyTool({ name: "consultar_padron" })).toBe("read");
  });
  it("registrar_decision -> create (auto, low-stakes append to audit log)", () => {
    expect(classifyTool({ name: "registrar_decision" })).toBe("create");
  });
  it("unknown -> unknown (fails closed)", () => {
    expect(classifyTool({ name: "frobnicate_widget" })).toBe("unknown");
  });

  // precedence: positive signals win over the benign read-name heuristic
  it("description **IRREVERSIBLE** flag beats a neutral name", () => {
    expect(
      classifyTool({ name: "do_thing", description: "Does a thing. **IRREVERSIBLE**, confirm first." }),
    ).toBe("irreversible");
  });
  it("manifest sideEffects beats the read-name heuristic", () => {
    expect(classifyTool({ name: "fetch_thing", sideEffects: "moves money" })).toBe("money");
  });
  it("an explicit money override beats a read-looking name", () => {
    // "get_"-prefixed but it processes a refund: gated, not auto.
    expect(classifyTool({ name: "get_refund_after_dispute" })).toBe("money");
  });
  it("sideEffects 'none' -> read", () => {
    expect(classifyTool({ name: "weird_unmatched_name", sideEffects: "none" })).toBe("read");
  });
});

describe("levelRequiresApproval / requiresApproval", () => {
  it("approval tiers (incl. unknown, fail closed)", () => {
    for (const l of ["money", "fiscal", "legal", "irreversible", "unknown"] as RiskLevel[]) {
      expect(levelRequiresApproval(l)).toBe(true);
    }
    for (const l of ["read", "create"] as RiskLevel[]) {
      expect(levelRequiresApproval(l)).toBe(false);
    }
  });
  it("irreversible/money tools require approval", () => {
    expect(requiresApproval({ name: "delete_account" })).toBe(true);
    expect(requiresApproval({ name: "transfer_funds" })).toBe(true);
  });
  it("read/create tools do not", () => {
    expect(requiresApproval({ name: "get_balance" })).toBe(false);
    expect(requiresApproval({ name: "registrar_decision" })).toBe(false);
  });
  it("unclassified tool fails closed (requires approval)", () => {
    expect(requiresApproval({ name: "frobnicate" })).toBe(true);
  });
});

describe("enforceRiskPolicy", () => {
  const makeTool = (description?: string) =>
    ({ description, execute: vi.fn(async () => "ran") }) as never;

  it("gates an irreversible tool: original execute blocked unless approved", async () => {
    const tools = { delete_thing: makeTool() } as Record<string, { execute: ReturnType<typeof vi.fn> }>;
    const original = tools.delete_thing.execute;
    const approve = vi.fn(async () => false);
    const gated = enforceRiskPolicy(tools as never, { approve });
    await expect(
      (gated as never as Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>)
        .delete_thing.execute({}, {}),
    ).rejects.toThrow();
    expect(approve).toHaveBeenCalledWith("delete_thing", {});
    expect(original).not.toHaveBeenCalled();
  });

  it("runs an approval-level tool once approved", async () => {
    const tools = { transfer_funds: makeTool() } as Record<string, { execute: ReturnType<typeof vi.fn> }>;
    const original = tools.transfer_funds.execute;
    const approve = vi.fn(async () => true);
    const gated = enforceRiskPolicy(tools as never, { approve });
    await expect(
      (gated as never as Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>)
        .transfer_funds.execute({ amount: 1 }, {}),
    ).resolves.toBe("ran");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("does NOT gate a read tool (no approval call)", async () => {
    const tools = { get_balance: makeTool() } as Record<string, { execute: ReturnType<typeof vi.fn> }>;
    const original = tools.get_balance.execute;
    const approve = vi.fn(async () => true);
    const gated = enforceRiskPolicy(tools as never, { approve });
    await (gated as never as Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>)
      .get_balance.execute({}, {});
    expect(approve).not.toHaveBeenCalled();
    expect(original).toHaveBeenCalledTimes(1);
  });

  it("gates an unclassified tool (fail closed)", async () => {
    const tools = { frobnicate: makeTool() };
    const approve = vi.fn(async () => false);
    const gated = enforceRiskPolicy(tools as never, { approve });
    await expect(
      (gated as never as Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>)
        .frobnicate.execute({}, {}),
    ).rejects.toThrow();
    expect(approve).toHaveBeenCalled();
  });

  it("sideEffectsFor sharpens classification (gates a read-named money tool)", async () => {
    const tools = { fetch_x: makeTool() };
    const approve = vi.fn(async () => false);
    const gated = enforceRiskPolicy(tools as never, {
      approve,
      sideEffectsFor: () => "moves money",
    });
    await expect(
      (gated as never as Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>)
        .fetch_x.execute({}, {}),
    ).rejects.toThrow();
    expect(approve).toHaveBeenCalledWith("fetch_x", {});
  });
});
