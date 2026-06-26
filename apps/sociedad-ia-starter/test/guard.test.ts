import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clientIp, rateLimit, requireApiKey } from "../src/lib/guard";

const KEY = "test-agent-key-123456";

function reqWith(headers: Record<string, string>): Request {
  return new Request("https://starter.test/api/agent", {
    method: "POST",
    headers,
  });
}

describe("requireApiKey (fail-closed)", () => {
  const original = process.env.AGENT_API_KEY;
  afterEach(() => {
    if (original === undefined) delete process.env.AGENT_API_KEY;
    else process.env.AGENT_API_KEY = original;
  });

  it("refuses with 503 when AGENT_API_KEY is unset (secure by default)", () => {
    delete process.env.AGENT_API_KEY;
    const r = requireApiKey(reqWith({ authorization: `Bearer ${KEY}` }));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.status).toBe(503);
    expect(r.error).toBe("not_configured");
  });

  it("401s a missing key", () => {
    process.env.AGENT_API_KEY = KEY;
    const r = requireApiKey(reqWith({}));
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error();
    expect(r.status).toBe(401);
  });

  it("401s a wrong key", () => {
    process.env.AGENT_API_KEY = KEY;
    const r = requireApiKey(reqWith({ authorization: "Bearer nope" }));
    expect(r.ok).toBe(false);
  });

  it("accepts the correct key via Authorization: Bearer", () => {
    process.env.AGENT_API_KEY = KEY;
    expect(requireApiKey(reqWith({ authorization: `Bearer ${KEY}` })).ok).toBe(true);
  });

  it("accepts the correct key via x-api-key", () => {
    process.env.AGENT_API_KEY = KEY;
    expect(requireApiKey(reqWith({ "x-api-key": KEY })).ok).toBe(true);
  });
});

describe("clientIp (spoof-resistant)", () => {
  it("prefers the platform x-vercel-forwarded-for", () => {
    expect(
      clientIp(
        reqWith({
          "x-vercel-forwarded-for": "9.9.9.9",
          "x-forwarded-for": "1.1.1.1, 2.2.2.2",
        }),
      ),
    ).toBe("9.9.9.9");
  });

  it("never trusts the leftmost x-forwarded-for hop", () => {
    // Falls back to the RIGHTMOST (closest trusted proxy), not the caller hop.
    expect(clientIp(reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("2.2.2.2");
  });

  it("returns 'unknown' with no forwarding headers", () => {
    expect(clientIp(reqWith({}))).toBe("unknown");
  });
});

describe("rateLimit (fixed window)", () => {
  let ipN = 0;
  beforeEach(() => {
    ipN += 1;
  });

  it("allows up to max then blocks", () => {
    const ip = `ip-${ipN}`;
    for (let i = 0; i < 3; i++) expect(rateLimit("t", ip, 3, 60_000)).toBe(true);
    expect(rateLimit("t", ip, 3, 60_000)).toBe(false);
  });

  it("scopes buckets independently", () => {
    const ip = `ip-${ipN}`;
    expect(rateLimit("a", ip, 1, 60_000)).toBe(true);
    expect(rateLimit("a", ip, 1, 60_000)).toBe(false);
    expect(rateLimit("b", ip, 1, 60_000)).toBe(true); // different scope
  });

  it("resets after the window elapses", () => {
    const ip = `ip-${ipN}`;
    expect(rateLimit("t", ip, 1, 1)).toBe(true);
    // window of 1ms — next tick is a fresh window
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        expect(rateLimit("t", ip, 1, 1)).toBe(true);
        resolve();
      }, 5),
    );
  });
});
