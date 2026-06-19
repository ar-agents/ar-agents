import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type ApproverAttestation, readAudit, verifyEntry } from "../src/lib/audit";
import type { IncorporateInput } from "../src/lib/incorporate";
import { runIncorporation } from "../src/lib/incorporate-run";
import { draftToInput, extractSocietyDraft } from "../src/lib/prompt-to-society";

const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";

const APPROVER: ApproverAttestation = {
  method: "shared-key",
  principal: "key:0123456789abcdef",
  principalKind: "credential-fingerprint",
  declaredBy: "Juan Pérez",
};

const validInput: IncorporateInput = {
  denominacion: "Pyme Digital",
  tipo: "SAS",
  capitalSocial: 100_000,
  objeto: "Desarrollo de software y servicios digitales para comercios argentinos.",
  piezas: ["identity", "gde-tad", "mercadopago", "banking", "facturacion"],
};

function isolatedKvOff(): void {
  process.env.AUDIT_HMAC_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

describe("runIncorporation", () => {
  beforeEach(isolatedKvOff);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("constitutes a valid input: scaffold + signed audit entry carrying the approver", async () => {
    const r = await runIncorporation(validInput, { approver: APPROVER, tool: "auto_incorporate" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.config as Record<string, string>)).toEqual([
      "package.json",
      "lib/agent.ts",
      ".env.example",
      "README.md",
    ]);
    // the audit entry was written, signed, and carries the attestation
    const entries = await readAudit(r.sessionId);
    expect(entries.length).toBe(1);
    expect(entries[0]!.approver).toEqual(APPROVER);
    expect(entries[0]!.tool).toBe("auto_incorporate");
    expect(await verifyEntry(entries[0]!)).toBe(true);
  });

  it("rejects an invalid input (reserved word) with 422 and no scaffold", async () => {
    const r = await runIncorporation(
      { ...validInput, denominacion: "Banco Nacional Argentino" },
      { approver: APPROVER, tool: "auto_incorporate" },
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect((r.body.validation as { valid: boolean }).valid).toBe(false);
  });

  it("uses the provided tool label and preserves a valid sessionId", async () => {
    const r = await runIncorporation(
      { ...validInput, sessionId: "continuity-123" },
      { approver: APPROVER, tool: "incorporate_from_prompt" },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.sessionId).toBe("continuity-123");
    const entries = await readAudit("continuity-123");
    expect(entries[0]!.tool).toBe("incorporate_from_prompt");
  });
});

describe("prompt -> draft -> input -> runIncorporation (end to end, mocked model)", () => {
  beforeEach(isolatedKvOff);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("a prompt flows to a constituted society with the named administrator bound", async () => {
    const draft = {
      denominacion: "Software Pyme",
      tipo: "SAS",
      capitalSocial: 100_000,
      objeto: "Servicios de software para comercios, con cobros y facturación automatizada.",
      piezas: ["identity", "gde-tad", "mercadopago", "banking", "facturacion", "whatsapp"],
      // fictional identity only (never real PII)
      representante: { nombre: "Juan Pérez", cuit: "20-12345678-6" },
      emailContacto: null,
    };
    const generate = vi.fn(async () => draft);
    const extracted = await extractSocietyDraft(
      "una pyme de software que cobra por whatsapp, representante Juan Pérez",
      { generate },
    );
    expect(extracted.ok).toBe(true);
    if (!extracted.ok) return;

    const input = draftToInput(extracted.draft, "prompt-sess-1");
    const approver: ApproverAttestation = {
      method: "shared-key",
      principal: "key:deadbeefdeadbeef",
      principalKind: "credential-fingerprint",
      declaredBy: extracted.draft.representante?.nombre,
    };
    const r = await runIncorporation(input, { approver, tool: "incorporate_from_prompt" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entries = await readAudit("prompt-sess-1");
    expect(entries[0]!.approver?.declaredBy).toBe("Juan Pérez");
    expect((r.body.sociedad as { denominacion: string }).denominacion).toBe("Software Pyme");
  });
});
