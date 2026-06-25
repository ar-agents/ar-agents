import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "../src/app/api/approvals/pending/route";
import { requestApproval } from "../src/lib/approvals";
import { mintAdminToken } from "../src/lib/admin-token";

beforeEach(() => {
  // Exercise the in-memory store (no Vercel KV in tests).
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

function get(society: string, headers?: Record<string, string>): Promise<Response> {
  return GET(
    new Request(
      `https://ar-agents.ar/api/approvals/pending?society=${encodeURIComponent(society)}`,
      headers ? { headers } : undefined,
    ),
  );
}

describe("GET /api/approvals/pending — arg redaction (DeepSec MEDIUM)", () => {
  it("redacts argsPreview + argsHash for unauthenticated callers", async () => {
    const society = "soc-public-1";
    await requestApproval(
      society,
      "mercadopago.preapproval.create",
      "deadbeefhash01",
      JSON.stringify({ amount: 999999, cuit: "20-12345678-6", cbu: "0170999" }),
    );
    const res = await get(society);
    const body = (await res.json()) as {
      ok: boolean;
      authorized: boolean;
      pending: Array<Record<string, unknown>>;
    };
    expect(body.ok).toBe(true);
    expect(body.authorized).toBe(false);
    expect(body.pending).toHaveLength(1);
    const p = body.pending[0]!;
    // Non-sensitive metadata is present...
    expect(p.id).toBeTruthy();
    expect(p.tool).toBe("mercadopago.preapproval.create");
    expect(p.status).toBe("pending");
    expect(p.createdAt).toBeTruthy();
    // ...but the sensitive fields are gone.
    expect(p.argsPreview).toBeUndefined();
    expect(p.argsHash).toBeUndefined();
    // No leaked value anywhere in the serialized public payload.
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("999999");
    expect(serialized).not.toContain("20-12345678-6");
    expect(serialized).not.toContain("deadbeefhash01");
  });

  it("returns full args (incl. argsPreview) to a caller with a valid admin token", async () => {
    const society = "soc-admin-1";
    await requestApproval(
      society,
      "banking.transfer",
      "h2hashvalue",
      JSON.stringify({ amount: 5000, to: "ACME" }),
    );
    const token = await mintAdminToken(society);
    const res = await get(society, { "x-admin-token": token! });
    const body = (await res.json()) as {
      authorized: boolean;
      pending: Array<{ argsPreview?: string }>;
    };
    expect(body.authorized).toBe(true);
    expect(body.pending[0]!.argsPreview).toContain("5000");
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
  });

  it("treats an invalid admin token as unauthenticated (still redacted)", async () => {
    const society = "soc-bad-1";
    await requestApproval(
      society,
      "banking.transfer",
      "h3hashvalue",
      JSON.stringify({ amount: 7 }),
    );
    const res = await get(society, { "x-admin-token": "sat_not_a_real_token" });
    const body = (await res.json()) as {
      authorized: boolean;
      pending: Array<{ argsPreview?: string }>;
    };
    expect(body.authorized).toBe(false);
    expect(body.pending[0]!.argsPreview).toBeUndefined();
  });

  it("400s when society is missing", async () => {
    const res = await GET(new Request("https://ar-agents.ar/api/approvals/pending"));
    expect(res.status).toBe(400);
  });
});
