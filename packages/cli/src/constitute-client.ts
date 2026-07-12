// Client for the studio's `/api/society/constitute` contract (see
// apps/studio/src/app/api/society/constitute/route.ts and docs/CONTRACT.md).
// Mirrors account-client.ts's fetch-agnostic, error-class, shape-validation
// shape so this CLI is unit-testable without a real network stack.
//
// This is the irreversible constitution act: the caller (index.ts's
// `constitute` command) is responsible for gating on an explicit
// confirmation before this module is ever invoked. This module always sends
// `acepta102: true`, since by the time it is called the confirmation has
// already happened.

export class ConstituteClientError extends Error {
  readonly status?: number;
  readonly code?: string;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "ConstituteClientError";
    if (status !== undefined) {
      this.status = status;
    }
    if (code !== undefined) {
      this.code = code;
    }
  }
}

export interface ConstituteResult {
  society: { denominacion?: string; tipo?: string; registryId?: string | null };
  credentials: { adminToken: string; gateToken: string };
}

function trimTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

/** Pure request builder: assembles the URL and RequestInit for
 *  POST /api/society/constitute without performing the fetch. Kept separate
 *  from `constituteSociety` so the request shape is unit-testable without a
 *  fetch mock. */
export function buildConstituteRequest(opts: {
  baseUrl: string;
  token: string;
  draft: unknown;
  administrador: { nombre: string; cuit: string };
}): { url: string; init: RequestInit } {
  return {
    url: `${trimTrailingSlash(opts.baseUrl)}/api/society/constitute`,
    init: {
      method: "POST",
      headers: { "content-type": "application/json", "x-studio-token": opts.token },
      body: JSON.stringify({
        draft: opts.draft,
        administrador: opts.administrador,
        acepta102: true,
      }),
    },
  };
}

/** POST {baseUrl}/api/society/constitute with `x-studio-token`: the
 *  irreversible constitution act. Throws `ConstituteClientError` with
 *  `code === "ya_tiene_sociedad"` on a 409 (the account already has a
 *  society), or a generic `constitute_failed:${status}` on any other
 *  non-ok response. */
export async function constituteSociety(opts: {
  baseUrl: string;
  token: string;
  draft: unknown;
  administrador: { nombre: string; cuit: string };
  fetchImpl?: typeof fetch;
}): Promise<ConstituteResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { url, init } = buildConstituteRequest(opts);
  const res = await fetchImpl(url, init);

  if (res.status === 409) {
    const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    const message = body?.message ?? body?.error ?? "ya_tiene_sociedad";
    throw new ConstituteClientError(message, 409, "ya_tiene_sociedad");
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { message?: string; error?: string } | null;
    const detail = body?.message ?? body?.error;
    const message = detail ? `constitute_failed:${res.status}:${detail}` : `constitute_failed:${res.status}`;
    throw new ConstituteClientError(message, res.status, body?.error);
  }

  const data = (await res.json().catch(() => null)) as
    | { ok?: boolean; society?: unknown; credentials?: { adminToken?: string; gateToken?: string } }
    | null;

  if (
    !data?.ok ||
    typeof data.credentials?.adminToken !== "string" ||
    typeof data.credentials?.gateToken !== "string"
  ) {
    throw new ConstituteClientError("constitute_invalid_response");
  }

  const society = (data.society ?? {}) as ConstituteResult["society"];

  return {
    society,
    credentials: { adminToken: data.credentials.adminToken, gateToken: data.credentials.gateToken },
  };
}
