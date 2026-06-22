import { beforeEach, describe, expect, it } from "vitest";
import { hasGateToken, mintGateToken, verifyGateToken } from "../src/lib/gate-token";
import { hasAdminToken, mintAdminToken, verifyAdminToken } from "../src/lib/admin-token";

beforeEach(() => {
  delete process.env.KV_REST_API_URL; // exercise the in-memory store
  delete process.env.KV_REST_API_TOKEN;
});

describe("gate capability token (#4-full)", () => {
  it("mints once, verifies the real token (constant-time), rejects wrong/empty", async () => {
    const token = await mintGateToken("gsoc-1");
    expect(token).toMatch(/^sgt_[0-9a-f]+$/);
    expect(await verifyGateToken("gsoc-1", token!)).toBe(true);
    expect(await verifyGateToken("gsoc-1", "sgt_wrong_guess")).toBe(false);
    expect(await verifyGateToken("gsoc-1", "")).toBe(false);
    expect(await hasGateToken("gsoc-1")).toBe(true);
  });

  it("is WRITE-ONCE: a second mint returns null (no rotation/steal)", async () => {
    const a = await mintGateToken("gsoc-2");
    const b = await mintGateToken("gsoc-2");
    expect(a).toBeTruthy();
    expect(b).toBeNull();
    expect(await verifyGateToken("gsoc-2", a!)).toBe(true); // original still valid
  });

  it("a society with no gate token verifies false (the legacy / unminted case)", async () => {
    expect(await verifyGateToken("no-gate-soc", "sgt_anything")).toBe(false);
    expect(await hasGateToken("no-gate-soc")).toBe(false);
  });

  it("admin and gate tokens are independent per session (no cross-kind collision)", async () => {
    const admin = await mintAdminToken("dual-soc");
    const gate = await mintGateToken("dual-soc");
    expect(admin).toMatch(/^sat_/);
    expect(gate).toMatch(/^sgt_/);
    // each verifies only against its own kind
    expect(await verifyAdminToken("dual-soc", admin!)).toBe(true);
    expect(await verifyGateToken("dual-soc", gate!)).toBe(true);
    expect(await verifyAdminToken("dual-soc", gate!)).toBe(false);
    expect(await verifyGateToken("dual-soc", admin!)).toBe(false);
    expect(await hasAdminToken("dual-soc")).toBe(true);
    expect(await hasGateToken("dual-soc")).toBe(true);
  });
});
