// Client for the studio's `/api/society`, `/api/society/activity`, and
// `/api/society/suspend` contracts (see
// apps/studio/src/app/api/society/route.ts,
// apps/studio/src/app/api/society/activity/route.ts,
// apps/studio/src/app/api/society/suspend/route.ts, and docs/CONTRACT.md).
// Mirrors constitute-client.ts's fetch-agnostic, error-class,
// shape-validation shape so this CLI is unit-testable without a real network
// stack.
//
// `/api/society/suspend` is the kill switch: the caller (index.ts's
// `suspend`/`resume` commands) is responsible for gating on an explicit
// confirmation before this module is ever invoked. This module always sends
// `acepta: true`, since by the time it is called the confirmation has
// already happened (same pattern as constitute-client.ts's `acepta102`).

export class SocietyClientError extends Error {
  readonly status?: number;
  readonly code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "SocietyClientError";
    if (status !== undefined) {
      this.status = status;
    }
    if (code !== undefined) {
      this.code = code;
    }
  }
}

export interface SocietySummary {
  sessionId: string;
  denominacion: string;
  tipo: string;
  registryId: string | null;
  createdAt: string;
  goodStanding: { state: string; score: number | null; rating: string | null } | null;
  suspended: boolean | null;
  pendingApprovals: number | null;
  deploy: { projectName: string; url: string; deployedAt: string } | null;
}

export interface SocietyApprovalItem {
  id: string;
  tool: string;
  status: string;
  createdAt: string;
}

export interface SocietyAuditEntry {
  id: string;
  ts: string;
  tool: string;
  governance: string;
  errored: boolean;
  summary?: string;
}

export interface SocietyActivity {
  deploy: { available: boolean; projectName: string | null; url: string | null; state: string | null };
  society: {
    available: boolean;
    denominacion: string | null;
    version: string | null;
    uptimeSeconds: number | null;
  };
  clients: { available: boolean; statuses: Record<string, string> | null };
  killSwitch: { available: boolean; suspended: boolean | null };
  approvals: {
    available: boolean;
    pendingCount: number | null;
    items: SocietyApprovalItem[] | null;
  };
  audit: {
    available: boolean;
    entries: SocietyAuditEntry[] | null;
  };
  provisioning: boolean;
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** GET {baseUrl}/api/society with `x-studio-token`: the account's society
 *  summary, or null when the account has no society yet. */
export async function getSociety(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<{ society: SocietySummary | null }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${trimTrailingSlash(opts.baseUrl)}/api/society`, {
    method: "GET",
    headers: { "x-studio-token": opts.token },
  });

  if (!res.ok) {
    throw new SocietyClientError(`society_lookup_failed:${res.status}`, res.status);
  }

  const data = (await res.json().catch(() => null)) as { ok?: boolean; society?: unknown } | null;
  if (!data?.ok) {
    throw new SocietyClientError("society_lookup_invalid_response");
  }

  if (data.society === null || data.society === undefined) {
    return { society: null };
  }

  if (typeof data.society !== "object") {
    throw new SocietyClientError("society_lookup_invalid_response");
  }

  // Defensive: only the fields the CLI actually reads are validated/coerced;
  // an upstream that adds fields or omits an optional one must not crash the
  // CLI (mirrors index.ts's formatToolLine defensiveness).
  const raw = data.society as Record<string, unknown>;
  const society: SocietySummary = {
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : "",
    denominacion: typeof raw.denominacion === "string" ? raw.denominacion : "",
    tipo: typeof raw.tipo === "string" ? raw.tipo : "",
    registryId: typeof raw.registryId === "string" ? raw.registryId : null,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : "",
    goodStanding:
      raw.goodStanding && typeof raw.goodStanding === "object"
        ? {
            state: typeof (raw.goodStanding as Record<string, unknown>).state === "string"
              ? ((raw.goodStanding as Record<string, unknown>).state as string)
              : "",
            score: typeof (raw.goodStanding as Record<string, unknown>).score === "number"
              ? ((raw.goodStanding as Record<string, unknown>).score as number)
              : null,
            rating: typeof (raw.goodStanding as Record<string, unknown>).rating === "string"
              ? ((raw.goodStanding as Record<string, unknown>).rating as string)
              : null,
          }
        : null,
    suspended: typeof raw.suspended === "boolean" ? raw.suspended : null,
    pendingApprovals: typeof raw.pendingApprovals === "number" ? raw.pendingApprovals : null,
    deploy:
      raw.deploy && typeof raw.deploy === "object"
        ? {
            projectName: typeof (raw.deploy as Record<string, unknown>).projectName === "string"
              ? ((raw.deploy as Record<string, unknown>).projectName as string)
              : "",
            url: typeof (raw.deploy as Record<string, unknown>).url === "string"
              ? ((raw.deploy as Record<string, unknown>).url as string)
              : "",
            deployedAt: typeof (raw.deploy as Record<string, unknown>).deployedAt === "string"
              ? ((raw.deploy as Record<string, unknown>).deployedAt as string)
              : "",
          }
        : null,
  };

  return { society };
}

/** GET {baseUrl}/api/society/activity with `x-studio-token`: the "sociedad
 *  en vivo" cockpit feed. Throws `SocietyClientError` with
 *  `code === "sin_sociedad"` on a 404 (the account has no society at all);
 *  a society with no deploy yet still returns 200 with every section
 *  `available: false`. */
export async function getSocietyActivity(opts: {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<SocietyActivity> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const res = await fetchImpl(`${trimTrailingSlash(opts.baseUrl)}/api/society/activity`, {
    method: "GET",
    headers: { "x-studio-token": opts.token },
  });

  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    const message = body?.message ?? body?.error ?? "sin_sociedad";
    throw new SocietyClientError(message, 404, "sin_sociedad");
  }

  if (!res.ok) {
    throw new SocietyClientError(`society_activity_failed:${res.status}`, res.status);
  }

  const data = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        deploy?: unknown;
        society?: unknown;
        clients?: unknown;
        killSwitch?: unknown;
        approvals?: unknown;
        audit?: unknown;
        provisioning?: unknown;
      }
    | null;

  if (!data?.ok) {
    throw new SocietyClientError("society_activity_invalid_response");
  }

  const deployRaw = (data.deploy ?? {}) as Record<string, unknown>;
  const societyRaw = (data.society ?? {}) as Record<string, unknown>;
  const clientsRaw = (data.clients ?? {}) as Record<string, unknown>;
  const killSwitchRaw = (data.killSwitch ?? {}) as Record<string, unknown>;
  const approvalsRaw = (data.approvals ?? {}) as Record<string, unknown>;
  const auditRaw = (data.audit ?? {}) as Record<string, unknown>;

  return {
    deploy: {
      available: deployRaw.available === true,
      projectName: typeof deployRaw.projectName === "string" ? deployRaw.projectName : null,
      url: typeof deployRaw.url === "string" ? deployRaw.url : null,
      state: typeof deployRaw.state === "string" ? deployRaw.state : null,
    },
    society: {
      available: societyRaw.available === true,
      denominacion: typeof societyRaw.denominacion === "string" ? societyRaw.denominacion : null,
      version: typeof societyRaw.version === "string" ? societyRaw.version : null,
      uptimeSeconds: typeof societyRaw.uptimeSeconds === "number" ? societyRaw.uptimeSeconds : null,
    },
    clients: {
      available: clientsRaw.available === true,
      statuses:
        clientsRaw.statuses && typeof clientsRaw.statuses === "object"
          ? (clientsRaw.statuses as Record<string, string>)
          : null,
    },
    killSwitch: {
      available: killSwitchRaw.available === true,
      suspended: typeof killSwitchRaw.suspended === "boolean" ? killSwitchRaw.suspended : null,
    },
    approvals: {
      available: approvalsRaw.available === true,
      pendingCount: typeof approvalsRaw.pendingCount === "number" ? approvalsRaw.pendingCount : null,
      items: Array.isArray(approvalsRaw.items) ? (approvalsRaw.items as SocietyApprovalItem[]) : null,
    },
    audit: {
      available: auditRaw.available === true,
      entries: Array.isArray(auditRaw.entries) ? (auditRaw.entries as SocietyAuditEntry[]) : null,
    },
    provisioning: data.provisioning === true,
  };
}

/** Pure request builder: assembles the URL and RequestInit for
 *  POST /api/society/suspend without performing the fetch. Kept separate
 *  from `setSocietySuspended` so the request shape is unit-testable without a
 *  fetch mock. `motivo` is omitted from the body entirely when undefined
 *  (rather than sent as `undefined`, which `JSON.stringify` drops anyway,
 *  but being explicit keeps the shape obvious at the call site). */
export function buildSuspendRequest(opts: {
  baseUrl: string;
  token: string;
  suspend: boolean;
  motivo?: string;
}): { url: string; init: RequestInit } {
  const body: { suspend: boolean; motivo?: string; acepta: true } = {
    suspend: opts.suspend,
    acepta: true,
  };
  if (opts.motivo !== undefined) {
    body.motivo = opts.motivo;
  }
  return {
    url: `${trimTrailingSlash(opts.baseUrl)}/api/society/suspend`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": opts.token },
      body: JSON.stringify(body),
    },
  };
}

/** POST {baseUrl}/api/society/suspend with `x-studio-token`: the kill
 *  switch. `suspend: true` suspends the society, `suspend: false` resumes
 *  it. Throws `SocietyClientError` with `code === "sin_sociedad"` on a 404
 *  (the account has no society), or a generic `suspend_failed:${status}` on
 *  any other non-ok response. */
export async function setSocietySuspended(opts: {
  baseUrl: string;
  token: string;
  suspend: boolean;
  motivo?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ suspended: boolean | null }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { url, init } = buildSuspendRequest(opts);
  const res = await fetchImpl(url, init);

  if (res.status === 404) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    const message = body?.message ?? body?.error ?? "sin_sociedad";
    throw new SocietyClientError(message, 404, "sin_sociedad");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new SocietyClientError(`suspend_failed:${res.status}`, res.status, body?.error);
  }

  const data = (await res.json().catch(() => null)) as { ok?: boolean; suspended?: unknown } | null;
  if (!data?.ok) {
    throw new SocietyClientError("suspend_invalid_response");
  }

  return { suspended: typeof data.suspended === "boolean" ? data.suspended : null };
}
