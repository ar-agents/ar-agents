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
 *
 * AUDIT_HMAC_SECRET provisioning (ROADMAP.md M3-4/M3-5) mirrors the above
 * exactly (`ensureAuditSecret` below), minus the value: it signs entries in
 * the starter's own local audit log, so studio never needs it back -- only
 * a boolean (`auditSecretSet`) is kept, enough to avoid re-minting (and
 * invalidating previously-signed entries) on every poll.
 *
 * SOCIEDAD_IA_DENOMINACION provisioning (ROADMAP.md M3-3) mirrors the above
 * too (`ensureDenominacion` below): the starter's branded homepage reads it
 * instead of showing its ACME-AI placeholder. Unlike the other two, nothing
 * is minted -- the value is the society's own `denominacion`, already known
 * here -- so only the `denominacionSet` boolean is tracked.
 *
 * All three backfills write different env vars on the SAME project, so a
 * fresh deployment is needed regardless of which ran; rather than each
 * firing its own `triggerRedeploy` (a society missing all three used to
 * queue three separate deployments in one poll), the ensure* helpers below
 * only report whether they changed anything, and the route triggers at most
 * one coalesced redeploy after all of them have run.
 */

import {
  authenticate,
  getStoredSociety,
  setSocietyAuditSecretSet,
  setSocietyDenominacionSet,
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
  /** Short, redacted, public-safe description (ROADMAP.md M3-4/M3-5). */
  summary?: string;
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
 * than throwing. Does NOT trigger a redeploy itself -- see the module doc
 * comment: the route coalesces at most one redeploy across all ensure*
 * helpers after they have all run.
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
  return { token, justProvisioned: true };
}

/**
 * Ensures the society has `AUDIT_HMAC_SECRET` set (ROADMAP.md M3-4/M3-5),
 * backfilling one for a society deployed before this feature existed.
 * Mirrors {@link ensureStatusToken} exactly, minus the token value: studio
 * never needs it back (nothing studio calls is authenticated with it), so
 * only the `auditSecretSet` boolean is persisted -- just enough to avoid
 * re-minting (and thereby invalidating previously-signed entries) on every
 * poll. Returns `null` under the same conditions as `ensureStatusToken`. Does
 * NOT trigger a redeploy itself, same reason as `ensureStatusToken`.
 */
async function ensureAuditSecret(
  accountId: string,
  society: StoredSociety,
): Promise<{ justProvisioned: boolean } | null> {
  if (society.auditSecretSet) return { justProvisioned: false };
  const projectName = society.deploy?.projectName;
  if (!projectName) return null;

  const secret = randomHex(32);
  const result = await setSocietyCredentialEnvVars(projectName, [
    { name: "AUDIT_HMAC_SECRET", value: secret },
  ]);
  if (result === null || !result.ok) return null;

  await setSocietyAuditSecretSet(accountId);
  return { justProvisioned: true };
}

/**
 * Ensures the society has `SOCIEDAD_IA_DENOMINACION` set (ROADMAP.md M3-3),
 * backfilling it for a society deployed before this feature existed.
 * Mirrors {@link ensureAuditSecret}: nothing is minted (the value is the
 * society's own `denominacion`, already known here), so only the
 * `denominacionSet` boolean is persisted. Returns `null` under the same
 * conditions as `ensureStatusToken`. Does NOT trigger a redeploy itself,
 * same reason as `ensureStatusToken`.
 */
async function ensureDenominacion(
  accountId: string,
  society: StoredSociety,
): Promise<{ justProvisioned: boolean } | null> {
  if (society.denominacionSet) return { justProvisioned: false };
  const projectName = society.deploy?.projectName;
  if (!projectName) return null;

  const result = await setSocietyCredentialEnvVars(projectName, [
    { name: "SOCIEDAD_IA_DENOMINACION", value: society.denominacion },
  ]);
  if (result === null || !result.ok) return null;

  await setSocietyDenominacionSet(accountId);
  return { justProvisioned: true };
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

  // The Vercel deploy-health lookup is independent and stays concurrent, but
  // ensureStatusToken, ensureAuditSecret, and ensureDenominacion all
  // read-modify-write the SAME stored society record: run them sequentially
  // (not via Promise.all), or whichever finishes last silently clobbers the
  // others' fields with a stale snapshot (each would read the same starting
  // record, then write back {...that stale snapshot, ownField}).
  const deployPromise = projectName ? getLatestDeployment(projectName) : Promise.resolve(null);
  const tokenResult = await ensureStatusToken(auth.accountId, society);
  const auditSecretResult = await ensureAuditSecret(auth.accountId, society);
  const denominacionResult = await ensureDenominacion(auth.accountId, society);

  // Coalesced redeploy: a society missing more than one of the three env
  // vars above used to queue one `triggerRedeploy` per backfill in the same
  // poll (harmless -- Vercel queues concurrent deploys for a project -- but
  // sloppy, see ROADMAP.md M3-5's follow-up note). Fire at most one here,
  // after all three have written their env vars, and don't await the ~4min
  // poll inside a request a founder is waiting on: the next auto-refresh
  // (60s interval / on-focus) observes progress via getLatestDeployment.
  if (projectName && (tokenResult?.justProvisioned || auditSecretResult?.justProvisioned || denominacionResult?.justProvisioned)) {
    void triggerRedeploy(projectName);
  }

  const deployLookup = await deployPromise;

  const deploy =
    deployLookup && deployLookup.ok
      ? { available: true, projectName, url: deployLookup.url, state: deployLookup.state }
      : { available: false, projectName, url: society.deploy?.url ?? null, state: null };

  // Skip the /api/status round trip right after a fresh backfill: the
  // deployment that will actually honor the new token hasn't landed yet.
  //
  // Fetch from the newest READY production deployment's URL
  // (`readyUrl`), not the stored `society.deploy.url` (frozen at first
  // provisioning, points at an old immutable deployment) and not the
  // newest deployment outright (a canceled or errored rollout at the top
  // of the list serves nothing). Both variants blanked every cockpit
  // section against the real dogfood society (found live, 2026-07-09).
  // The stored URL remains the fallback when the deployments lookup is
  // unavailable.
  const statusUrl = (deployLookup && deployLookup.ok && deployLookup.readyUrl) || society.deploy?.url || null;
  const starterStatus =
    tokenResult && !tokenResult.justProvisioned && statusUrl
      ? await fetchStarterStatus(statusUrl, tokenResult.token)
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
    provisioning:
      Boolean(tokenResult?.justProvisioned) ||
      Boolean(auditSecretResult?.justProvisioned) ||
      Boolean(denominacionResult?.justProvisioned),
  });
}
