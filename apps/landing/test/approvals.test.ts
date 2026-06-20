import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

async function seedSociety(sid: string, approver: ApproverAttestation = ADMIN): Promise<void> {
  await appendAudit(
    sid,
    { tool: "incorporate_attested", governance: "audit-logged", approver, input: {}, output: {} },
    { durable: true },
  );
}

const RESOLVE = { nombre: "Juan Pérez", cuit: "20-12345678-6" };

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
    await seedSociety("soc-a");
    const args = { cbu: "x", amount: 5000 };
    const g1 = await gateAction("soc-a", "transfer_funds", args);
    expect(g1.approved).toBe(false);
    expect(g1.status).toBe("pending");

    const r = await authorizeAndResolve({ id: g1.requestId!, approved: true, ...RESOLVE });
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
    await seedSociety("soc-c");
    const g = await gateAction("soc-c", "transfer_funds", { x: 1 });
    await authorizeAndResolve({ id: g.requestId!, approved: true, ...RESOLVE });
    const last = (await readAudit("soc-c")).at(-1)!;
    expect(last.tool).toBe("aprobar_accion");
    expect(last.approver?.declaredBy).toBe("Juan Pérez");
  });

  it("a denial is STICKY: the action does not silently re-queue as approvable (#7)", async () => {
    await seedSociety("soc-d");
    const g = await gateAction("soc-d", "transfer_funds", { x: 1 });
    await authorizeAndResolve({ id: g.requestId!, approved: false, ...RESOLVE });
    const g2 = await gateAction("soc-d", "transfer_funds", { x: 1 });
    expect(g2.approved).toBe(false);
    expect(g2.status).toBe("denied"); // surfaced as denied, not a fresh pending
    expect(g2.requestId).toBe(g.requestId); // same request, not re-queued
  });

  it("single-use is ATOMIC: concurrent gates can't double-consume one approval (#3)", async () => {
    await seedSociety("soc-race");
    const args = { cbu: "x", amount: 9999 };
    const g = await gateAction("soc-race", "transfer_funds", args);
    await authorizeAndResolve({ id: g.requestId!, approved: true, ...RESOLVE });
    // two concurrent consumes of the SAME approved action
    const [a, b] = await Promise.all([
      gateAction("soc-race", "transfer_funds", args),
      gateAction("soc-race", "transfer_funds", args),
    ]);
    expect([a.approved, b.approved].filter(Boolean).length).toBe(1); // exactly one proceeds
  });

  it("pendingApprovals lists pending, excludes resolved", async () => {
    await seedSociety("soc-e");
    const g1 = await gateAction("soc-e", "tool_a", { x: 1 });
    await gateAction("soc-e", "tool_b", { y: 2 });
    expect((await pendingApprovals("soc-e")).length).toBe(2);
    await authorizeAndResolve({ id: g1.requestId!, approved: true, ...RESOLVE });
    expect((await pendingApprovals("soc-e")).length).toBe(1);
  });
});

describe("authorizeAndResolve is CUIT-gated", () => {
  beforeEach(setup);
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  it("a different administrator cannot resolve (403)", async () => {
    await seedSociety("soc-f", { ...ADMIN, principal: "cuit:27111111110", declaredBy: "Otro" });
    const g = await gateAction("soc-f", "transfer_funds", { x: 1 });
    const r = await authorizeAndResolve({ id: g.requestId!, approved: true, ...RESOLVE });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(403);
  });

  it("an invalid CUIT -> 422", async () => {
    const r = await authorizeAndResolve({
      id: "whatever",
      approved: true,
      nombre: "Juan Pérez",
      cuit: "20-12345678-9",
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
  });

  it("a nonexistent approval id -> 404", async () => {
    const r = await authorizeAndResolve({
      id: "does-not-exist",
      approved: true,
      ...RESOLVE,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(404);
  });
});
