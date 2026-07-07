import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Redirect-SSRF on webhook DELIVERY: a registered (public, SSRF-guarded) URL
 * can still 3xx-redirect the signed delivery. The delivery must go through
 * safeFetch, which follows redirects MANUALLY and re-validates every hop, so a
 * subscriber can never bounce the POST to loopback / RFC1918 / cloud metadata.
 */

import {
  registerWebhook,
  fireWebhooks,
  __resetWebhooksForTests,
} from "../src/lib/oracle-webhooks";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let fetchSpy: any;

beforeEach(() => {
  __resetWebhooksForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.AUDIT_ED25519_PRIVATE_KEY;
  delete process.env.AUDIT_ED25519_PUBLIC_KEY;
});

afterEach(() => {
  fetchSpy?.mockRestore();
});

function requestedUrls(): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return fetchSpy.mock.calls.map((c: any[]) => String(c[0]));
}

describe("fireWebhooks redirect handling (SSRF)", () => {
  it("ATTACK CLOSED: a subscriber redirecting to the cloud metadata IP is never followed", async () => {
    await registerWebhook("c1", "https://hooks.example.com/redir", "e1");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );
    await fireWebhooks({ entityId: "e1", kind: "good-standing", to: "revoked" });
    // Exactly one request went out (the public first hop); the private hop was refused.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrls()[0]).toContain("hooks.example.com/redir");
    expect(requestedUrls().some((u) => u.includes("169.254.169.254"))).toBe(false);
  });

  it("ATTACK CLOSED: a redirect to loopback (relative-resolved Location) is refused too", async () => {
    await registerWebhook("c1", "https://hooks.example.com/redir2", "e1");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(null, {
          status: 307,
          headers: { location: "http://localhost:3000/internal" },
        }),
    );
    await fireWebhooks({ entityId: "e1", kind: "status", to: "deprecated" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(requestedUrls().some((u) => u.includes("localhost"))).toBe(false);
  });

  it("delivery uses manual redirect mode (the platform fetch never auto-follows)", async () => {
    await registerWebhook("c1", "https://hooks.example.com/mode", "e1");
    fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}", { status: 200 }));
    await fireWebhooks({ entityId: "e1", kind: "status", to: "live" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.redirect).toBe("manual");
    expect(init.method).toBe("POST");
    // The signed payload still travels in the body.
    const body = JSON.parse(String(init.body)) as { body: { entityId: string } };
    expect(body.body.entityId).toBe("e1");
  });

  it("a public-to-public redirect is followed and re-delivers the same payload", async () => {
    await registerWebhook("c1", "https://hooks.example.com/moved", "e1");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const u = String(input);
      if (u.includes("hooks.example.com/moved")) {
        return new Response(null, {
          status: 308,
          headers: { location: "https://hooks-v2.example.com/ingest" },
        });
      }
      return new Response("{}", { status: 200 });
    });
    await fireWebhooks({ entityId: "e1", kind: "status", to: "live" });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(requestedUrls()[1]).toContain("hooks-v2.example.com/ingest");
    const first = JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
    const second = JSON.parse(String((fetchSpy.mock.calls[1][1] as RequestInit).body));
    expect(second).toEqual(first);
  });

  it("a redirect-refused delivery stays best-effort (never throws into the caller)", async () => {
    await registerWebhook("c1", "https://hooks.example.com/boom", "e1");
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://[::ffff:127.0.0.1]/" },
        }),
    );
    await expect(
      fireWebhooks({ entityId: "e1", kind: "good-standing", to: "suspended" }),
    ).resolves.toBeUndefined();
    expect(requestedUrls().some((u) => u.includes("127.0.0.1"))).toBe(false);
  });
});
