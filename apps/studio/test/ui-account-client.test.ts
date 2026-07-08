import { describe, expect, it, vi } from "vitest";
import {
  AccountBootstrapError,
  clearStoredAccount,
  ensureAccount,
  readStoredAccount,
  writeStoredAccount,
  type MinimalStorage,
} from "../src/lib/ui/account-client";

function createMockStorage(initial: Record<string, string> = {}): MinimalStorage {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("readStoredAccount / writeStoredAccount / clearStoredAccount", () => {
  it("round-trips a valid account", () => {
    const storage = createMockStorage();
    writeStoredAccount(storage, { accountId: "acc_1", token: "stu_abc" });
    expect(readStoredAccount(storage)).toEqual({ accountId: "acc_1", token: "stu_abc" });
  });

  it("returns null when nothing is stored", () => {
    expect(readStoredAccount(createMockStorage())).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    const storage = createMockStorage({ "studio.account.v1": "{not json" });
    expect(readStoredAccount(storage)).toBeNull();
  });

  it("returns null when the shape is wrong", () => {
    const storage = createMockStorage({
      "studio.account.v1": JSON.stringify({ accountId: 5, token: "stu_abc" }),
    });
    expect(readStoredAccount(storage)).toBeNull();
  });

  it("returns null when the storage backend throws", () => {
    const storage: MinimalStorage = {
      getItem: () => {
        throw new Error("disabled");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(readStoredAccount(storage)).toBeNull();
  });

  it("clears a stored account", () => {
    const storage = createMockStorage();
    writeStoredAccount(storage, { accountId: "acc_1", token: "stu_abc" });
    clearStoredAccount(storage);
    expect(readStoredAccount(storage)).toBeNull();
  });
});

describe("ensureAccount", () => {
  it("returns the stored account without calling fetch", async () => {
    const storage = createMockStorage();
    writeStoredAccount(storage, { accountId: "acc_1", token: "stu_abc" });
    const fetchImpl = vi.fn();

    const account = await ensureAccount({ storage, fetchImpl });

    expect(account).toEqual({ accountId: "acc_1", token: "stu_abc" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("bootstraps via POST /api/account and stores the result when nothing is stored", async () => {
    const storage = createMockStorage();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input).toBe("/api/account");
      expect(init?.method).toBe("POST");
      return jsonResponse(201, { ok: true, accountId: "acc_2", token: "stu_xyz" });
    });

    const account = await ensureAccount({ storage, fetchImpl });

    expect(account).toEqual({ accountId: "acc_2", token: "stu_xyz" });
    expect(readStoredAccount(storage)).toEqual({ accountId: "acc_2", token: "stu_xyz" });
  });

  it("throws AccountBootstrapError on a non-2xx response", async () => {
    const storage = createMockStorage();
    const fetchImpl = vi.fn(async () => jsonResponse(429, { ok: false, error: "rate_limited" }));

    await expect(ensureAccount({ storage, fetchImpl })).rejects.toBeInstanceOf(
      AccountBootstrapError,
    );
    expect(readStoredAccount(storage)).toBeNull();
  });

  it("throws AccountBootstrapError when the response body is malformed", async () => {
    const storage = createMockStorage();
    const fetchImpl = vi.fn(async () => jsonResponse(201, { ok: true }));

    await expect(ensureAccount({ storage, fetchImpl })).rejects.toBeInstanceOf(
      AccountBootstrapError,
    );
  });
});
