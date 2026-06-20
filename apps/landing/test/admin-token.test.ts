import { beforeEach, describe, expect, it } from "vitest";
import { hasAdminToken, mintAdminToken, verifyAdminToken } from "../src/lib/admin-token";

beforeEach(() => {
  delete process.env.KV_REST_API_URL; // exercise the in-memory store
  delete process.env.KV_REST_API_TOKEN;
});

describe("admin capability token", () => {
  it("mints once, verifies the real token (constant-time), rejects wrong/empty", async () => {
    const token = await mintAdminToken("tok-1");
    expect(token).toMatch(/^sat_[0-9a-f]+$/);
    expect(await verifyAdminToken("tok-1", token!)).toBe(true);
    expect(await verifyAdminToken("tok-1", "sat_wrong_guess")).toBe(false);
    expect(await verifyAdminToken("tok-1", "")).toBe(false);
  });

  it("is WRITE-ONCE: a second mint returns null (no rotation/steal)", async () => {
    const a = await mintAdminToken("tok-2");
    const b = await mintAdminToken("tok-2");
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    expect(await verifyAdminToken("tok-2", a!)).toBe(true); // original still valid
  });

  it("a society with no token verifies false (and hasAdminToken false)", async () => {
    expect(await verifyAdminToken("no-token-soc", "sat_anything")).toBe(false);
    expect(await hasAdminToken("no-token-soc")).toBe(false);
  });
});
