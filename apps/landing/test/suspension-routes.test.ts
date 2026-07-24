import { beforeEach, describe, expect, it } from "vitest";
import { POST as suspend } from "../src/app/api/suspender/route";
import { POST as resume } from "../src/app/api/reanudar/route";
import { mintAdminToken } from "../src/lib/admin-token";
import { type ApproverAttestation, appendAudit, readAudit } from "../src/lib/audit";
import { isSuspended } from "../src/lib/suspension";

const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";
const ADMIN: ApproverAttestation = {
  method: "self-attested",
  principal: "cuit:20123456786", // 20-12345678-6 (fictional)
  principalKind: "declared-cuit",
  declaredBy: "Juan Perez",
};

beforeEach(() => {
  process.env.AUDIT_HMAC_SECRET = SECRET;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

async function seedSociety(sid: string): Promise<string> {
  await appendAudit(
    sid,
    { tool: "incorporate_attested", governance: "audit-logged", approver: ADMIN, input: {}, output: {} },
    { durable: true },
  );
  const token = (await mintAdminToken(sid))!;
  return token;
}

function req(path: string, ip: string, body: unknown): Request {
  return new Request(`https://ar-agents.ar${path}`, {
    method: "POST",
    headers: { "x-vercel-forwarded-for": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

type ErrBody = { ok: false; error: string; message?: string };
type OkBody = { ok: true; suspended: boolean; society: string; audit: { entry: unknown } };

describe("POST /api/suspender and /api/reanudar", () => {
  it("suspender suspends a valid seeded society and logs suspender_sociedad", async () => {
    const sid = "route-suspend-ok";
    const token = await seedSociety(sid);
    const res = await suspend(
      req("/api/suspender", "10.0.0.1", { society: sid, adminToken: token, acepta: true }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as OkBody;
    expect(body.ok).toBe(true);
    expect(body.suspended).toBe(true);
    expect(await isSuspended(sid)).toBe(true);
    const entries = await readAudit(sid);
    expect(entries.at(-1)!.tool).toBe("suspender_sociedad");
  });

  it("reanudar after a suspend flips the flag back off and logs reanudar_sociedad", async () => {
    const sid = "route-resume-ok";
    const token = await seedSociety(sid);
    const suspendRes = await suspend(
      req("/api/suspender", "10.0.0.2", { society: sid, adminToken: token, acepta: true }),
    );
    expect(suspendRes.status).toBe(200);
    expect(await isSuspended(sid)).toBe(true);

    const resumeRes = await resume(
      req("/api/reanudar", "10.0.0.3", { society: sid, adminToken: token, acepta: true }),
    );
    expect(resumeRes.status).toBe(200);
    const body = (await resumeRes.json()) as OkBody;
    expect(body.ok).toBe(true);
    expect(body.suspended).toBe(false);
    expect(await isSuspended(sid)).toBe(false);
    const entries = await readAudit(sid);
    expect(entries.at(-1)!.tool).toBe("reanudar_sociedad");
  });

  it("400s with bad_json on an unparseable body", async () => {
    const res = await suspend(req("/api/suspender", "10.0.0.4", "{ not json"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("bad_json");
  });

  it("400s with art102_no_aceptado when acepta is missing", async () => {
    const res = await suspend(
      req("/api/suspender", "10.0.0.5", { society: "whatever", adminToken: "x" }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("art102_no_aceptado");
    expect(typeof body.message).toBe("string");
  });

  it("400s with art102_no_aceptado when a valid society/token pair sets acepta:false", async () => {
    const sid = "route-acepta-false";
    const token = await seedSociety(sid);
    const res = await suspend(
      req("/api/suspender", "10.0.0.6", { society: sid, adminToken: token, acepta: false }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("art102_no_aceptado");
  });

  it("400s with falta_society when acepta:true but society is missing", async () => {
    const res = await suspend(
      req("/api/suspender", "10.0.0.7", { adminToken: "x", acepta: true }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("falta_society");
  });

  it("400s with falta_token when acepta:true and society is present but adminToken is missing", async () => {
    const res = await suspend(
      req("/api/suspender", "10.0.0.8", { society: "whatever", acepta: true }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("falta_token");
  });

  it("403s with token_invalido against a seeded society with a WRONG token", async () => {
    const sid = "route-badtoken";
    await seedSociety(sid);
    const res = await suspend(
      req("/api/suspender", "10.0.0.9", {
        society: sid,
        adminToken: "sat_attacker_guess",
        acepta: true,
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("token_invalido");
    expect(await isSuspended(sid)).toBe(false);
  });

  it("404s with sociedad_sin_registro for a society with no constitution record", async () => {
    const res = await suspend(
      req("/api/suspender", "10.0.0.10", {
        society: "route-ghost",
        adminToken: "sat_whatever",
        acepta: true,
      }),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as ErrBody;
    expect(body.ok).toBe(false);
    expect(body.error).toBe("sociedad_sin_registro");
  });
});
