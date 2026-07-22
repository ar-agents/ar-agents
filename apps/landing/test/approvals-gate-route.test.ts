import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/approvals/gate/route";
import { type ApproverAttestation, appendAudit } from "../src/lib/audit";
import { mintGateToken } from "../src/lib/gate-token";

const ADMIN: ApproverAttestation = {
  method: "self-attested",
  principal: "cuit:20123456786", // 20-12345678-6
  principalKind: "declared-cuit",
  declaredBy: "Juan Perez",
};

beforeEach(() => {
  process.env.AUDIT_HMAC_SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
  // Exercise the in-memory store (no Vercel KV in tests).
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

/** Register a society by appending an incorporation audit entry, like seedSociety does. */
async function registerSociety(sid: string): Promise<void> {
  await appendAudit(
    sid,
    { tool: "incorporate_attested", governance: "audit-logged", approver: ADMIN, input: {}, output: {} },
    { durable: true },
  );
}

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://ar-agents.ar/api/approvals/gate", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function postRaw(rawBody: string): Promise<Response> {
  return POST(
    new Request("https://ar-agents.ar/api/approvals/gate", {
      method: "POST",
      body: rawBody,
    }),
  );
}

describe("POST /api/approvals/gate", () => {
  it("400s with bad_json on an unparseable body", async () => {
    const res = await postRaw("{ not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "bad_json" });
  });

  it("400s with falta_society_o_tool when tool is missing", async () => {
    const res = await post({ society: "gate-route-missing-tool" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "falta_society_o_tool" });
  });

  it("400s with falta_society_o_tool when society is missing", async () => {
    const res = await post({ tool: "transfer_funds" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "falta_society_o_tool" });
  });

  it("404s with sociedad_sin_registro for an unregistered society", async () => {
    const res = await post({ society: "gate-route-unregistered", tool: "transfer_funds" });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "sociedad_sin_registro" });
  });

  it("200s and queues a pending request for a registered legacy society without a gate token", async () => {
    const society = "gate-route-legacy";
    await registerSociety(society);
    const res = await post({ society, tool: "transfer_funds", args: { amount: 100 } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      approved: boolean;
      status: string;
      requestId?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.approved).toBe(false);
    expect(body.status).toBe("pending");
    expect(typeof body.requestId).toBe("string");
    expect(body.requestId!.length).toBeGreaterThan(0);
  });

  it("403s with gate_token_invalido when the society has a gate token but the caller omits it", async () => {
    const society = "gate-route-tokened-missing";
    await registerSociety(society);
    await mintGateToken(society);
    const res = await post({ society, tool: "transfer_funds", args: { amount: 100 } });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "gate_token_invalido" });
  });

  it("403s with gate_token_invalido when the society has a gate token but the caller presents a wrong one", async () => {
    const society = "gate-route-tokened-wrong";
    await registerSociety(society);
    await mintGateToken(society);
    const res = await post({
      society,
      tool: "transfer_funds",
      args: { amount: 100 },
      gateToken: "sgt_not_the_real_token",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "gate_token_invalido" });
  });

  it("200s and queues a pending request when the correct gate token is presented", async () => {
    const society = "gate-route-tokened-correct";
    await registerSociety(society);
    const token = await mintGateToken(society);
    const res = await post({
      society,
      tool: "transfer_funds",
      args: { amount: 100 },
      gateToken: token,
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      approved: boolean;
      status: string;
      requestId?: string;
    };
    expect(body.ok).toBe(true);
    expect(body.approved).toBe(false);
    expect(body.status).toBe("pending");
    expect(typeof body.requestId).toBe("string");
  });
});
