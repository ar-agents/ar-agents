/**
 * `GET /api/society/activity` (auth): the "sociedad en vivo" cockpit feed,
 * ROADMAP.md M3-2. Merges independent, best-effort look-ups into one
 * UI-ready payload so a non-technical founder reads deploy health, client
 * wiring, the kill switch, pending approvals, and recent audited actions at
 * a glance, without ever visiting the raw deploy URL:
 *
 *  - Vercel API (`getLatestDeployment`): the society's latest deployment
 *    state (deploy health).
 *  - The deployed society app's own `GET /api/status`
 *    (apps/sociedad-ia-starter), authenticated with the studio-issued
 *    `STUDIO_STATUS_TOKEN` machine credential (never a human-entered
 *    credential): client wiring, kill switch, pending approvals, recent
 *    signed-audit-log entries.
 *
 * Each section reports its own `available` flag and degrades to "sin datos
 * todavia" independently -- one flaky upstream (or a society that predates
 * this feature and has no status token yet) must not fail the whole
 * response. See docs/CONTRACT.md.
 *
 * STUDIO_STATUS_TOKEN provisioning: minted once per society, at deploy time
 * going forward (`POST /api/society/deploy`) or lazily backfilled here for a
 * society that was already deployed before M3-2 shipped (`ensureStatusToken`
 * below). The token is a studio-issued machine secret (never a human-entered
 * credential): generated locally, set on the society's Vercel project env,
 * and stored in studio's own KV. Never returned to the browser, never
 * logged.
 */

import {
  authenticate,
  getStoredSociety,
  setSocietyStatusToken,
  type StoredSociety,
} from "@/lib/account";
import { kvRateLimit } from "@/lib/ratelimit";
import {
  getLatestDeployment,
  setSocietyCredentialEnvVars,
  triggerRedeploy,
} from "@/lib/vercel-provision";

export const runtime = "nodejs";

const STATUS_FETCH_TIMEOUT_MS = 8_000;

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface ApprovalItemLike {
  id: string;
  tool: string;
  status: string;
  createdAt: string;
}
interface AuditEntryLike {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
}

interface StarterStatusResponse {
  ok?: boolean;
  denominacion?: string;
  version?: string;
  uptimeSeconds?: number;
  clients?: Record<string, string>;
  killSwitch?: { available?: boolean; suspended?: boolean | null };
  approvals?: { available?: boolean; pendingCount?: number | null; items?: ApprovalItemLike[] | null };
  audit?: { available?: boolean; entries?: AuditEntryLike[] | null };
}

/**
 * Ensures the society has a `STUDIO_STATUS_TOKEN`, backfilling one for a
 * society deployed before this feature existed. Returns `null` when there is
 * no provisioned project to backfill against, or the backfill itself failed
 * (no Vercel-provisioning capability, or a Vercel error) -- either way the
 * caller degrades every /api/status-derived section to unavailable rather
 * than throwing.
 */
async function ensureStatusToken(
  accountId: string,
  society: StoredSociety,
): Promise<{ token: string; justProvisioned: boolean } | null> {
  if (society.statusToken) return { token: society.statusToken, justProvisioned: false };
  const projectName = society.deploy?.projectName;
  if (!projectName) return null;

  const token = randomHex(32);
  const result = await setSocietyCredentialEnvVars(projectName, [
    { name: "STUDIO_STATUS_TOKEN", value: token },
  ]);
  if (result === null || !result.ok) return null;

  await setSocietyStatusToken(accountId, token);
  // Fire-and-forget: a fresh deployment is needed for the new env var (and,
  // once this ships, the /api/status route's code) to take effect. Do NOT
  // await the ~4min poll inside a request a founder is waiting on -- the
  // next auto-refresh (60s interval / on-focus) observes progress via
  // getLatestDeployment instead.
  void triggerRedeploy(projectName);
  return { token, justProvisioned: true };
}

async function fetchStarterStatus(url: string, token: string): Promise<StarterStatusResponse | null> {
  try {
    const res = await fetch(`${url.startsWith("http") ? url : `https://${url}`}/api/status`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(STATUS_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as StarterStatusResponse;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const auth = await authenticate(req);
  if (!auth.ok) {
    return Response.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  // Read endpoint, but the 60s auto-refresh plus on-focus refetches from the
  // cockpit make an unbounded caller cheap to damp; fails OPEN (a KV outage
  // must not blank out the cockpit).
  if (!(await kvRateLimit("society-activity", auth.accountId, 120, 60 * 60))) {
    return Response.json({ ok: false, error: "rate_limited" }, { status: 429 });
  }

  const society = await getStoredSociety(auth.accountId);
  if (!society) {
    return Response.json({ ok: false, error: "sin_sociedad" }, { status: 404 });
  }

  const projectName = society.deploy?.projectName ?? null;

  const [deployLookup, tokenResult] = await Promise.all([
    projectName ? getLatestDeployment(projectName) : Promise.resolve(null),
    ensureStatusToken(auth.accountId, society),
  ]);

  const deploy =
    deployLookup && deployLookup.ok
      ? { available: true, projectName, url: deployLookup.url, state: deployLookup.state }
      : { available: false, projectName, url: society.deploy?.url ?? null, state: null };

  // Skip the /api/status round trip right after a fresh backfill: the
  // deployment that will actually honor the new token hasn't landed yet.
  const starterStatus =
    tokenResult && !tokenResult.justProvisioned && society.deploy?.url
      ? await fetchStarterStatus(society.deploy.url, tokenResult.token)
      : null;

  return Response.json({
    ok: true,
    deploy,
    society: {
      available: Boolean(starterStatus),
      denominacion: starterStatus?.denominacion ?? null,
      version: starterStatus?.version ?? null,
      uptimeSeconds: typeof starterStatus?.uptimeSeconds === "number" ? starterStatus.uptimeSeconds : null,
    },
    clients: {
      available: Boolean(starterStatus?.clients),
      statuses: starterStatus?.clients ?? null,
    },
    killSwitch: {
      available: starterStatus?.killSwitch?.available === true,
      suspended: starterStatus?.killSwitch?.available ? (starterStatus.killSwitch.suspended ?? null) : null,
    },
    approvals: {
      available: starterStatus?.approvals?.available === true,
      pendingCount: starterStatus?.approvals?.available ? (starterStatus.approvals.pendingCount ?? null) : null,
      items: starterStatus?.approvals?.available ? (starterStatus.approvals.items ?? null) : null,
    },
    audit: {
      available: starterStatus?.audit?.available === true,
      entries: starterStatus?.audit?.available ? (starterStatus.audit.entries ?? null) : null,
    },
    provisioning: Boolean(tokenResult?.justProvisioned),
  });
}
