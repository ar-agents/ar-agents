/**
 * Unit tests for the /api/badge SVG-rendering primitives. Validates the
 * state-pick logic + SVG output across the four state classes (verified,
 * tampered, no-hmac, no entries).
 */

import { describe, expect, it } from "vitest";
import { buildSvg, escapeXml, stateFor, textWidth } from "../src/lib/badge";

describe("stateFor()", () => {
  it("returns no-hmac when hmacWired is false", () => {
    const s = stateFor({ total: 5, verified: 5, tampered: 0, hmacWired: false });
    expect(s).toEqual({ label: "audit", message: "no-hmac", color: "#666666" });
  });

  it("returns tampered when tampered count > 0 (takes precedence over verified)", () => {
    const s = stateFor({ total: 5, verified: 4, tampered: 1, hmacWired: true });
    expect(s.message).toBe("tampered · 1");
    expect(s.color).toBe("#ff5b4f");
  });

  it("pluralizes the message correctly via the count", () => {
    const single = stateFor({ total: 5, verified: 4, tampered: 1, hmacWired: true });
    const multi = stateFor({ total: 5, verified: 2, tampered: 3, hmacWired: true });
    expect(single.message).toBe("tampered · 1");
    expect(multi.message).toBe("tampered · 3");
  });

  it("returns no entries when total is 0 and hmac is wired", () => {
    const s = stateFor({ total: 0, verified: 0, tampered: 0, hmacWired: true });
    expect(s.message).toBe("no entries");
    expect(s.color).toBe("#999999");
  });

  it("returns verified · N/M when log is clean", () => {
    const s = stateFor({ total: 5, verified: 5, tampered: 0, hmacWired: true });
    expect(s.message).toBe("verified · 5/5");
    expect(s.color).toBe("#0a72ef"); // develop blue
  });
});

describe("escapeXml()", () => {
  it("escapes the five XML metacharacters", () => {
    expect(escapeXml("<>&\"'")).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
  it("leaves regular text alone", () => {
    expect(escapeXml("verified · 5/5")).toBe("verified · 5/5");
  });
  it("escapes & first to avoid double-encoding", () => {
    expect(escapeXml("a&lt;b")).toBe("a&amp;lt;b");
  });
});

describe("textWidth()", () => {
  it("returns 0 for empty string", () => {
    expect(textWidth("")).toBe(0);
  });
  it("scales monotonically with length", () => {
    const a = textWidth("a", 11);
    const aaaa = textWidth("aaaa", 11);
    expect(aaaa).toBeGreaterThan(a);
    // Math.ceil makes exact-multiple equality fragile; assert it's within
    // a 2-pixel band of the linear projection.
    expect(Math.abs(aaaa - a * 4)).toBeLessThanOrEqual(2);
  });
});

describe("buildSvg()", () => {
  it("renders a valid SVG with title + aria-label", () => {
    const svg = buildSvg({
      label: "audit",
      message: "verified · 5/5",
      color: "#0a72ef",
    });
    expect(svg).toMatch(/^<svg /);
    expect(svg).toContain('<title>audit: verified · 5/5</title>');
    expect(svg).toContain('aria-label="audit: verified · 5/5"');
    expect(svg).toContain("<rect");
    expect(svg).toContain("#0a72ef");
  });

  it("escapes XML metachars in label and message", () => {
    const svg = buildSvg({
      label: "<script>",
      message: "alert('x')",
      color: "#0a72ef",
    });
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain("alert('x')");
    expect(svg).toContain("alert(&#39;x&#39;)");
  });

  it("produces width that scales with message length (no hard-coded W)", () => {
    const short = buildSvg({ label: "a", message: "b", color: "#000" });
    const long = buildSvg({
      label: "audit",
      message: "verified · 9999/9999",
      color: "#000",
    });
    const matchShort = short.match(/width="(\d+)"/);
    const matchLong = long.match(/width="(\d+)"/);
    expect(matchShort).toBeTruthy();
    expect(matchLong).toBeTruthy();
    const wShort = Number(matchShort![1]);
    const wLong = Number(matchLong![1]);
    expect(wLong).toBeGreaterThan(wShort);
  });
});

describe("integration: stateFor → buildSvg", () => {
  const cases = [
    { input: { total: 5, verified: 5, tampered: 0, hmacWired: true }, contains: "verified · 5/5" },
    { input: { total: 5, verified: 4, tampered: 1, hmacWired: true }, contains: "tampered · 1" },
    { input: { total: 0, verified: 0, tampered: 0, hmacWired: true }, contains: "no entries" },
    { input: { total: 5, verified: 5, tampered: 0, hmacWired: false }, contains: "no-hmac" },
  ];
  for (const c of cases) {
    it(`produces SVG containing "${c.contains}"`, () => {
      const svg = buildSvg(stateFor(c.input));
      expect(svg).toContain(c.contains);
    });
  }
});
