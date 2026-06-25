import { describe, expect, it } from "vitest";
import { GET as getJson } from "../src/app/api/openapi/route";
import { GET as getYaml } from "../src/app/api/openapi.yaml/route";
import { openApiSpec } from "../src/lib/openapi-spec";

describe("OpenAPI routes share one spec (no SSRF round trip — DeepSec MEDIUM)", () => {
  it("/api/openapi serves the shared spec object as JSON", async () => {
    const res = await getJson();
    const body = (await res.json()) as { openapi: string; info: { title: string } };
    expect(body.openapi).toBe("3.1.0");
    expect(body.info.title).toBe(openApiSpec.info.title);
  });

  it("/api/openapi.yaml serializes the SAME spec in-process (takes no Request)", async () => {
    // The handler takes no args — it can't derive a fetch origin from the
    // request URL anymore, so the Host-header SSRF vector is gone.
    expect(getYaml.length).toBe(0);
    const res = await getYaml();
    const text = await res.text();
    expect(res.headers.get("content-type")).toMatch(/yaml/);
    expect(text).toMatch(/^openapi: "?3\.1\.0"?/m);
    expect(text).toContain(openApiSpec.info.title);
  });
});
