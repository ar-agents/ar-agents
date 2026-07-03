import { describe, expect, it } from "vitest";
import { classifyHost, isSeedSource } from "../src/lib/constancia-metrics";

describe("classifyHost (the k-factor honesty rules)", () => {
  it("owned: ar-agents domains and deploy previews never count as acquisition", () => {
    expect(classifyHost("ar-agents.ar")).toBe("owned");
    expect(classifyHost("www.ar-agents.ar")).toBe("owned");
    expect(classifyHost("ar-agents-abc123-nazas-projects.vercel.app")).toBe("owned");
    expect(classifyHost("localhost")).toBe("owned");
  });

  it("proxy: GitHub camo hides the embedder, reported separately", () => {
    expect(classifyHost("camo.githubusercontent.com")).toBe("proxy");
  });

  it("synthetic: known test hits are discounted", () => {
    expect(classifyHost("example.com")).toBe("synthetic");
  });

  it("external: everything else is the only bucket that counts toward k", () => {
    expect(classifyHost("miempresa.com.ar")).toBe("external");
    expect(classifyHost("news.ycombinator.com")).toBe("external");
  });

  it("is case-insensitive", () => {
    expect(classifyHost("AR-AGENTS.AR")).toBe("owned");
    expect(classifyHost("Example.COM")).toBe("synthetic");
  });
});

describe("isSeedSource (seeds can never inflate the organic number)", () => {
  it("flags seed-* utm sources", () => {
    expect(isSeedSource("seed-gh-readme")).toBe(true);
    expect(isSeedSource("SEED-npm")).toBe(true);
  });
  it("leaves organic channels alone", () => {
    expect(isSeedSource("twitter")).toBe(false);
    expect(isSeedSource("newsletter")).toBe(false);
    expect(isSeedSource("")).toBe(false);
  });
});
