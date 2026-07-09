/**
 * `POST /api/society/deploy` (auth): deploys the account's constituted
 * society's own agent app (the apps/sociedad-ia-starter scaffold) from
 * studio, per ROADMAP.md's M1-6. Requires an already-constituted society
 * (404 otherwise). Rate limit 3/day/account.
 *
 * Always mints a fresh `AGENT_API_KEY` (32 random bytes, hex) for this
 * deploy and returns it exactly once in the response, same self-custody
 * shape as the constitute route's adminToken/gateToken -- studio never
 * stores it, since in "provisioned" mode it is set directly as an
 * encrypted Vercel project env var, and in "manual" mode the human pastes
 * it in themselves.
 *
 * Two modes, decided by whether `VERCEL_PROVISION_TOKEN` is configured (see
 * src/lib/vercel-provision.ts):
 *  - "manual" (no token): responds with a one-click Vercel deploy URL and an
 *    `.env` file the human pastes into that project's Environment Variables.
 *    Studio never learns whether this happened, so nothing is persisted.
 *  - "provisioned" (token set): actually creates the Vercel project, sets
 *    its env vars, and triggers the first deployment; the result is
 *    persisted against the stored society so `GET /api/society` reflects it.
 *
 * See docs/CONTRACT.md.
 */

import { authenticate, getStoredSociety, setSocietyDeploy } from "@/lib/account";
import { kvRateLimit } from "@/lib/ratelimit";
import { projectSlugFor, provisionSocietyApp } from "@/lib/vercel-provision";

export const runtime = "nodejs";

const AR_AGENTS_API_BASE = "https://ar-agents.ar";
const STARTER_REPO_PATH = "https://github.com/ar-agents/ar-agents/tree/main/apps/sociedad-ia-starter";

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function buildEnvFile(vars: Record<string, string>): string {
  return `${Object.entries(vars)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n")}\n`;
}

function buildOneClickUrl(slug: string): string {
  const params = new URLSearchParams({
    "repository-url": STARTER_REPO_PATH,
    "project-name": slug,
    env: "SOCIETY_ID,SOCIETY_GATE_TOKEN,AR_AGENTS_API_BASE,AGENT_API_KEY",
    envDescription:
      "Pegá acá los valores del archivo de abajo. AGENT_API_KEY se generó una sola vez: guardalo, no se puede volver a ver.",
  });
  return `https://vercel.com/new/clone?${params.toString()}`;
}

export async function POST(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Durable-write path (provisioned mode actually creates a Vercel project):
  // fail CLOSED if the durable cross-isolate quota is down.
  if (!(await kvRateLimit("society-deploy", auth.accountId, 3, 24 * 60 * 60, { failClosed: true }))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  const agentApiKey = randomHex(32);
  const societyId = society.registryId ?? society.sessionId;

  const result = await provisionSocietyApp({
    name: societyId,
    envVars: [
      { name: "SOCIETY_ID", value: society.sessionId },
      { name: "SOCIETY_GATE_TOKEN", value: society.gateToken },
      { name: "AR_AGENTS_API_BASE", value: AR_AGENTS_API_BASE },
      { name: "AGENT_API_KEY", value: agentApiKey },
    ],
  });

  if (result === null) {
    // No VERCEL_PROVISION_TOKEN configured: manual one-click path.
    const slug = projectSlugFor(societyId);
    return Response.json({
      ok: true,
      mode: "manual",
      oneClickUrl: buildOneClickUrl(slug),
      envFile: buildEnvFile({
        SOCIETY_ID: society.sessionId,
        SOCIETY_GATE_TOKEN: society.gateToken,
        AR_AGENTS_API_BASE,
        AGENT_API_KEY: agentApiKey,
      }),
      agentApiKey,
    });
  }

  if (!result.ok) {
    return Response.json({ ok: false, error: "deploy_failed", detail: result.error }, { status: 502 });
  }

  await setSocietyDeploy(auth.accountId, {
    projectName: result.projectName,
    url: result.url,
    deployedAt: new Date().toISOString(),
  });

  return Response.json({
    ok: true,
    mode: "provisioned",
    projectName: result.projectName,
    url: result.url,
    deploymentState: result.deploymentState,
    agentApiKey,
  });
}
