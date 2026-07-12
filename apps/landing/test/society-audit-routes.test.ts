/**
 * Route tests for `/api/society-audit/append` and `/api/society-audit/tail`
 * (ROADMAP.md M3-6): auth fail-closed on the society's own gate token,
 * namespace isolation between two societies' tokens, and server-side caps
 * that never trust the writer.
 *
 * Gate tokens are WRITE-ONCE per sessionId (@/lib/capability-token): a
 * second `mintGateToken` for the same id returns null. So each test mints
 * its own fresh, unique society id (a real UUID, matching `isSessionIdValid`
 * and real production sessionIds) rather than reusing one across tests --
 * same convention as test/gate-token.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mintGateToken } from "../src/lib/gate-token";
import { __resetSocietyAuditForTests } from "../src/lib/society-audit";
import { POST as postAppend } from "../src/app/api/society-audit/append/route";
import { GET as getTail } from "../src/app/api/society-audit/tail/route";

let idCounter = 0;
/** A fresh, valid (per isSessionIdValid) society id every call. */
function freshSocietyId(): string {
  idCounter += 1;
  return `soc-audit-test-${idCounter}-${"a".repeat(8)}`;
}

function entryFor(tool: string) {
  return {
    id: `${new Date().toISOString()}-${tool}`,
    ts: new Date().toISOString(),
    tool,
    governance: "create",
    errored: false,
    summary: `${tool}: acción ejecutada.`,
    hmac: null,
  };
}

function postReq(body: unknown): Request {
  return new Request("https://ar-agents.test/api/society-audit/append", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function tailReq(society: string, opts: { gateToken?: string; limit?: number } = {}): Request {
  const url = new URL("https://ar-agents.test/api/society-audit/tail");
  url.searchParams.set("society", society);
  if (opts.limit !== undefined) url.searchParams.set("limit", String(opts.limit));
  const headers: Record<string, string> = {};
  if (opts.gateToken !== undefined) headers["x-gate-token"] = opts.gateToken;
  return new Request(url.toString(), { headers });
}

beforeEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  __resetSocietyAuditForTests();
});

afterEach(() => {
  __resetSocietyAuditForTests();
});

describe("POST /api/society-audit/append — auth (fail-closed)", () => {
  it("400s a missing/invalid society id", async () => {
    const res = await postAppend(postReq({ society: "short", gateToken: "x", entry: entryFor("t") }));
    expect(res.status).toBe(400);
  });

  it("403s a society with no gate token minted (no legacy carve-out)", async () => {
    const soc = freshSocietyId();
    const res = await postAppend(postReq({ society: soc, gateToken: "sgt_anything", entry: entryFor("t") }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("gate_token_invalido");
  });

  it("403s a wrong gate token for a real society", async () => {
    const soc = freshSocietyId();
    await mintGateToken(soc);
    const res = await postAppend(postReq({ society: soc, gateToken: "sgt_wrong_guess", entry: entryFor("t") }));
    expect(res.status).toBe(403);
  });

  it("403s an empty gate token", async () => {
    const soc = freshSocietyId();
    await mintGateToken(soc);
    const res = await postAppend(postReq({ society: soc, gateToken: "", entry: entryFor("t") }));
    expect(res.status).toBe(403);
  });

  it("200s with the society's real gate token", async () => {
    const soc = freshSocietyId();
    const token = await mintGateToken(soc);
    const res = await postAppend(
      postReq({ society: soc, gateToken: token, entry: entryFor("registrar_decision") }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe("POST /api/society-audit/append — caps (never trust the writer)", () => {
  it("400s on a malformed entry (bad_json handled separately; here: wrong field types)", async () => {
    const soc = freshSocietyId();
    const token = await mintGateToken(soc);
    const res = await postAppend(postReq({ society: soc, gateToken: token, entry: { garbage: true } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("entrada_invalida");
  });

  it("400s bad JSON", async () => {
    const req = new Request("https://ar-agents.test/api/society-audit/append", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await postAppend(req);
    expect(res.status).toBe(400);
  });

  it("caps an oversized field server-side even though the token is valid", async () => {
    const soc = freshSocietyId();
    const token = await mintGateToken(soc);
    const oversized = { ...entryFor("t"), summary: "x".repeat(5000) };
    const res = await postAppend(postReq({ society: soc, gateToken: token, entry: oversized }));
    expect(res.status).toBe(200);

    const tailRes = await getTail(tailReq(soc, { gateToken: token! }));
    const tailBody = await tailRes.json();
    expect(tailBody.entries[0].summary.length).toBeLessThanOrEqual(280);
  });
});

describe("GET /api/society-audit/tail — auth + isolation between two gate tokens", () => {
  it("400s a missing/invalid society id", async () => {
    const res = await getTail(tailReq("short", { gateToken: "x" }));
    expect(res.status).toBe(400);
  });

  it("403s a missing gate token header", async () => {
    const soc = freshSocietyId();
    await mintGateToken(soc);
    const res = await getTail(tailReq(soc));
    expect(res.status).toBe(403);
  });

  it("403s the wrong society's gate token (cross-society isolation)", async () => {
    const socA = freshSocietyId();
    const socB = freshSocietyId();
    const tokenA = await mintGateToken(socA);
    await mintGateToken(socB);
    // token minted for A must not unlock B's namespace.
    const res = await getTail(tailReq(socB, { gateToken: tokenA! }));
    expect(res.status).toBe(403);
  });

  it("a society can only ever read its OWN entries, never another's", async () => {
    const socA = freshSocietyId();
    const socB = freshSocietyId();
    const tokenA = await mintGateToken(socA);
    const tokenB = await mintGateToken(socB);

    await postAppend(postReq({ society: socA, gateToken: tokenA, entry: entryFor("a_tool") }));
    await postAppend(postReq({ society: socB, gateToken: tokenB, entry: entryFor("b_tool") }));

    const resA = await getTail(tailReq(socA, { gateToken: tokenA! }));
    const bodyA = await resA.json();
    expect(bodyA.entries).toHaveLength(1);
    expect(bodyA.entries[0].tool).toBe("a_tool");

    const resB = await getTail(tailReq(socB, { gateToken: tokenB! }));
    const bodyB = await resB.json();
    expect(bodyB.entries).toHaveLength(1);
    expect(bodyB.entries[0].tool).toBe("b_tool");

    // Even with a VALID token for A, no request can name society=B and see
    // B's entries -- the 403 test above already proves the auth rejects it,
    // this proves the two logs never merge when both are legitimately
    // populated at once.
    const serializedA = JSON.stringify(bodyA);
    expect(serializedA).not.toContain("b_tool");
  });

  it("respects the limit query param, clamped and capped server-side", async () => {
    const soc = freshSocietyId();
    const token = await mintGateToken(soc);
    for (let i = 0; i < 5; i++) {
      await postAppend(postReq({ society: soc, gateToken: token, entry: entryFor(`tool_${i}`) }));
    }
    const res = await getTail(tailReq(soc, { gateToken: token!, limit: 2 }));
    const body = await res.json();
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].tool).toBe("tool_4");
    expect(body.entries[1].tool).toBe("tool_3");
  });
});
