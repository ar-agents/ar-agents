import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * M2-2 (ROADMAP.md): docs/HOSTING.md documents the society-runtime hosting
 * story (own Vercel project per society vs hosted multi-tenant, and the two
 * deploy modes). This is a DRIFT GUARD, not a content review: it asserts
 * every function name, env var name, and constant the doc references still
 * exists in the source it describes, so the doc cannot silently go stale
 * when vercel-provision.ts or the deploy route change shape.
 */

function repoRoot(): string {
  // this file: apps/studio/test/hosting-doc.test.ts
  return join(__dirname, "..", "..", "..");
}

function readRepoFile(relPath: string): string {
  return readFileSync(join(repoRoot(), relPath), "utf8");
}

const doc = readRepoFile("docs/HOSTING.md");
const provisionSource = readRepoFile("apps/studio/src/lib/vercel-provision.ts");
const deployRouteSource = readRepoFile("apps/studio/src/app/api/society/deploy/route.ts");

describe("docs/HOSTING.md exists and is non-empty", () => {
  it("has content", () => {
    expect(doc.length).toBeGreaterThan(0);
  });
});

describe("HOSTING.md names real vercel-provision.ts exports", () => {
  const PROVISIONING_FUNCTIONS = [
    "provisionSocietyApp",
    "setSocietyCredentialEnvVars",
    "redeploySocietyApp",
    "triggerRedeploy",
    "getProjectProductionDomain",
    "getLatestDeployment",
    "projectSlugFor",
  ];

  for (const fn of PROVISIONING_FUNCTIONS) {
    it(`${fn} is documented in HOSTING.md and actually exported by vercel-provision.ts`, () => {
      expect(doc, `HOSTING.md should mention ${fn}`).toContain(fn);

      const exportPattern = new RegExp(`export (async )?function ${fn}\\b`);
      expect(
        exportPattern.test(provisionSource),
        `vercel-provision.ts should export a function named ${fn}`,
      ).toBe(true);
    });
  }
});

describe("HOSTING.md documents both deploy modes", () => {
  it('contains the mode string "provisioned"', () => {
    expect(doc).toContain("provisioned");
  });

  it('contains the mode string "manual"', () => {
    expect(doc).toContain("manual");
  });
});

describe("HOSTING.md lists real provisioned-mode env vars", () => {
  const PROVISIONED_ENV_VARS = [
    "SOCIETY_ID",
    "SOCIETY_GATE_TOKEN",
    "AR_AGENTS_API_BASE",
    "AGENT_API_KEY",
    "STUDIO_STATUS_TOKEN",
    "AUDIT_HMAC_SECRET",
    "SOCIEDAD_IA_DENOMINACION",
  ];

  for (const name of PROVISIONED_ENV_VARS) {
    it(`${name} is documented in HOSTING.md and appears in the deploy route source`, () => {
      expect(doc, `HOSTING.md should mention env var ${name}`).toContain(name);
      expect(
        deployRouteSource.includes(name),
        `deploy route source should reference env var ${name}`,
      ).toBe(true);
    });
  }
});

describe("HOSTING.md names the source constants", () => {
  it('documents ROOT_DIRECTORY value "apps/sociedad-ia-starter", present in vercel-provision.ts', () => {
    expect(doc).toContain("apps/sociedad-ia-starter");
    expect(provisionSource).toContain('"apps/sociedad-ia-starter"');
  });

  it("documents the capability-gate env VERCEL_PROVISION_TOKEN, present in vercel-provision.ts", () => {
    expect(doc).toContain("VERCEL_PROVISION_TOKEN");
    expect(provisionSource).toContain("VERCEL_PROVISION_TOKEN");
  });
});
