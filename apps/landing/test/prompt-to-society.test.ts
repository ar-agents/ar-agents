import { describe, expect, it, vi } from "vitest";
import {
  draftToInput,
  extractSocietyDraft,
  SocietyDraftSchema,
} from "../src/lib/prompt-to-society";

// ExtractionSchema shape: every field present, optionals nullable.
const validDraft = {
  denominacion: "Pyme Digital",
  tipo: "SAS",
  capitalSocial: 100_000,
  objeto: "Desarrollo de software y servicios digitales para comercios argentinos.",
  piezas: ["identity", "gde-tad", "mercadopago", "banking", "facturacion", "whatsapp"],
  representante: null,
  emailContacto: null,
};

describe("extractSocietyDraft", () => {
  it("rejects an empty / too-short prompt without calling the model", async () => {
    const generate = vi.fn();
    const r = await extractSocietyDraft("  ", { generate });
    expect(r).toEqual({ ok: false, error: "empty_prompt" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("returns a schema-validated draft from a natural-language prompt", async () => {
    const generate = vi.fn(async () => validDraft);
    const r = await extractSocietyDraft(
      "quiero una pyme que venda software y cobre por whatsapp",
      { generate },
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.denominacion).toBe("Pyme Digital");
      expect(r.draft.tipo).toBe("SAS");
      expect(r.draft.piezas).toContain("whatsapp");
    }
  });

  it("passes the trimmed prompt + a non-empty system instruction to the model", async () => {
    const generate = vi.fn(async () => validDraft);
    await extractSocietyDraft("   hola mundo SA   ", { generate });
    expect(generate).toHaveBeenCalledTimes(1);
    const arg = (generate.mock.calls[0] as unknown as [{ system: string; prompt: string }])[0];
    expect(arg.prompt).toBe("hola mundo SA");
    expect(arg.system.length).toBeGreaterThan(50);
  });

  it("re-validates the model output: an off-schema tipo is rejected (never trusted)", async () => {
    const generate = vi.fn(async () => ({ ...validDraft, tipo: "LLC" }));
    const r = await extractSocietyDraft("una LLC delaware", { generate });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_draft");
  });

  it("rejects a sub-minimum-length objeto from the model", async () => {
    const generate = vi.fn(async () => ({ ...validDraft, objeto: "corto" }));
    const r = await extractSocietyDraft("algo", { generate });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid_draft");
  });

  it("DATA only: unknown / injected fields are stripped by the schema boundary", async () => {
    const generate = vi.fn(async () => ({
      ...validDraft,
      __code: "rm -rf /",
      evilEval: "process.exit()",
    }));
    const r = await extractSocietyDraft("x con payload malicioso", { generate });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.draft)).not.toContain("__code");
      expect(Object.keys(r.draft)).not.toContain("evilEval");
    }
  });

  it("maps a generation failure (e.g. gateway 402) to a typed error", async () => {
    const generate = vi.fn(async () => {
      throw new Error("gateway 402");
    });
    const r = await extractSocietyDraft("una pyme", { generate });
    expect(r).toEqual({ ok: false, error: "generation_failed", detail: "gateway 402" });
  });

  it("applies the default REQUIRED piezas when the model returns null piezas", async () => {
    const generate = vi.fn(async () => ({ ...validDraft, piezas: null }));
    const r = await extractSocietyDraft("una pyme sin capacidades explicitas", { generate });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.draft.piezas).toEqual([
        "identity",
        "gde-tad",
        "mercadopago",
        "banking",
        "facturacion",
      ]);
    }
  });
});

describe("draftToInput", () => {
  // a clean Body-valid draft (Body optionals are omittable, not nullable)
  const draft = SocietyDraftSchema.parse({
    denominacion: "Pyme Digital",
    tipo: "SAS",
    capitalSocial: 100_000,
    objeto: "Desarrollo de software y servicios digitales para comercios argentinos.",
    piezas: ["identity", "gde-tad", "mercadopago", "banking", "facturacion"],
  });

  it("assigns the sessionId when provided", () => {
    expect(draftToInput(draft, "sess-12345678").sessionId).toBe("sess-12345678");
  });

  it("omits sessionId when not provided (server assigns it)", () => {
    expect("sessionId" in draftToInput(draft)).toBe(false);
  });
});
