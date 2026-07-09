/**
 * Provisions a constituted society's own agent app (the
 * apps/sociedad-ia-starter scaffold) as its own Vercel project + first
 * deployment, via the Vercel REST API. See docs/CONTRACT.md and
 * ROADMAP.md's M1-6.
 *
 * Capability gate: needs `VERCEL_PROVISION_TOKEN` (a scoped token created at
 * vercel.com/account/settings/tokens). Absent -> `provisionSocietyApp`
 * returns `null`, a distinct signal from `{ ok: false }` so the caller
 * (`POST /api/society/deploy`) can fall back to the manual one-click path
 * rather than treat "not configured" as a failed attempt.
 *
 * Every HTTP call: 10s timeout, no retries (a second POST is not safe to
 * repeat -- e.g. a project name collision must surface as a distinct error,
 * not silently retry into a duplicate). When `VERCEL_TEAM_ID` is set, every
 * call is scoped to that team via `?teamId=`.
 *
 * Endpoints (Vercel REST API reference, fetched 2026-07-08):
 * - POST /v11/projects
 *   https://vercel.com/docs/rest-api/reference/endpoints/projects/create-a-new-project
 *   (the doc for this task named v10; the live reference now documents
 *   v11 as the current version, so this file uses v11)
 * - POST /v10/projects/{idOrName}/env (bulk array body)
 *   https://vercel.com/docs/rest-api/reference/endpoints/projects/create-one-or-more-environment-variables
 * - POST /v13/deployments
 *   https://vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment
 * - GET /v13/deployments/{idOrUrl}
 *   https://vercel.com/docs/rest-api/reference/endpoints/deployments/get-a-deployment-by-id-or-url
 * - GET /v7/deployments (list, filtered by `projectId`, `limit=1`)
 *   https://vercel.com/docs/rest-api/deployments/list-deployments
 *   (used by getLatestDeployment, ROADMAP.md M3-2's deploy-health read)
 */

const API_BASE = "https://api.vercel.com";
const TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 10_000;
const POLL_MAX_MS = 4 * 60 * 1000;

// The public GitHub repo every society's agent app is deployed from -- the
// same scaffold apps/sociedad-ia-starter, at its `main` ref, rooted at its
// own subdirectory in this monorepo.
const GITHUB_REPO = "ar-agents/ar-agents";
const GITHUB_ORG = "ar-agents";
const GITHUB_REPO_NAME = "ar-agents";
const ROOT_DIRECTORY = "apps/sociedad-ia-starter";
const GIT_REF = "main";

// Terminal deployment states per Vercel's readyState enum (BLOCKED, BUILDING,
// CANCELED, ERROR, INITIALIZING, QUEUED, READY): polling stops at any of
// these four, keeps going through the other three.
const TERMINAL_STATES = new Set(["READY", "ERROR", "CANCELED", "BLOCKED"]);

export interface ProvisionEnvVar {
  name: string;
  value: string;
}

export interface ProvisionSocietyAppInput {
  /** An identifier for the society (registryId or sessionId); turned into
   *  the Vercel project name via {@link projectSlugFor}. */
  name: string;
  envVars: ProvisionEnvVar[];
}

export type ProvisionSocietyAppResult =
  | { ok: true; projectName: string; url: string; deploymentState: string }
  | { ok: false; error: string };

function teamQueryParam(): string | null {
  const teamId = process.env.VERCEL_TEAM_ID?.trim();
  return teamId ? `teamId=${encodeURIComponent(teamId)}` : null;
}

function withTeamQuery(path: string): string {
  const q = teamQueryParam();
  return q ? `${path}${path.includes("?") ? "&" : "?"}${q}` : path;
}

/**
 * Vercel project names: lowercase letters, digits, `.`, `_`, `-`. This app
 * prefixes with `soc-` and keeps the whole name to 52 chars (well under
 * Vercel's 100-char limit, with headroom for readability in the dashboard).
 */
export function projectSlugFor(id: string): string {
  const prefix = "soc-";
  const maxLen = 52;
  const cleaned =
    String(id ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "") || "society";
  return `${prefix}${cleaned}`.slice(0, maxLen);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface VercelResponse {
  ok: boolean;
  status: number;
  data: unknown;
  networkError: boolean;
}

async function vercelFetch(
  token: string,
  path: string,
  init: RequestInit,
): Promise<VercelResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${withTeamQuery(path)}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return {
      ok: false,
      status: 0,
      data: { error: e instanceof Error ? e.message : String(e) },
      networkError: true,
    };
  }
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data, networkError: false };
}

function errorDetail(res: VercelResponse): string {
  const data = res.data as { error?: { message?: string; code?: string } } | null;
  return data?.error?.message ?? data?.error?.code ?? `http_${res.status}`;
}

async function createProject(
  token: string,
  slug: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await vercelFetch(token, "/v11/projects", {
    method: "POST",
    body: JSON.stringify({
      name: slug,
      framework: "nextjs",
      rootDirectory: ROOT_DIRECTORY,
      gitRepository: { type: "github", repo: GITHUB_REPO },
    }),
  });
  if (res.ok) return { ok: true };
  if (res.networkError) return { ok: false, error: `project_create_network_error: ${errorDetail(res)}` };
  if (res.status === 409) return { ok: false, error: "project_exists" };
  return { ok: false, error: `project_create_failed: ${errorDetail(res)}` };
}

async function setEnvVars(
  token: string,
  slug: string,
  envVars: ProvisionEnvVar[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await vercelFetch(token, `/v10/projects/${encodeURIComponent(slug)}/env`, {
    method: "POST",
    body: JSON.stringify(
      envVars.map((v) => ({
        key: v.name,
        value: v.value,
        type: "encrypted",
        target: ["production"],
      })),
    ),
  });
  if (res.ok) return { ok: true };
  return { ok: false, error: `env_vars_failed: ${errorDetail(res)}` };
}

async function createDeployment(
  token: string,
  slug: string,
): Promise<{ ok: true; id: string; url: string; readyState: string } | { ok: false; error: string }> {
  const res = await vercelFetch(token, "/v13/deployments", {
    method: "POST",
    body: JSON.stringify({
      name: slug,
      project: slug,
      gitSource: { type: "github", org: GITHUB_ORG, repo: GITHUB_REPO_NAME, ref: GIT_REF },
    }),
  });
  if (!res.ok) return { ok: false, error: `deployment_create_failed: ${errorDetail(res)}` };
  const data = res.data as { id?: string; url?: string; readyState?: string } | null;
  if (!data?.id || !data.url) return { ok: false, error: "deployment_create_failed: malformed_response" };
  return { ok: true, id: data.id, url: data.url, readyState: data.readyState ?? "QUEUED" };
}

/** Polls the deployment until a terminal state or the ~4min budget runs
 *  out. A polling network error or timeout is not treated as a hard
 *  failure: the deployment was already created, so the caller still gets
 *  the project + url back, just with whatever state was last observed. */
async function pollDeployment(token: string, deploymentId: string, initialState: string): Promise<string> {
  let state = initialState;
  const deadline = Date.now() + POLL_MAX_MS;
  while (!TERMINAL_STATES.has(state) && Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await vercelFetch(token, `/v13/deployments/${encodeURIComponent(deploymentId)}`, {
      method: "GET",
    });
    if (res.ok) {
      const data = res.data as { readyState?: string } | null;
      if (typeof data?.readyState === "string") state = data.readyState;
    }
    // On a polling error, keep the last known state and try again next tick
    // (still within the deadline); no retries are spent on the mutating
    // calls above, but polling a GET is safe to keep sampling.
  }
  return state;
}

/**
 * Provisions a society's agent app: creates its Vercel project, sets its
 * production env vars, and triggers the first deployment, then polls it to
 * a terminal state (or times out, still returning the project/url with the
 * last observed state). Returns `null` when `VERCEL_PROVISION_TOKEN` is not
 * configured (no capability, not a failure).
 */
export async function provisionSocietyApp(
  input: ProvisionSocietyAppInput,
): Promise<ProvisionSocietyAppResult | null> {
  const token = process.env.VERCEL_PROVISION_TOKEN?.trim();
  if (!token) return null;

  const slug = projectSlugFor(input.name);

  const project = await createProject(token, slug);
  if (!project.ok) return { ok: false, error: project.error };

  const env = await setEnvVars(token, slug, input.envVars);
  if (!env.ok) return { ok: false, error: env.error };

  const deployment = await createDeployment(token, slug);
  if (!deployment.ok) return { ok: false, error: deployment.error };

  const deploymentState = await pollDeployment(token, deployment.id, deployment.readyState);

  return { ok: true, projectName: slug, url: deployment.url, deploymentState };
}

// ── Credential env vars (ROADMAP.md M3-1) ────────────────────────────────
//
// setSocietyCredentialEnvVars/redeploySocietyApp target an ALREADY -
// provisioned project by its exact project name (the slug provisionSocietyApp
// returned and account.ts persisted as StoredSociety.deploy.projectName), not
// a freshly-derived one -- callers must not re-derive via projectSlugFor here.

async function postEnvVarsWithType(
  token: string,
  projectName: string,
  envVars: ProvisionEnvVar[],
  type: "sensitive" | "encrypted",
): Promise<{ ok: true } | { ok: false; error: string }> {
  // `upsert=true`: re-saving an already-set key updates it instead of 409ing,
  // which matters here (unlike the first-ever env write in setEnvVars above)
  // since the owner can come back and rotate a credential.
  const res = await vercelFetch(
    token,
    `/v10/projects/${encodeURIComponent(projectName)}/env?upsert=true`,
    {
      method: "POST",
      body: JSON.stringify(
        envVars.map((v) => ({ key: v.name, value: v.value, type, target: ["production"] })),
      ),
    },
  );
  if (res.ok) return { ok: true };
  return { ok: false, error: `env_vars_failed: ${errorDetail(res)}` };
}

export type SetSocietyCredentialEnvVarsResult =
  | { ok: true; typeUsed: "sensitive" | "encrypted" }
  | { ok: false; error: string };

/**
 * Sets one integration's env vars on an already-provisioned society project.
 * Tries `type: "sensitive"` first (Vercel's write-only env type: the value
 * cannot be read back via the API or dashboard after this call, only used at
 * build/runtime); falls back to `type: "encrypted"` if the account/plan
 * rejects "sensitive". Returns `null` when `VERCEL_PROVISION_TOKEN` is not
 * configured (no capability, not a failure -- mirrors provisionSocietyApp).
 */
export async function setSocietyCredentialEnvVars(
  projectName: string,
  envVars: ProvisionEnvVar[],
): Promise<SetSocietyCredentialEnvVarsResult | null> {
  const token = process.env.VERCEL_PROVISION_TOKEN?.trim();
  if (!token) return null;

  const sensitive = await postEnvVarsWithType(token, projectName, envVars, "sensitive");
  if (sensitive.ok) return { ok: true, typeUsed: "sensitive" };

  const encrypted = await postEnvVarsWithType(token, projectName, envVars, "encrypted");
  if (encrypted.ok) return { ok: true, typeUsed: "encrypted" };

  return { ok: false, error: encrypted.error };
}

export type RedeploySocietyAppResult =
  | { ok: true; url: string; deploymentState: string }
  | { ok: false; error: string };

/**
 * Triggers a fresh deployment of an already-provisioned society project (so
 * newly-set env vars take effect) and polls it to a terminal state, same
 * budget and semantics as {@link provisionSocietyApp}'s tail. Returns `null`
 * when `VERCEL_PROVISION_TOKEN` is not configured.
 */
export async function redeploySocietyApp(
  projectName: string,
): Promise<RedeploySocietyAppResult | null> {
  const token = process.env.VERCEL_PROVISION_TOKEN?.trim();
  if (!token) return null;

  const deployment = await createDeployment(token, projectName);
  if (!deployment.ok) return { ok: false, error: deployment.error };

  const deploymentState = await pollDeployment(token, deployment.id, deployment.readyState);
  return { ok: true, url: deployment.url, deploymentState };
}

export type TriggerRedeployResult =
  | { ok: true; url: string; readyState: string }
  | { ok: false; error: string };

/**
 * Triggers a fresh deployment WITHOUT polling to a terminal state (unlike
 * {@link redeploySocietyApp}, which blocks up to ~4min). Used by
 * `GET /api/society/activity`'s status-token backfill path (ROADMAP.md
 * M3-2): a founder-facing read endpoint must return quickly, so it fires the
 * deployment and lets the next auto-refresh observe progress via
 * {@link getLatestDeployment} instead of blocking this call on it. Returns
 * `null` when `VERCEL_PROVISION_TOKEN` is not configured.
 */
export async function triggerRedeploy(projectName: string): Promise<TriggerRedeployResult | null> {
  const token = process.env.VERCEL_PROVISION_TOKEN?.trim();
  if (!token) return null;

  const deployment = await createDeployment(token, projectName);
  if (!deployment.ok) return { ok: false, error: deployment.error };
  return { ok: true, url: deployment.url, readyState: deployment.readyState };
}

export type GetLatestDeploymentResult =
  | { ok: true; state: string; url: string; createdAt: string }
  | { ok: false; error: string };

/**
 * The most recent deployment for an already-provisioned project, for the
 * studio cockpit's deploy-health pill (ROADMAP.md M3-2). `projectId` accepts
 * either the project ID or its name per the Vercel docs; this app always has
 * the name (the slug `provisionSocietyApp` returned). Returns `null` when
 * `VERCEL_PROVISION_TOKEN` is not configured (no capability, not a failure).
 */
export async function getLatestDeployment(projectName: string): Promise<GetLatestDeploymentResult | null> {
  const token = process.env.VERCEL_PROVISION_TOKEN?.trim();
  if (!token) return null;

  const res = await vercelFetch(
    token,
    `/v7/deployments?projectId=${encodeURIComponent(projectName)}&limit=1`,
    { method: "GET" },
  );
  if (!res.ok) return { ok: false, error: `deployments_list_failed: ${errorDetail(res)}` };
  const data = res.data as { deployments?: Array<{ url?: string; readyState?: string; created?: number }> } | null;
  const d = data?.deployments?.[0];
  if (!d) return { ok: false, error: "no_deployments" };
  return {
    ok: true,
    state: d.readyState ?? "UNKNOWN",
    url: d.url ?? "",
    createdAt: typeof d.created === "number" ? new Date(d.created).toISOString() : new Date().toISOString(),
  };
}
