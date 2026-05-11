/**
 * Recipe 30 — Submit your sociedad-IA to the public /registro.
 *
 * # Pattern
 *
 * Once your sociedad-IA is deployed + scoring >= 60 on the public
 * certifier (rating C or better), you can list it in the public
 * registry at /registro. Recipe 30 is the pre-flight check + the
 * PR-body generator.
 *
 * The flow:
 *
 *   1. Run recipe 28 (operator readiness) against your URL.
 *   2. Run recipe 26 (RFC certifier) against your URL.
 *   3. If both pass, recipe 30 produces a single Markdown block you
 *      paste into a GitHub PR titled
 *      "[/registro] Add <your-sociedad-name>".
 *
 *   4. The PR review checks (manually):
 *      - The URL resolves
 *      - /.well-known/agents.json is valid
 *      - The disclosure is honest (e.g. claims "demo" not "productive"
 *        if the sociedad doesn't actually transact)
 *      - operatorCuit matches the entityId in the manifest
 *
 *   5. Merge → live in /registro within ~1 hour (next build).
 *
 * # When to use
 *
 *   - First-time: after your sociedad-IA is deployed + you want
 *     public visibility.
 *   - Update: same flow, just amend the existing entry by name.
 *
 * # No silent failures
 *
 * Recipe 30 refuses to produce a PR body if the readiness or certifier
 * checks fail. Returns a remediation report instead. This prevents
 * over-eager submission of half-built sociedades.
 */

import { certifySociedad } from "./26-certify-by-fetch";
import { checkOperatorReadiness } from "./28-operator-onboarding-checklist";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SubmissionInput {
  /** Display name for the registry. */
  name: string;
  /** Type: "demo", "productive-sociedad-ia", "library-only". */
  type: "demo" | "productive-sociedad-ia" | "library-only";
  /** Operator's CUIT (no formatting). */
  operatorCuit: string;
  /** Operator's full name (legal). */
  operatorName: string;
  /** Public URL of the deployed sociedad. */
  publicUrl: string;
  /** RFC versions claimed. */
  rfcConformance: string[];
  /** Plain-English honest disclosure (1-3 sentences). */
  disclosure: string;
}

export interface SubmissionResult {
  ok: boolean;
  url: string;
  certScore?: number;
  certRating?: string;
  readiness?: "ready" | "almost" | "blocked" | "not-deployed";
  failures: string[];
  prBody?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Submission pipeline
// ─────────────────────────────────────────────────────────────────────────────

const MINIMUM_CERT_SCORE = 60;

export async function buildRegistrySubmission(
  input: SubmissionInput,
  options: { apiBaseUrl?: string; fetchImpl?: typeof fetch } = {},
): Promise<SubmissionResult> {
  const failures: string[] = [];

  // 1. Operator readiness (recipe 28).
  const readiness = await checkOperatorReadiness(input.publicUrl, {
    fetchImpl: options.fetchImpl,
  });
  if (readiness.readiness === "blocked") {
    failures.push(
      `Operator readiness is "blocked" (${readiness.passedCount}/${readiness.totalCount} items passing). Fix the blocking items before submitting.`,
    );
  }

  // 2. RFC certifier (recipe 26).
  const cert = await certifySociedad(input.publicUrl, {
    fetchImpl: options.fetchImpl,
  });
  if (cert.score < MINIMUM_CERT_SCORE) {
    failures.push(
      `Certifier score ${cert.score}/${cert.rating} is below the minimum ${MINIMUM_CERT_SCORE} required for /registro listing.`,
    );
  }

  // 3. Honesty heuristics.
  if (
    input.type === "productive-sociedad-ia" &&
    !input.disclosure.toLowerCase().includes("real")
  ) {
    failures.push(
      `Type is "productive-sociedad-ia" but disclosure doesn't mention "real". Be specific about what real-world transactions the sociedad performs (factura emission, MP cobros, etc.).`,
    );
  }
  if (
    input.type === "demo" &&
    !input.disclosure.toLowerCase().includes("not a productive") &&
    !input.disclosure.toLowerCase().includes("demo")
  ) {
    failures.push(
      `Type is "demo" but disclosure doesn't say "demo" or "not a productive sociedad-IA". Be explicit so a reader doesn't confuse it with a real one.`,
    );
  }
  if (!input.operatorCuit.match(/^\d{2}-\d{8}-\d$/)) {
    failures.push(
      `operatorCuit "${input.operatorCuit}" doesn't match CUIT format XX-XXXXXXXX-X.`,
    );
  }

  // 4. If everything passes, generate the PR body.
  let prBody: string | undefined;
  if (failures.length === 0) {
    prBody = generatePrBody(input, cert.score, cert.rating, readiness.readiness);
  }

  return {
    ok: failures.length === 0,
    url: input.publicUrl,
    certScore: cert.score,
    certRating: cert.rating,
    readiness: readiness.readiness,
    failures,
    prBody,
  };
}

function generatePrBody(
  input: SubmissionInput,
  certScore: number,
  certRating: string,
  readiness: string,
): string {
  return `## [/registro] Add \`${input.name}\`

### What this PR does

Adds the following entry to the public /registro of known sociedad-IA
implementations:

\`\`\`ts
{
  name: "${input.name}",
  type: "${input.type}",
  jurisdiction: "AR",
  operator: "${input.operatorName}",
  operatorCuit: "${input.operatorCuit}",
  publicUrl: "${input.publicUrl}",
  rfcConformance: [${input.rfcConformance.map((r) => `"${r}"`).join(", ")}],
  disclosure: "${input.disclosure.replace(/"/g, '\\"')}",
  status: "live",
  listedSince: "${new Date().toISOString().slice(0, 10)}",
}
\`\`\`

### Pre-submission checks

- ✅ **Operator readiness** (recipe 28): \`${readiness}\`
- ✅ **RFC conformance** (recipe 26): score **${certScore}/100** rating **${certRating}**
- ✅ **CUIT format**: \`${input.operatorCuit}\` matches XX-XXXXXXXX-X
- ✅ **Disclosure honesty**: type=\`${input.type}\` aligns with disclosure text

### What I'm claiming

I attest that I am the legitimate operator of this sociedad-IA. The
\`operatorCuit\` corresponds to a real CUIT under my control. The
\`/.well-known/agents.json\` at the public URL declares this entity.
I will keep the deployed endpoints live for at least 90 days from
merge; if I take the sociedad-IA down, I will open a follow-up PR
removing the entry.

### Verifier instructions for the maintainer

1. \`curl https://ar-agents.vercel.app/api/certifier?url=${input.publicUrl}\`
   — expect score >= 60.
2. \`curl ${input.publicUrl}/.well-known/agents.json\` — expect issuer.operatorCuit to match \`${input.operatorCuit}\`.
3. Verify disclosure honesty by eye.
4. Merge.
`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI: tsx 30-submit-to-registry.ts <config.json>
// ─────────────────────────────────────────────────────────────────────────────

declare const process: { argv: string[] } | undefined;

async function main() {
  if (typeof process === "undefined") return;
  const configPath = process.argv[2];
  if (!configPath) {
    console.error("usage: tsx 30-submit-to-registry.ts <config.json>");
    console.error("");
    console.error("config.json shape:");
    console.error(JSON.stringify(
      {
        name: "My Sociedad-IA",
        type: "demo",
        operatorCuit: "20-12345678-9",
        operatorName: "Jane Doe",
        publicUrl: "https://my-sociedad.vercel.app",
        rfcConformance: ["rfc-001-v1", "rfc-002-v1"],
        disclosure: "Single-library demo. Not a productive sociedad-IA.",
      },
      null,
      2,
    ));
    return;
  }
  const fs = await import("node:fs/promises");
  const cfg = JSON.parse(await fs.readFile(configPath, "utf8")) as SubmissionInput;

  const result = await buildRegistrySubmission(cfg);

  if (result.ok) {
    console.log("--- PR body (copy-paste into your registry PR) ---\n");
    console.log(result.prBody);
  } else {
    console.error("--- Submission blocked: failures need remediation ---\n");
    for (const f of result.failures) console.error(`  ✗ ${f}`);
    console.error("\n  Cert score:", result.certScore, result.certRating);
    console.error("  Operator readiness:", result.readiness);
    if (typeof process !== "undefined" && "exit" in process) {
      (process as unknown as { exit: (code: number) => void }).exit(1);
    }
  }
}

const isMain = typeof require !== "undefined" && require.main === module;
if (isMain) {
  main().catch((e) => {
    console.error(e);
    if (typeof process !== "undefined" && "exit" in process) {
      (process as unknown as { exit: (code: number) => void }).exit(1);
    }
  });
}
