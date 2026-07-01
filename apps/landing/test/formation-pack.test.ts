import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * V2-5 Formation Pack: the machine sidecar (single source of truth), the
 * deterministically-rendered BORRADOR drafts, the content hash bound into the
 * signed audit, and the admin-gated re-fetch route. Runs on the in-memory path.
 */

import {
  buildSidecar,
  buildFormationPack,
  packHash,
  renderDocumentsFromSidecar,
  renderEstatutoDraft,
  type FormationSidecar,
} from "../src/lib/formation-pack";
import { runIncorporation } from "../src/lib/incorporate-run";
import {
  createFormingStub,
  getRecord,
  formingStubIdForSession,
  __resetMemoryForTests,
} from "../src/lib/registry-store";
import { GET as packGet } from "../src/app/api/formation/pack/route";
import type { IncorporateInput } from "../src/lib/incorporate";

const input: IncorporateInput = {
  denominacion: "Demo AI SAS",
  tipo: "SAS",
  capitalSocial: 200_000,
  objeto: "Desarrollo y comercializacion de software propio para empresas argentinas.",
  representante: { nombre: "Juan Perez", cuit: "20-12345678-6" },
  piezas: ["identity", "gde-tad", "mercadopago", "banking", "facturacion"],
};

function resetAll(): void {
  __resetMemoryForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

// ── sidecar + hash (pure) ───────────────────────────────────────────────────────

describe("formation-pack · sidecar + hash", () => {
  it("buildSidecar mirrors the legal params and is unvalidated by default", () => {
    const s = buildSidecar(input);
    expect(s.denominacion).toBe("Demo AI SAS");
    expect(s.tipo).toBe("SAS");
    expect(s.capital).toEqual({ monto: 200_000, moneda: "ARS" });
    expect(s.objeto).toContain("software");
    expect(s.administracion.representanteLegal).toEqual({ nombre: "Juan Perez", cuit: "20-12345678-6" });
    expect(s.governance.killSwitch).toBe(true);
    expect(s.validated).toBe(false);
    expect(s.disclaimer).toMatch(/BORRADOR NO VALIDADO/);
  });

  it("packHash is deterministic, 64-hex, and changes when a legal param changes", async () => {
    const h1 = await packHash(buildSidecar(input));
    const h2 = await packHash(buildSidecar(input));
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(h1).toBe(h2); // deterministic
    const h3 = await packHash(buildSidecar({ ...input, capitalSocial: 999_999 }));
    expect(h3).not.toBe(h1); // capital change -> different hash
  });

  it("a missing representante yields a null sidecar rep (not fabricated)", () => {
    const s = buildSidecar({ ...input, representante: undefined });
    expect(s.administracion.representanteLegal).toBeNull();
  });
});

// ── rendered drafts (deterministic, BORRADOR, no em dashes) ──────────────────────

describe("formation-pack · rendered drafts", () => {
  it("every draft leads with the BORRADOR guardrail and carries the key fields", async () => {
    const pack = await buildFormationPack(input, { piezas: input.piezas });
    for (const doc of [pack.documents.estatuto, pack.documents.igj, pack.documents.afip]) {
      expect(doc).toMatch(/BORRADOR/);
      expect(doc).toMatch(/no constituye asesoramiento legal/i);
      expect(doc).toContain("Demo AI SAS");
    }
    expect(pack.documents.estatuto).toContain("ARTICULO 2 (Objeto)");
    expect(pack.documents.afip).toContain("20-12345678-6");
  });

  it("NO em dashes in any rendered draft (hard rule)", async () => {
    const pack = await buildFormationPack(input, { piezas: input.piezas });
    for (const doc of Object.values(pack.documents)) {
      expect(doc.includes("—"), "draft must not contain an em dash").toBe(false);
    }
  });

  it("de-dashes USER free-text in the rendered drafts, but the sidecar keeps raw input", async () => {
    const dashy: IncorporateInput = {
      ...input,
      objeto: "Servicios de software — desarrollo y venta — para PyMEs argentinas.",
      representante: { nombre: "Juan — Perez", cuit: "20-12345678-6" },
    };
    const pack = await buildFormationPack(dashy, { piezas: dashy.piezas });
    // Rendered human docs: NO em dash even though the input had them.
    for (const doc of Object.values(pack.documents)) {
      expect(doc.includes("—")).toBe(false);
    }
    // Sidecar (machine data) keeps the raw input verbatim, so the packHash is honest.
    expect(pack.sidecar.objeto).toContain("—");
  });

  it("renderDocumentsFromSidecar re-renders identically (single source, no drift)", async () => {
    const pack = await buildFormationPack(input, { piezas: input.piezas });
    const reRendered = renderDocumentsFromSidecar(pack.sidecar);
    expect(reRendered).toEqual(pack.documents);
  });

  it("a missing representante renders a [COMPLETAR] placeholder, not a fake name", () => {
    const s = buildSidecar({ ...input, representante: undefined });
    expect(renderEstatutoDraft(s)).toContain("[COMPLETAR: nombre y CUIT del representante legal]");
  });
});

// ── incorporation integration: pack in response + hash bound + sidecar on stub ──

describe("formation-pack · runIncorporation integration", () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it("delivers the pack, binds the packHash into the audit, and stores the sidecar on the stub", async () => {
    const res = await runIncorporation(input, {
      approver: {
        method: "self-attested",
        principal: "20-12345678-6",
        principalKind: "declared-cuit",
        declaredBy: "Juan Perez",
      },
      tool: "test-formation",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const body = res.body as Record<string, any>;

    // 1. Pack delivered in the response.
    expect(body.formationPack).toBeTruthy();
    expect(body.formationPack.packHash).toMatch(/^[0-9a-f]{64}$/);
    expect(body.formationPack.validated).toBe(false);
    expect(body.formationPack.documents.estatuto).toContain("BORRADOR");

    // 2. packHash bound into the signed audit entry's output (tamper-evident).
    expect(body.audit.entry.output.formationPackHash).toBe(body.formationPack.packHash);

    // 3. The forming stub carries the sidecar + packHash (re-renderable later).
    const stubId = await formingStubIdForSession(res.sessionId);
    expect(stubId).toBeTruthy();
    const stub = await getRecord(stubId!);
    expect(stub?.status).toBe("forming");
    expect(stub?.formation?.packHash).toBe(body.formationPack.packHash);
    expect((stub?.formation?.sidecar as any)?.denominacion).toBe("Demo AI SAS");
  });
});

// ── admin-gated re-fetch route ──────────────────────────────────────────────────

describe("/api/formation/pack (admin-gated re-fetch)", () => {
  const TOKEN = "admin-secret-fp";
  beforeEach(() => {
    resetAll();
    process.env.REGISTRY_ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.REGISTRY_ADMIN_TOKEN;
  });

  function req(qs: string, token = TOKEN): Request {
    return new Request(`https://ar-agents.ar/api/formation/pack${qs}`, {
      headers: token ? { "x-admin-token": token } : {},
    });
  }

  it("fail-closed: no token -> 401", async () => {
    expect((await packGet(req("?id=whatever", ""))).status).toBe(401);
  });

  it("returns the sidecar + re-rendered drafts for a stub that has a Formation Pack", async () => {
    const sidecar = buildSidecar(input) as unknown as Record<string, unknown>;
    const stub = await createFormingStub(
      { denominacion: input.denominacion, tipo: input.tipo, representante: input.representante },
      "sess-fp",
      { sidecar, packHash: await packHash(buildSidecar(input)) },
    );
    expect(stub).not.toBeNull();

    const res = await packGet(req(`?id=${stub!.id}`));
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.formationPack.sidecar.denominacion).toBe("Demo AI SAS");
    expect(json.formationPack.documents.estatuto).toContain("BORRADOR");
    expect(json.formationPack.validated).toBe(false);
  });

  it("404s for an entity with no Formation Pack (e.g. a seed entry)", async () => {
    const res = await packGet(req("?id=ar-agents-reference"));
    expect(res.status).toBe(404);
    const json = (await res.json()) as any;
    expect(json.error).toBe("no_formation_pack");
  });
});
