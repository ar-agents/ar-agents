import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A faithful in-memory @vercel/kv mock (SET NX returns "OK"/null; GET), same
// shape as apps/landing/test/*.test.ts's mocks.
const { store } = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, v);
      return "OK";
    },
    get: async (k: string) => store.get(k) ?? null,
  },
}));

import {
  authenticate,
  createAccount,
  getAccountProfile,
  getStoredSociety,
  setStoredSociety,
  verifyAccountToken,
  type StoredSociety,
} from "../src/lib/account";

beforeEach(() => {
  store.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
});
afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  vi.restoreAllMocks();
});

describe("createAccount / verifyAccountToken", () => {
  it("mints an accountId (uuid) + a token that verifies back to it", async () => {
    const created = await createAccount();
    expect(created).not.toBeNull();
    const { accountId, token } = created!;
    expect(accountId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(token.startsWith("stu_")).toBe(true);
    expect(token).toContain(accountId);

    const verified = await verifyAccountToken(token);
    expect(verified).toBe(accountId);
  });

  it("stores only the hash, never the plaintext token", async () => {
    const created = await createAccount();
    const stored = store.get(`studio:accounttoken:${created!.accountId}`);
    expect(stored).not.toBe(created!.token);
    expect(typeof stored).toBe("string");
    expect((stored as string).length).toBe(64); // sha256 hex
  });

  it("also writes the account profile with a createdAt timestamp", async () => {
    const created = await createAccount();
    const profile = await getAccountProfile(created!.accountId);
    expect(profile?.accountId).toBe(created!.accountId);
    expect(new Date(profile!.createdAt).toString()).not.toBe("Invalid Date");
  });

  it("rejects a tampered token (wrong secret half) for a real accountId", async () => {
    const created = await createAccount();
    const tampered = `stu_${created!.accountId}_${"0".repeat(64)}`;
    expect(await verifyAccountToken(tampered)).toBeNull();
  });

  it("rejects a well-formed token for an accountId that was never minted", async () => {
    const fakeId = "00000000-0000-4000-8000-000000000000";
    expect(await verifyAccountToken(`stu_${fakeId}_${"a".repeat(64)}`)).toBeNull();
  });

  it("rejects garbage input (empty, too short, no prefix)", async () => {
    expect(await verifyAccountToken("")).toBeNull();
    expect(await verifyAccountToken("short")).toBeNull();
    expect(await verifyAccountToken("nope_not-a-token-at-all-000000000000")).toBeNull();
  });

  it("write-once: a second mint for the SAME accountId is refused (null)", async () => {
    const FIXED_ID = "11111111-1111-4111-8111-111111111111";
    const uuidSpy = vi.spyOn(globalThis.crypto, "randomUUID");

    uuidSpy
      .mockReturnValueOnce(FIXED_ID as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as `${string}-${string}-${string}-${string}-${string}`);
    const first = await createAccount();
    expect(first).not.toBeNull();

    uuidSpy
      .mockReturnValueOnce(FIXED_ID as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("cccccccc-cccc-4ccc-8ccc-cccccccccccc" as `${string}-${string}-${string}-${string}-${string}`)
      .mockReturnValueOnce("dddddddd-dddd-4ddd-8ddd-dddddddddddd" as `${string}-${string}-${string}-${string}-${string}`);
    const second = await createAccount();
    expect(second).toBeNull(); // write-once: the accountId's token hash already exists
  });
});

describe("authenticate(req)", () => {
  it("resolves the accountId from a valid x-studio-token header", async () => {
    const created = await createAccount();
    const req = new Request("https://x/", { headers: { "x-studio-token": created!.token } });
    const auth = await authenticate(req);
    expect(auth).toEqual({ ok: true, accountId: created!.accountId });
  });

  it("401s with no header", async () => {
    const req = new Request("https://x/");
    const auth = await authenticate(req);
    expect(auth).toEqual({ ok: false, status: 401, error: "no_autorizado" });
  });

  it("401s with a garbage header", async () => {
    const req = new Request("https://x/", { headers: { "x-studio-token": "garbage" } });
    const auth = await authenticate(req);
    expect(auth.ok).toBe(false);
  });
});

describe("account -> society mapping", () => {
  it("round-trips a stored society", async () => {
    const created = await createAccount();
    expect(await getStoredSociety(created!.accountId)).toBeNull();

    const society: StoredSociety = {
      sessionId: "sess-1",
      denominacion: "Kiosco Automatizado SAS",
      tipo: "SAS",
      registryId: "reg-1",
      adminToken: "sat_abc",
      gateToken: "sgt_def",
      createdAt: new Date().toISOString(),
    };
    await setStoredSociety(created!.accountId, society);
    expect(await getStoredSociety(created!.accountId)).toEqual(society);
  });

  it("isolates societies per account", async () => {
    const a = await createAccount();
    const b = await createAccount();
    await setStoredSociety(a!.accountId, {
      sessionId: "sess-a",
      denominacion: "A SAS",
      tipo: "SAS",
      registryId: null,
      adminToken: "sat_a",
      gateToken: "sgt_a",
      createdAt: new Date().toISOString(),
    });
    expect(await getStoredSociety(b!.accountId)).toBeNull();
    expect((await getStoredSociety(a!.accountId))?.sessionId).toBe("sess-a");
  });
});
