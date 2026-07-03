import { describe, it, expect, vi } from "vitest";
import {
  UnconfiguredBindAdapter,
  HttpBindAdapter,
  SANDBOX_BASE_URL,
  BindValidationError,
} from "../src/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const LOGIN_OK = { token: "tok-1", expires_in: 3600 };

function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init),
  ) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe("UnconfiguredBindAdapter (default)", () => {
  const a = new UnconfiguredBindAdapter();

  it("returns structured unconfigured result on listAccounts", async () => {
    const r = await a.listAccounts();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unconfigured");
  });

  it("returns structured unconfigured result on getMovements", async () => {
    const r = await a.getMovements({ accountId: "21-1-99999-4-6" });
    expect(r).toMatchObject({ ok: false, code: "unconfigured" });
  });

  it("returns structured unconfigured result on getCbuOwner", async () => {
    const r = await a.getCbuOwner({ cbuCvu: "0".repeat(22) });
    expect(r).toMatchObject({ ok: false, code: "unconfigured" });
  });

  it("never moves money: createTransfer is structured, not thrown", async () => {
    const r = await a.createTransfer("21-1-99999-4-6", {
      origin_id: "1",
      to: { cbu: "0".repeat(22) },
      value: { currency: "ARS", amount: 10 },
      concept: "VAR",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("No money was moved");
  });

  it("returns structured unconfigured result on createDebin and getEcheqs", async () => {
    const d = await a.createDebin("21-1-99999-4-6", {
      origin_id: "1",
      to: { label: "alias" },
      value: { currency: "ARS", amount: 10 },
      concept: "VAR",
      expiration: 60,
    });
    const e = await a.getEcheqs({ accountId: "21-1-99999-4-6", status: "ACTIVE" });
    expect(d).toMatchObject({ ok: false, code: "unconfigured" });
    expect(e).toMatchObject({ ok: false, code: "unconfigured" });
  });
});

describe("HttpBindAdapter construction", () => {
  it("requires username+password or token", () => {
    expect(() => new HttpBindAdapter({})).toThrow(BindValidationError);
    expect(() => new HttpBindAdapter({ username: "u" })).toThrow(BindValidationError);
    expect(() => new HttpBindAdapter({ token: "t" })).not.toThrow();
    expect(() => new HttpBindAdapter({ username: "u", password: "p" })).not.toThrow();
  });

  it("defaults to the sandbox base URL", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse([]);
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    await a.listAccounts();
    expect(String(fetchImpl.mock.calls[0]![0])).toContain(SANDBOX_BASE_URL);
  });
});

describe("HttpBindAdapter auth flow (JWT)", () => {
  it("logs in lazily with username/password and sends Authorization: JWT <token>", async () => {
    const seen: { url: string; headers: Record<string, string>; body?: string }[] = [];
    const fetchImpl = mockFetch((url, init) => {
      seen.push({
        url,
        headers: (init?.headers ?? {}) as Record<string, string>,
        ...(init?.body ? { body: String(init.body) } : {}),
      });
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse([]);
    });
    const a = new HttpBindAdapter({ username: "user", password: "pass", fetchImpl });
    const r = await a.listAccounts();
    expect(r.ok).toBe(true);
    expect(seen[0]!.url).toBe(`${SANDBOX_BASE_URL}/login/jwt`);
    expect(JSON.parse(seen[0]!.body!)).toEqual({ username: "user", password: "pass" });
    expect(seen[1]!.url).toBe(`${SANDBOX_BASE_URL}/banks/322/accounts/owner`);
    expect(seen[1]!.headers["authorization"]).toBe("JWT tok-1");
  });

  it("reuses a non-expired token across calls (single login)", async () => {
    let logins = 0;
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) {
        logins++;
        return jsonResponse(LOGIN_OK);
      }
      return jsonResponse([]);
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    await a.listAccounts();
    await a.listAccounts();
    await a.listAccounts();
    expect(logins).toBe(1);
  });

  it("re-logs in when the token is expired (expires_in elapsed)", async () => {
    let logins = 0;
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) {
        logins++;
        // 61s ttl minus the 60s safety margin = ~1s validity
        return jsonResponse({ token: `tok-${logins}`, expires_in: 61 });
      }
      return jsonResponse([]);
    });
    vi.useFakeTimers();
    try {
      const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
      await a.listAccounts();
      vi.advanceTimersByTime(40_000);
      await a.listAccounts();
      expect(logins).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries once with a fresh login on unexpected 401", async () => {
    let logins = 0;
    let accountCalls = 0;
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) {
        logins++;
        return jsonResponse({ token: `tok-${logins}`, expires_in: 3600 });
      }
      accountCalls++;
      if (accountCalls === 1) return jsonResponse({ error: "revoked" }, 401);
      return jsonResponse([{ id: "21-1-99999-4-6" }]);
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    const r = await a.listAccounts();
    expect(r.ok).toBe(true);
    expect(logins).toBe(2);
    expect(accountCalls).toBe(2);
  });

  it("returns structured auth_failed when credentials are rejected", async () => {
    const fetchImpl = mockFetch(() => jsonResponse({ error: "bad" }, 401));
    const a = new HttpBindAdapter({ username: "u", password: "bad", fetchImpl });
    const r = await a.listAccounts();
    expect(r).toMatchObject({ ok: false, code: "auth_failed" });
  });

  it("accepts a pre-issued token and skips login", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) throw new Error("login must not be called");
      return jsonResponse([]);
    });
    const a = new HttpBindAdapter({ token: "pre-issued", fetchImpl });
    const r = await a.listAccounts();
    expect(r.ok).toBe(true);
  });
});

describe("HttpBindAdapter operations", () => {
  function adapterCapturing(seen: { url: string; init?: RequestInit }[]) {
    const fetchImpl = mockFetch((url, init) => {
      seen.push({ url, ...(init ? { init } : {}) });
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse([]);
    });
    return new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
  }

  it("getMovements sends obp_* pagination and date headers", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const a = adapterCapturing(seen);
    await a.getMovements({
      accountId: "21-1-99999-4-6",
      fromDate: "2026-01-01",
      toDate: "2026-02-01",
      limit: 50,
      offset: 2,
    });
    const call = seen.find((c) => c.url.includes("/transactions"))!;
    expect(call.url).toBe(
      `${SANDBOX_BASE_URL}/banks/322/accounts/21-1-99999-4-6/owner/transactions`,
    );
    const h = call.init!.headers as Record<string, string>;
    expect(h["obp_from_date"]).toBe("2026-01-01");
    expect(h["obp_to_date"]).toBe("2026-02-01");
    expect(h["obp_limit"]).toBe("50");
    expect(h["obp_offset"]).toBe("2");
  });

  it("getCbuOwner hits /accounts/cbu/:cbu_cvu for a CBU", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const a = adapterCapturing(seen);
    const cbu = "3220001823001077580012";
    await a.getCbuOwner({ cbuCvu: cbu });
    expect(seen.some((c) => c.url === `${SANDBOX_BASE_URL}/accounts/cbu/${cbu}`)).toBe(true);
  });

  it("getCbuOwner hits /accounts/alias/:alias for an alias", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const a = adapterCapturing(seen);
    await a.getCbuOwner({ alias: "mi.alias.cbu" });
    expect(
      seen.some((c) => c.url === `${SANDBOX_BASE_URL}/accounts/alias/mi.alias.cbu`),
    ).toBe(true);
  });

  it("getCbuOwner rejects invalid CBU and missing/ambiguous args without network", async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error("network must not be called");
    });
    const a = new HttpBindAdapter({ token: "t", fetchImpl });
    expect(await a.getCbuOwner({ cbuCvu: "123" })).toMatchObject({
      ok: false,
      code: "validation",
    });
    expect(await a.getCbuOwner({})).toMatchObject({ ok: false, code: "validation" });
    expect(
      await a.getCbuOwner({ cbuCvu: "0".repeat(22), alias: "x" }),
    ).toMatchObject({ ok: false, code: "validation" });
  });

  it("createTransfer POSTs the verified body shape to the TRANSFER endpoint", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const a = adapterCapturing(seen);
    await a.createTransfer("21-1-99999-4-6", {
      origin_id: "55789",
      to: { label: "AliasPrueba1234" },
      value: { currency: "ARS", amount: 10.0 },
      description: "COMPLETE_TRANS",
      concept: "VAR",
      emails: ["apibank@example.com"],
    });
    const call = seen.find((c) => c.url.includes("TRANSFER/transaction-requests"))!;
    expect(call.url).toBe(
      `${SANDBOX_BASE_URL}/banks/322/accounts/21-1-99999-4-6/owner/transaction-request-types/TRANSFER/transaction-requests`,
    );
    expect(call.init!.method).toBe("POST");
    const body = JSON.parse(String(call.init!.body));
    expect(body.origin_id).toBe("55789");
    expect(body.to.label).toBe("AliasPrueba1234");
    expect(body.value).toEqual({ currency: "ARS", amount: 10.0 });
  });

  it("createTransfer rejects missing destination and non-positive amount without network", async () => {
    const fetchImpl = mockFetch(() => {
      throw new Error("network must not be called");
    });
    const a = new HttpBindAdapter({ token: "t", fetchImpl });
    expect(
      await a.createTransfer("21-1-99999-4-6", {
        origin_id: "1",
        to: {},
        value: { currency: "ARS", amount: 10 },
        concept: "VAR",
      }),
    ).toMatchObject({ ok: false, code: "validation" });
    expect(
      await a.createTransfer("21-1-99999-4-6", {
        origin_id: "1",
        to: { cbu: "0".repeat(22) },
        value: { currency: "ARS", amount: 0 },
        concept: "VAR",
      }),
    ).toMatchObject({ ok: false, code: "validation" });
  });

  it("createDebin POSTs to the DEBIN endpoint with the verified shape", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const a = adapterCapturing(seen);
    await a.createDebin("21-1-99999-4-6", {
      origin_id: "556677",
      to: { label: "alias" },
      value: { currency: "ARS", amount: 10 },
      concept: "EXP",
      expiration: 36,
    });
    const call = seen.find((c) => c.url.includes("DEBIN/transaction-requests"))!;
    expect(call.init!.method).toBe("POST");
    const body = JSON.parse(String(call.init!.body));
    expect(body).toMatchObject({ origin_id: "556677", concept: "EXP", expiration: 36 });
  });

  it("getEcheqs sends the required obp_status header plus optional filters", async () => {
    const seen: { url: string; init?: RequestInit }[] = [];
    const a = adapterCapturing(seen);
    await a.getEcheqs({
      accountId: "20-1-4636-2-5",
      status: "ACTIVE",
      mode: "RECEIVER",
      limit: 20,
      issuedFromDate: "2026-01-01",
    });
    const call = seen.find((c) => c.url.includes("/transaction-request-types/CHECK"))!;
    const h = call.init!.headers as Record<string, string>;
    expect(h["obp_status"]).toBe("ACTIVE");
    expect(h["obp_mode"]).toBe("RECEIVER");
    expect(h["obp_limit"]).toBe("20");
    expect(h["obp_issued_from_date"]).toBe("2026-01-01");
  });

  it("maps non-ok HTTP responses to structured api_error results", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse({ message: "boom" }, 500);
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    const r = await a.listAccounts();
    expect(r).toMatchObject({ ok: false, code: "api_error", status: 500 });
  });

  it("maps network failures to structured network_error results", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      throw new TypeError("fetch failed");
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    const r = await a.listAccounts();
    expect(r).toMatchObject({ ok: false, code: "network_error" });
  });

  it("respects a custom baseUrl and bankId", async () => {
    const seen: { url: string }[] = [];
    const fetchImpl = mockFetch((url) => {
      seen.push({ url });
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse([]);
    });
    const a = new HttpBindAdapter({
      username: "u",
      password: "p",
      baseUrl: "https://prod.example.bind/v1/",
      bankId: 198,
      fetchImpl,
    });
    await a.listAccounts();
    expect(seen[1]!.url).toBe("https://prod.example.bind/v1/banks/198/accounts/owner");
  });

  it("createTransfer returns ok:true with a validated transfer result", async () => {
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse({ id: "tr-42", status: "PENDING", transaction_ids: ["t1"] });
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    const r = await a.createTransfer("21-1-99999-4-6", {
      origin_id: "1",
      to: { cbu: "0".repeat(22) },
      value: { currency: "ARS", amount: 10 },
      concept: "VAR",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.id).toBe("tr-42");
  });

  it("fails loud (api_error, not fabricated success) on a malformed transfer body", async () => {
    // A 200 that isn't a real transfer result (no id/status) must NOT become
    // ok:true with blind-cast garbage — it becomes a structured error.
    const fetchImpl = mockFetch((url) => {
      if (url.endsWith("/login/jwt")) return jsonResponse(LOGIN_OK);
      return jsonResponse({ unexpected: "shape" });
    });
    const a = new HttpBindAdapter({ username: "u", password: "p", fetchImpl });
    const r = await a.createTransfer("21-1-99999-4-6", {
      origin_id: "1",
      to: { cbu: "0".repeat(22) },
      value: { currency: "ARS", amount: 10 },
      concept: "VAR",
    });
    expect(r).toMatchObject({ ok: false, code: "api_error" });
  });
});
