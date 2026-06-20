import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintAdminToken } from "../src/lib/admin-token";
import { type ApproverAttestation, appendAudit, readAudit } from "../src/lib/audit";
import {
  authorizeAndResolve,
  gateAction,
  hashArgs,
  pendingApprovals,
  requestApproval,
} from "../src/lib/approvals";

const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
const ADMIN: ApproverAttestation = {
  method: "self-attested",
  principal: "cuit:20123456786", // 20-12345678-6
  principalKind: "declared-cuit",
  declaredBy: "Juan Pérez",
};

function setup(): void {
  process.env.AUDIT_HMAC_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

/** Seed a constituted society and return its admin capability token. */
async function seedSociety(sid: string, approver: ApproverAttestation = ADMIN): Promise<string> {
  await appendAudit(
    sid,
    { tool: "incorporate_attested", governance: "audit-logged", approver, input: {}, output: {} },
    { durable: true },
  );
  const token = await mintAdminToken(sid);
  return token!; // a fresh session always mints
}

const NOMBRE = "Juan Pérez";

describe("hashArgs", () => {
  it("is stable regardless of key order", async () => {
    expect(await hashArgs({ a: 1, b: 2 })).toBe(await hashArgs({ b: 2, a: 1 }));
  });
  it("differs for different args", async () => {
    expect(await hashArgs({ amount: 100 })).not.toBe(await hashArgs({ amount: 200 }));
  });
});

describe("approval queue: gate -> resolve -> consume", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("first gate defers; approve; next gate proceeds once (single-use)", async () => {
    const token = await seedSociety("soc-a");
    const args = { cbu: "x", amount: 5000 };
    const g1 = await gateAction("soc-a", "transfer_funds", args);
    expect(g1.approved).toBe(false);
    expect(g1.status).toBe("pending");

    const r = await authorizeAndResolve({ id: g1.requestId!, approved: true, adminToken: token, nombre: NOMBRE });
    expect(r.ok).toBe(true);

    const g2 = await gateAction("soc-a", "transfer_funds", args);
    expect(g2.approved).toBe(true); // consumes the approval

    const g3 = await gateAction("soc-a", "transfer_funds", args);
    expect(g3.approved).toBe(false); // single-use: same action must be re-approved
    expect(g3.status).toBe("pending");
  });

  it("dedups pending requests for the same action", async () => {
    await seedSociety("soc-b");
    const h = await hashArgs({ n: 1 });
    const a = await requestApproval("soc-b", "emitir_factura", h, "{}");
    const b = await requestApproval("soc-b", "emitir_factura", h, "{}");
    expect(a.id).toBe(b.id);
  });

  it("records a signed approval act in the society's audit log", async () => {
    const token = await seedSociety("soc-c");
    const g = await gateAction("soc-c", "transfer_funds", { x: 1 });
    await authorizeAndResolve({ id: g.requestId!, approved: true, adminToken: token, nombre: NOMBRE });
    const last = (await readAudit("soc-c")).at(-1)!;
    expect(last.tool).toBe("aprobar_accion");
    expect(last.approver?.declaredBy).toBe("Juan Pérez");
  });

  it("a denial is STICKY: the action does not silently re-queue as approvable (#7)", async () => {
    const token = await seedSociety("soc-d");
    const g = await gateAction("soc-d", "transfer_funds", { x: 1 });
    await authorizeAndResolve({ id: g.requestId!, approved: false, adminToken: token, nombre: NOMBRE });
    const g2 = await gateAction("soc-d", "transfer_funds", { x: 1 });
    expect(g2.approved).toBe(false);
    expect(g2.status).toBe("denied"); // surfaced as denied, not a fresh pending
    expect(g2.requestId).toBe(g.requestId); // same request, not re-queued
  });

  it("single-use is ATOMIC: concurrent gates can't double-consume one approval (#3)", async () => {
    const token = await seedSociety("soc-race");
    const args = { cbu: "x", amount: 9999 };
    const g = await gateAction("soc-race", "transfer_funds", args);
    await authorizeAndResolve({ id: g.requestId!, approved: true, adminToken: token, nombre: NOMBRE });
    const [a, b] = await Promise.all([
      gateAction("soc-race", "transfer_funds", args),
      gateAction("soc-race", "transfer_funds", args),
    ]);
    expect([a.approved, b.approved].filter(Boolean).length).toBe(1); // exactly one proceeds
  });

  it("pendingApprovals lists pending, excludes resolved", async () => {
    const token = await seedSociety("soc-e");
    const g1 = await gateAction("soc-e", "tool_a", { x: 1 });
    await gateAction("soc-e", "tool_b", { y: 2 });
    expect((await pendingApprovals("soc-e")).length).toBe(2);
    await authorizeAndResolve({ id: g1.requestId!, approved: true, adminToken: token, nombre: NOMBRE });
    expect((await pendingApprovals("soc-e")).length).toBe(1);
  });
});

describe("authorizeAndResolve is TOKEN-gated", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("a WRONG token cannot resolve (403) — knowing the CUIT is no longer enough", async () => {
    await seedSociety("soc-f");
    const g = await gateAction("soc-f", "transfer_funds", { x: 1 });
    const r = await authorizeAndResolve({
      id: g.requestId!,
      approved: true,
      adminToken: "sat_attacker_guess",
      nombre: "Mallory",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
  });

  it("a nonexistent approval id -> 404", async () => {
    const r = await authorizeAndResolve({
      id: "does-not-exist",
      approved: true,
      adminToken: "sat_whatever",
      nombre: NOMBRE,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });
});
