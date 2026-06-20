import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { type ApproverAttestation, appendAudit, readAudit } from "../src/lib/audit";
import {
  changeSuspension,
  isSuspended,
  setSuspended,
  societyAdminPrincipal,
} from "../src/lib/suspension";

const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
const ADMIN: ApproverAttestation = {
  method: "self-attested",
  principal: "cuit:20123456786", // 20-12345678-6 (fictional, valid)
  principalKind: "declared-cuit",
  declaredBy: "Juan Pérez",
};

function setup(): void {
  process.env.AUDIT_HMAC_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

async function seedSociety(sid: string, approver: ApproverAttestation = ADMIN): Promise<void> {
  await appendAudit(
    sid,
    { tool: "incorporate_attested", governance: "audit-logged", approver, input: {}, output: {} },
    { durable: true },
  );
}

describe("suspension store", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("set / is round-trips (in-memory)", async () => {
    await setSuspended("store-1", true);
    expect(await isSuspended("store-1")).toBe(true);
    await setSuspended("store-1", false);
    expect(await isSuspended("store-1")).toBe(false);
  });

  it("societyAdminPrincipal reads the administrator CUIT from the signed constitution", async () => {
    await seedSociety("soc-admin");
    expect(await societyAdminPrincipal("soc-admin")).toBe("cuit:20123456786");
    expect(await societyAdminPrincipal("nonexistent")).toBeNull();
  });

  it("anchors to the EARLIEST incorporation: re-incorporation cannot hijack admin (#2c)", async () => {
    await seedSociety("soc-hijack"); // original admin (cuit:20123456786)
    // attacker appends a LATER incorporation with their own principal
    await appendAudit(
      "soc-hijack",
      {
        tool: "incorporate_attested",
        governance: "audit-logged",
        approver: { ...ADMIN, principal: "cuit:27111111110", declaredBy: "Mallory" },
        input: {},
        output: {},
      },
      { durable: true },
    );
    // the ORIGINAL administrator remains authoritative
    expect(await societyAdminPrincipal("soc-hijack")).toBe("cuit:20123456786");
  });
});

describe("changeSuspension (authorized by CUIT match against the signed record)", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("the administrator suspends: records a signed act + flips the flag", async () => {
    await seedSociety("soc-1");
    const r = await changeSuspension({
      society: "soc-1",
      nombre: "Juan Pérez",
      cuit: "20-12345678-6",
      motivo: "prueba",
      suspend: true,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suspended).toBe(true);
    expect(r.entry.tool).toBe("suspender_sociedad");
    expect(await isSuspended("soc-1")).toBe(true);
    expect((await readAudit("soc-1")).at(-1)!.approver?.declaredBy).toBe("Juan Pérez");
  });

  it("resume lifts the suspension", async () => {
    await seedSociety("soc-2");
    await changeSuspension({ society: "soc-2", nombre: "Juan Pérez", cuit: "20-12345678-6", suspend: true });
    const r = await changeSuspension({
      society: "soc-2",
      nombre: "Juan Pérez",
      cuit: "20-12345678-6",
      suspend: false,
    });
    expect(r.ok && r.suspended === false).toBe(true);
    expect(await isSuspended("soc-2")).toBe(false);
  });

  it("a different administrator cannot suspend (403), even with a valid CUIT", async () => {
    // society's recorded administrator is a different principal
    await seedSociety("soc-3", { ...ADMIN, principal: "cuit:27111111110", declaredBy: "Otro" });
    const r = await changeSuspension({
      society: "soc-3",
      nombre: "Mallory",
      cuit: "20-12345678-6", // valid CUIT, but not the administrator
      suspend: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(await isSuspended("soc-3")).toBe(false);
  });

  it("a society with no constitution record -> 404", async () => {
    const r = await changeSuspension({
      society: "ghost",
      nombre: "Juan Pérez",
      cuit: "20-12345678-6",
      suspend: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });

  it("an invalid CUIT -> 422", async () => {
    await seedSociety("soc-4");
    const r = await changeSuspension({
      society: "soc-4",
      nombre: "Juan Pérez",
      cuit: "20-12345678-9", // invalid checksum
      suspend: true,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });
});
