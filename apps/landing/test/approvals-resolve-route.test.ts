import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "../src/app/api/approvals/resolve/route";
import { requestApproval } from "../src/lib/approvals";
import { mintAdminToken } from "../src/lib/admin-token";

beforeEach(() => {
  process.env.AUDIT_HMAC_SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
  // Exercise the in-memory store (no Vercel KV in tests).
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

function post(body: unknown): Promise<Response> {
  return POST(
    new Request("https://ar-agents.ar/api/approvals/resolve", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
}

function postRaw(rawBody: string): Promise<Response> {
  return POST(
    new Request("https://ar-agents.ar/api/approvals/resolve", {
      method: "POST",
      body: rawBody,
    }),
  );
}

describe("POST /api/approvals/resolve", () => {
  it("400s with bad_json on an unparseable body", async () => {
    const res = await postRaw("{ not json");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "bad_json" });
  });

  it("400s with falta_id when id is missing", async () => {
    const res = await post({ approved: true, adminToken: "x" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "falta_id" });
  });

  it("400s with falta_approved when approved is missing", async () => {
    const res = await post({ id: "some-id" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "falta_approved" });
  });

  it("400s with falta_token when adminToken is missing", async () => {
    const res = await post({ id: "some-id", approved: true });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "falta_token" });
  });

  it("404s with aprobacion_inexistente for an id that doesn't exist", async () => {
    const res = await post({
      id: "nonexistent-uuid",
      approved: true,
      adminToken: "sat_whatever",
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "aprobacion_inexistente" });
  });

  it("403s with token_invalido when the admin token doesn't match the society", async () => {
    const society = "resolve-route-badtoken";
    const req = await requestApproval(society, "transfer_funds", "deadbeefhash01", "{}");
    const res = await post({
      id: req.id,
      approved: true,
      adminToken: "sat_not_a_real_token",
    });
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "token_invalido" });
  });

  it("200s and approves a pending request with a valid admin token", async () => {
    const society = "resolve-route-approve";
    const req = await requestApproval(society, "transfer_funds", "deadbeefhash01", "{}");
    const token = await mintAdminToken(society);
    const res = await post({
      id: req.id,
      approved: true,
      adminToken: token,
      nombre: "Juan Perez",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      request: { status: string };
      audit: { entry: unknown };
    };
    expect(body.ok).toBe(true);
    expect(body.request.status).toBe("approved");
    expect(body.audit.entry).toBeTruthy();
  });

  it("200s and denies a pending request with a valid admin token", async () => {
    const society = "resolve-route-deny";
    const req = await requestApproval(society, "transfer_funds", "deadbeefhash01", "{}");
    const token = await mintAdminToken(society);
    const res = await post({
      id: req.id,
      approved: false,
      adminToken: token,
      nombre: "Juan Perez",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      request: { status: string };
      audit: { entry: unknown };
    };
    expect(body.ok).toBe(true);
    expect(body.request.status).toBe("denied");
    expect(body.audit.entry).toBeTruthy();
  });

  it("409s with ya_resuelta when resolving the same request twice", async () => {
    const society = "resolve-route-double";
    const req = await requestApproval(society, "transfer_funds", "deadbeefhash01", "{}");
    const token = await mintAdminToken(society);
    const first = await post({
      id: req.id,
      approved: true,
      adminToken: token,
      nombre: "Juan Perez",
    });
    expect(first.status).toBe(200);

    const second = await post({
      id: req.id,
      approved: true,
      adminToken: token,
      nombre: "Juan Perez",
    });
    expect(second.status).toBe(409);
    const body = (await second.json()) as { ok: boolean; error: string };
    expect(body).toEqual({ ok: false, error: "ya_resuelta" });
  });
});
