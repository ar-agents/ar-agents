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
  it("fiscal ACTS -> fiscal", () => {
    expect(classifyTool({ name: "emitir_factura" })).toBe("fiscal");
    expect(classifyTool({ name: "nota_credito_emitir" })).toBe("fiscal");
    expect(classifyTool({ name: "presentar_ddjj_iva" })).toBe("fiscal");
    // DDJJ submissions under any filing verb (real tools: sicore/suss/iva_*).
    expect(classifyTool({ name: "sicore_submit_ddjj" })).toBe("fiscal");
    expect(classifyTool({ name: "iva_retention_submit_ddjj" })).toBe("fiscal");
  });
  it("tax CALCULATORS read, they do not file (no side effect)", () => {
    expect(classifyTool({ name: "calcular_retencion_iva" })).toBe("read");
    expect(classifyTool({ name: "iva_percepcion_calculate" })).toBe("read");
    expect(classifyTool({ name: "sicore_retencion_calculate" })).toBe("read");
    expect(classifyTool({ name: "suss_contribuciones_calculate" })).toBe("read");
  });
  it("money movement -> money", () => {
    expect(classifyTool({ name: "transfer_funds" })).toBe("money");
    expect(classifyTool({ name: "create_payment" })).toBe("money");
    expect(classifyTool({ name: "cobrar_suscripcion" })).toBe("money");
    expect(classifyTool({ name: "uala_create_payout" })).toBe("money");
    expect(classifyTool({ name: "bind_create_transfer" })).toBe("money");
    // x402 pay-per-call settles a micropayment; FCE accept/reject creates or
    // declines an enforceable payment obligation (real tools: x402/fecred).
    expect(classifyTool({ name: "x402_paid_fetch" })).toBe("money");
    expect(classifyTool({ name: "fecred_accept_invoice" })).toBe("money");
    expect(classifyTool({ name: "fecred_reject_invoice" })).toBe("money");
  });
  it("destructive -> irreversible", () => {
    expect(classifyTool({ name: "delete_webhook" })).toBe("irreversible");
    expect(classifyTool({ name: "revoke_token" })).toBe("irreversible");
  });
  it("reads -> read (incl. lookups, variables, info anywhere in the name)", () => {
    expect(classifyTool({ name: "get_payment" })).toBe("read");
    expect(classifyTool({ name: "validate_cuit" })).toBe("read");
    expect(classifyTool({ name: "validate_cbu" })).toBe("read");
    expect(classifyTool({ name: "list_invoices" })).toBe("read");
    expect(classifyTool({ name: "health_check_afip" })).toBe("read");
    expect(classifyTool({ name: "consultar_padron" })).toBe("read");
    expect(classifyTool({ name: "bcra_deudas_lookup" })).toBe("read");
    expect(classifyTool({ name: "bcra_monetary_variable" })).toBe("read");
    expect(classifyTool({ name: "get_toolkit_info" })).toBe("read");
  });
  it("a mutating verb is NOT downgraded to read by a read-ish noun (#8 hardening)", () => {
    // carry a read-ish noun (balance/saldo/padron) but MUTATE it -> must gate
    expect(classifyTool({ name: "credit_balance" })).toBe("unknown");
    expect(classifyTool({ name: "set_saldo" })).toBe("unknown");
    expect(classifyTool({ name: "debit_balance" })).toBe("unknown");
    expect(classifyTool({ name: "modificar_padron" })).toBe("unknown");
    expect(requiresApproval({ name: "credit_balance" })).toBe(true); // gated, fail closed
    // genuine reads still classify read
    expect(classifyTool({ name: "get_balance" })).toBe("read");
    expect(classifyTool({ name: "bcra_monetary_variable" })).toBe("read");
    expect(classifyTool({ name: "consultar_padron" })).toBe("read");
  });
  it("Spanish money/mutating verbs + a read-ish noun are NOT downgraded to read (audit P0)", () => {
    // Spanish money verbs the English money override missed: pay a balance MUST gate.
    expect(classifyTool({ name: "pagar_saldo" })).toBe("money");
    expect(classifyTool({ name: "abonar_deuda" })).toBe("money");
    expect(classifyTool({ name: "girar_transferencia" })).toBe("money");
    expect(classifyTool({ name: "retirar_fondos" })).toBe("money");
    // Non-factura mutating verbs carrying a read noun fail closed, not "read".
    expect(classifyTool({ name: "emitir_padron" })).toBe("unknown");
    expect(classifyTool({ name: "anular_deudas" })).toBe("unknown");
    expect(classifyTool({ name: "presentar_saldo" })).toBe("unknown");
    expect(requiresApproval({ name: "pagar_saldo" })).toBe(true);
    // FALSE-POSITIVE GUARD: the NOUN "pagarés" (promissory notes) is a read, not
    // the verb "pagar" — a listing must stay read, not be gated as money.
    expect(classifyTool({ name: "list_pagares" })).toBe("read");
    expect(classifyTool({ name: "consultar_pagares" })).toBe("read");
    // And genuine reads with those nouns stay read.
    expect(classifyTool({ name: "consultar_saldo" })).toBe("read");
    expect(classifyTool({ name: "cedular_calculate" })).toBe("read");
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

describe("enforceRiskPolicy kill-switch (isHalted)", () => {
  const makeTool = () => ({ execute: vi.fn(async () => "ran") }) as never;
  const exec = (gated: unknown, name: string) =>
    (gated as Record<string, { execute: (a: unknown, c: unknown) => Promise<unknown> }>)[name]!.execute(
      {},
      {},
    );

  it("halts EVERY tool when the society is suspended, even reads", async () => {
    const tools = { get_balance: makeTool() } as Record<string, { execute: ReturnType<typeof vi.fn> }>;
    const original = tools.get_balance.execute;
    const approve = vi.fn(async () => true);
    const gated = enforceRiskPolicy(tools as never, { approve, isHalted: () => true });
    await expect(exec(gated, "get_balance")).rejects.toThrow(/suspended/i);
    expect(original).not.toHaveBeenCalled();
  });

  it("checks the kill-switch BEFORE approval on an approval-level tool", async () => {
    const tools = { transfer_funds: makeTool() } as Record<string, { execute: ReturnType<typeof vi.fn> }>;
    const original = tools.transfer_funds.execute;
    const approve = vi.fn(async () => true);
    const gated = enforceRiskPolicy(tools as never, { approve, isHalted: () => true });
    await expect(exec(gated, "transfer_funds")).rejects.toThrow(/suspended/i);
    expect(approve).not.toHaveBeenCalled(); // halt is outermost
    expect(original).not.toHaveBeenCalled();
  });

  it("runs normally when NOT suspended (read passes, approval still gated)", async () => {
    const tools = { get_balance: makeTool(), transfer_funds: makeTool() } as Record<
      string,
      { execute: ReturnType<typeof vi.fn> }
    >;
    const approve = vi.fn(async () => true);
    const gated = enforceRiskPolicy(tools as never, { approve, isHalted: () => false });
    await expect(exec(gated, "get_balance")).resolves.toBe("ran");
    await expect(exec(gated, "transfer_funds")).resolves.toBe("ran");
    expect(approve).toHaveBeenCalledTimes(1); // only the approval-level tool
  });

  it("fails CLOSED when the halt check throws", async () => {
    const tools = { get_balance: makeTool() } as Record<string, { execute: ReturnType<typeof vi.fn> }>;
    const original = tools.get_balance.execute;
    const approve = vi.fn(async () => true);
    const gated = enforceRiskPolicy(tools as never, {
      approve,
      isHalted: () => {
        throw new Error("kv down");
      },
    });
    await expect(exec(gated, "get_balance")).rejects.toThrow(/fail closed/i);
    expect(original).not.toHaveBeenCalled();
  });
});
