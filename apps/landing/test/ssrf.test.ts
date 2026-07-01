import { afterEach, describe, expect, it, vi } from "vitest";
import { isPrivateHost, safeExternalUrl, safeFetch } from "../src/lib/ssrf";

describe("ssrf · isPrivateHost", () => {
  it("blocks the IPv4-mapped / NAT64 IPv6 metadata+loopback bypass (the C1 hole)", () => {
    expect(isPrivateHost("::ffff:169.254.169.254")).toBe(true); // cloud metadata
    expect(isPrivateHost("[::ffff:169.254.169.254]")).toBe(true); // bracketed
    expect(isPrivateHost("::ffff:a9fe:a9fe")).toBe(true); // hex-compressed form new URL() normalizes to
    expect(isPrivateHost("::ffff:127.0.0.1")).toBe(true); // loopback
    expect(isPrivateHost("::ffff:10.0.0.5")).toBe(true); // RFC1918
    expect(isPrivateHost("64:ff9b::169.254.169.254")).toBe(true); // NAT64
  });

  it("blocks literal private / loopback / link-local / metadata hosts", () => {
    for (const h of [
      "localhost",
      "foo.local",
      "svc.internal",
      "metadata.google.internal",
      "169.254.169.254",
      "127.0.0.1",
      "10.0.0.5",
      "192.168.1.1",
      "172.16.0.1",
      "100.64.0.1",
      "::1",
    ]) {
      expect(isPrivateHost(h)).toBe(true);
    }
  });

  it("allows normal public hosts", () => {
    expect(isPrivateHost("example.com")).toBe(false);
    expect(isPrivateHost("8.8.8.8")).toBe(false);
    expect(isPrivateHost("ar-agents.ar")).toBe(false);
  });
});

describe("ssrf · safeExternalUrl", () => {
  it("refuses non-public host, odd port, and non-web protocol", () => {
    expect(safeExternalUrl("http://[::ffff:169.254.169.254]/latest/")).toBeNull();
    expect(safeExternalUrl("http://[::ffff:127.0.0.1]/")).toBeNull();
    expect(safeExternalUrl("http://localhost/")).toBeNull();
    expect(safeExternalUrl("http://169.254.169.254/latest/meta-data/")).toBeNull();
    expect(safeExternalUrl("ftp://example.com/")).toBeNull();
    expect(safeExternalUrl("file:///etc/passwd")).toBeNull();
    expect(safeExternalUrl("http://example.com:22/")).toBeNull();
    expect(safeExternalUrl("not a url")).toBeNull();
  });

  it("accepts a normal public URL and returns its origin", () => {
    expect(safeExternalUrl("https://example.com/x?y=1")?.origin).toBe("https://example.com");
  });
});

describe("ssrf · safeFetch (per-hop redirect re-validation)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("refuses when a redirect points at a private/metadata host (no blind auto-follow)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "http://169.254.169.254/latest/meta-data/" },
        }),
    );
    await expect(safeFetch("https://public.example.com/start")).rejects.toThrow(/SSRF guard/i);
  });

  it("refuses an initial URL that is not public", async () => {
    await expect(safeFetch("http://localhost:8080/")).rejects.toThrow(/SSRF guard/i);
  });

  it("returns a normal 200 response for a public URL", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("ok", { status: 200 }));
    const r = await safeFetch("https://public.example.com/x");
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("ok");
  });
});
