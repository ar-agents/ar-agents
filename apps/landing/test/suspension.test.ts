import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintAdminToken } from "../src/lib/admin-token";
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

async function seedSociety(sid: string, approver: ApproverAttestation = ADMIN): Promise<string> {
  await appendAudit(
    sid,
    { tool: "incorporate_attested", governance: "audit-logged", approver, input: {}, output: {} },
    { durable: true },
  );
  const token = await mintAdminToken(sid);
  return token!; // a fresh session always mints
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

describe("changeSuspension (authorized by the admin capability TOKEN)", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("the administrator suspends with the token: records a signed act + flips the flag", async () => {
    const token = await seedSociety("soc-1");
    const r = await changeSuspension({
      society: "soc-1",
      adminToken: token,
      motivo: "prueba",
      suspend: true,
      nombre: "Juan Pérez",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.suspended).toBe(true);
    expect(r.entry.tool).toBe("suspender_sociedad");
    expect(await isSuspended("soc-1")).toBe(true);
    expect((await readAudit("soc-1")).at(-1)!.approver?.declaredBy).toBe("Juan Pérez");
  });

  it("resume lifts the suspension", async () => {
    const token = await seedSociety("soc-2");
    await changeSuspension({ society: "soc-2", adminToken: token, suspend: true });
    const r = await changeSuspension({ society: "soc-2", adminToken: token, suspend: false });
    expect(r.ok && r.suspended === false).toBe(true);
    expect(await isSuspended("soc-2")).toBe(false);
  });

  it("a WRONG token cannot suspend (403) — knowing the CUIT is no longer enough", async () => {
    await seedSociety("soc-3"); // a real token exists, but the attacker does not have it
    const r = await changeSuspension({ society: "soc-3", adminToken: "sat_attacker_guess", suspend: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
    expect(await isSuspended("soc-3")).toBe(false);
  });

  it("a society with no constitution record -> 404", async () => {
    const r = await changeSuspension({ society: "ghost", adminToken: "sat_whatever", suspend: true });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });
});
