import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { GET as discoveryGet } from "../src/app/api/discovery/route";
import { openApiSpec } from "../src/lib/openapi-spec";

/**
 * AGENT DISCOVERY guard. The "judged" leg (the public good-standing oracle) plus
 * formation and the rails must be discoverable, in loop order, from every machine
 * index so an agent can be born, operate, and be judged with zero human steps.
 * This locks that the oracle/registry are advertised in agents.json, /api/discovery
 * (JSON + OpenAPI), the shared OpenAPI spec, and the hosted MCP server.
 */

const ROOT = join(import.meta.dirname, "..");

function read(p: string): string {
  return readFileSync(join(ROOT, p), "utf8");
}

const ORACLE_PATH = "/api/registry/good-standing";
const FORM_PATH = "/api/auto-incorporate";

describe("agents.json advertises the born/operate/judged loop", () => {
  const agents = JSON.parse(read("public/.well-known/agents.json")) as Record<
    string,
    unknown
  >;

  it("exposes a loop array with born, operate, judged legs", () => {
    const loop = agents.loop as Array<{ leg: string }> | undefined;
    expect(Array.isArray(loop)).toBe(true);
    const legs = (loop ?? []).map((l) => l.leg);
    expect(legs).toEqual(["born", "operate", "judged"]);
  });

  it("points discovery at the registry + good-standing oracle", () => {
    const discovery = agents.discovery as Record<string, string>;
    expect(discovery.registry).toContain("/api/registry");
    expect(discovery.goodStandingOracle).toContain(ORACLE_PATH);
  });

  it("carries a registry block with the oracle + schema", () => {
    const registry = agents.registry as Record<string, string>;
    expect(registry.oracleEndpoint).toContain(ORACLE_PATH);
    expect(registry.schema).toContain("good-standing.v1.json");
  });

  it("lists the oracle + formation among endpoints", () => {
    const endpoints = agents.endpoints as Array<{ url: string }>;
    const urls = endpoints.map((e) => e.url);
    expect(urls.some((u) => u.includes(ORACLE_PATH))).toBe(true);
    expect(urls.some((u) => u.includes(FORM_PATH))).toBe(true);
  });
});

describe("/api/discovery exposes the loop + oracle", () => {
  it("JSON has a loop object (born/operate/judged) and the oracle endpoint", async () => {
    const res = await discoveryGet(new Request("https://ar-agents.ar/api/discovery"));
    const doc = (await res.json()) as {
      loop?: { born?: unknown; operate?: unknown; judged?: { endpoint?: string } };
      endpoints?: Array<{ url: string }>;
      packageCount?: number;
      totalTools?: number;
    };
    expect(doc.loop?.born).toBeDefined();
    expect(doc.loop?.operate).toBeDefined();
    expect(doc.loop?.judged?.endpoint).toContain(ORACLE_PATH);
    expect(doc.endpoints?.some((e) => e.url.includes(ORACLE_PATH))).toBe(true);
    // counts are derived from manifests (no hand-maintained drift)
    expect(typeof doc.packageCount).toBe("number");
    expect(doc.packageCount).toBeGreaterThan(0);
    expect(doc.totalTools).toBeGreaterThan(0);
  });

  it("OpenAPI form lists the oracle + registry paths", async () => {
    const res = await discoveryGet(
      new Request("https://ar-agents.ar/api/discovery?format=openapi"),
    );
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(doc.paths[ORACLE_PATH]).toBeDefined();
    expect(doc.paths["/api/registry"]).toBeDefined();
  });
});

describe("the shared /api/openapi spec lists the oracle", () => {
  it("has the good-standing + registry paths", () => {
    const paths = openApiSpec.paths as Record<string, unknown>;
    expect(paths[ORACLE_PATH]).toBeDefined();
    expect(paths["/api/registry"]).toBeDefined();
  });
});

describe("the hosted MCP server exposes the judged leg", () => {
  const mcp = read("src/app/api/[transport]/route.ts");

  it("registers get_good_standing + registry_lookup tools", () => {
    const names = [...mcp.matchAll(/registerTool\(\s*["']([a-z0-9_]+)["']/gi)].map(
      (m) => m[1],
    );
    expect(names).toContain("get_good_standing");
    expect(names).toContain("registry_lookup");
  });

  it("the good-standing tool fetches the public oracle endpoint", () => {
    expect(mcp.includes(ORACLE_PATH)).toBe(true);
  });
});
