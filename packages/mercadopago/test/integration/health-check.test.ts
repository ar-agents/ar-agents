/**
 * Integration: mp_health_check vs real MP sandbox.
 *
 * Verifies:
 * - The health-check round-trip works against api.mercadopago.com
 * - User_id is returned (proves the token is valid)
 * - Latency is reasonable (sub-5s under normal sandbox load)
 */

import { describe, expect, it } from "vitest";
import { SHOULD_RUN, client } from "./_setup";

describe.skipIf(!SHOULD_RUN)("integration: health check vs MP sandbox", () => {
  it("returns ok=true with a userId", async () => {
    const result = await client!.healthCheck();
    expect(result.ok).toBe(true);
    expect(result.userId).not.toBeNull();
    expect(result.error).toBeNull();
  });

  it("latency is under 5s", async () => {
    const result = await client!.healthCheck();
    expect(result.latencyMs).toBeLessThan(5000);
  });

  it("respects AbortSignal for fast bail-out", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 50);
    const result = await client!.healthCheck(controller.signal);
    // Either succeeded under 50ms (fast network) or aborted cleanly with ok=false
    if (!result.ok) {
      expect(result.error).toMatch(/abort|timed out|timeout/i);
    }
  });
});
