import { describe, expect, it, vi } from "vitest";
import { AccountClientError, createAccount, getAccount } from "../src/account-client";

function fakeResponse(status: number, body: unknown, ok = status >= 200 && status < 300) {
  return { ok, status, json: async () => body } as unknown as Response;
}

describe("createAccount", () => {
  it("returns accountId + token on a 201", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(201, { ok: true, accountId: "acc_1", token: "stu_acc_1_secret" }),
    );
    const result = await createAccount({ baseUrl: "https://studio.example", fetchImpl });
    expect(result).toEqual({ accountId: "acc_1", token: "stu_acc_1_secret" });
    expect(fetchImpl).toHaveBeenCalledWith("https://studio.example/api/account", { method: "POST" });
  });

  it("trims a trailing slash from baseUrl", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      fakeResponse(201, { ok: true, accountId: "acc_1", token: "stu_acc_1_secret" }),
    );
    await createAccount({ baseUrl: "https://studio.example/", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://studio.example/api/account", { method: "POST" });
  });

  it("throws AccountClientError on a 500", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(500, { ok: false, error: "boom" }));
    await expect(createAccount({ baseUrl: "https://studio.example", fetchImpl })).rejects.toBeInstanceOf(
      AccountClientError,
    );
  });

  it("throws AccountClientError on an ok-but-malformed body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(201, { ok: true }));
    await expect(createAccount({ baseUrl: "https://studio.example", fetchImpl })).rejects.toBeInstanceOf(
      AccountClientError,
    );
  });
});

describe("getAccount", () => {
  const profileBody = {
    ok: true,
    accountId: "acc_1",
    createdAt: "2026-01-01T00:00:00.000Z",
    usage: { month: "2026-07", inputTokens: 10, outputTokens: 20, costMicroUsd: 1234, priceMicroUsd: 5 },
    cap: { monthlyCostMicroUsd: 1000000, remainingMicroUsd: 998766 },
    society: { denominacion: "ACME SAS", suspended: false },
  };

  it("sends the x-studio-token header", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, profileBody));
    await getAccount({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith("https://studio.example/api/account", {
      method: "GET",
      headers: { "x-studio-token": "stu_abc" },
    });
  });

  it("returns the mapped profile on 200", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, profileBody));
    const profile = await getAccount({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });
    expect(profile).toEqual({
      accountId: "acc_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      usage: { month: "2026-07", inputTokens: 10, outputTokens: 20, costMicroUsd: 1234, priceMicroUsd: 5 },
      cap: { monthlyCostMicroUsd: 1000000, remainingMicroUsd: 998766 },
      society: { denominacion: "ACME SAS", suspended: false },
    });
  });

  it("maps a null society through", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ...profileBody, society: null }));
    const profile = await getAccount({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl });
    expect(profile.society).toBeNull();
  });

  it("throws with status 401 on an unauthorized mock", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(fakeResponse(401, { ok: false, error: "no_autorizado" }));
    await expect(
      getAccount({ baseUrl: "https://studio.example", token: "bad-token", fetchImpl }),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("throws AccountClientError on an ok-but-malformed body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true }));
    await expect(
      getAccount({ baseUrl: "https://studio.example", token: "stu_abc", fetchImpl }),
    ).rejects.toBeInstanceOf(AccountClientError);
  });
});
