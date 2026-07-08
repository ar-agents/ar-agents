/**
 * Typed fetch helpers for every ar-agents.ar upstream call studio makes.
 * Base URL is `STUDIO_ARAGENTS_BASE` (default https://ar-agents.ar). Every
 * call has a 10s timeout; POSTs are never retried (they may not be
 * idempotent -- e.g. incorporate-attested is a durable, one-shot act).
 */

const DEFAULT_BASE = "https://ar-agents.ar";
const TIMEOUT_MS = 10_000;

function base(): string {
  return process.env.STUDIO_ARAGENTS_BASE?.trim() || DEFAULT_BASE;
}

export type UpstreamResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number | null; error: string; data?: unknown };

async function request<T>(
  path: string,
  init: RequestInit,
): Promise<UpstreamResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${base()}${path}`, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    return { ok: false, status: null, error: e instanceof Error ? e.message : String(e) };
  }
  const data = (await res.json().catch(() => null)) as T | null;
  if (!res.ok) {
    return { ok: false, status: res.status, error: "upstream_error", data: data ?? undefined };
  }
  return { ok: true, status: res.status, data: data as T };
}

function getJson<T>(path: string, headers?: Record<string, string>): Promise<UpstreamResult<T>> {
  return request<T>(path, { method: "GET", headers });
}

function postJson<T>(
  path: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<UpstreamResult<T>> {
  return request<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// ── /api/incorporate-preview ─────────────────────────────────────────────

export interface PreviewSocietyResponse {
  ok: boolean;
  dryRun?: boolean;
  sociedad?: { denominacion: string; tipo: string; capitalSocial: number; slug: string };
  draft?: Record<string, unknown>;
  validation?: { valid: boolean; findings: unknown[] };
  configFiles?: string[];
  envVars?: Array<{ name: string; description: string }>;
  checklist?: string[];
  deploy?: { target: string; oneClickUrl: string };
  note?: string;
  error?: string;
  detail?: unknown;
}

export function previewSociety(prompt: string): Promise<UpstreamResult<PreviewSocietyResponse>> {
  return postJson<PreviewSocietyResponse>("/api/incorporate-preview", { prompt });
}

// ── /api/incorporate-attested ────────────────────────────────────────────

export interface IncorporateAttestedPayload {
  draft: Record<string, unknown>;
  administrador: { nombre: string; cuit: string };
  acepta102: true;
}

export interface IncorporateAttestedResponse {
  ok: boolean;
  sociedad?: { denominacion: string; tipo: string; capitalSocial: number; slug: string };
  formationPack?: Record<string, unknown>;
  deploy?: { target: string; oneClickUrl: string; sourceUrl: string; manualSteps: string[] };
  audit?: { sessionId: string; backend: string };
  registry?: { id: string; status: string; checklistUrl: string };
  adminToken?: string | null;
  gateToken?: string | null;
  error?: string;
  message?: string;
}

export function incorporateAttested(
  payload: IncorporateAttestedPayload,
): Promise<UpstreamResult<IncorporateAttestedResponse>> {
  return postJson<IncorporateAttestedResponse>("/api/incorporate-attested", payload);
}

// ── /api/registry/good-standing ──────────────────────────────────────────

export interface GoodStandingResponse {
  body?: {
    found: boolean;
    goodStanding: { state: string; score: number | null; rating: string | null } | null;
  };
  error?: string;
}

/** Looks up by `?id=` when `idOrUrl` doesn't look like a URL, else `?url=`. */
export function goodStanding(idOrUrl: string): Promise<UpstreamResult<GoodStandingResponse>> {
  const isUrl = /^https?:\/\//i.test(idOrUrl);
  const param = isUrl ? `url=${encodeURIComponent(idOrUrl)}` : `id=${encodeURIComponent(idOrUrl)}`;
  return getJson<GoodStandingResponse>(`/api/registry/good-standing?${param}`);
}

// ── /api/suspension-status ───────────────────────────────────────────────

export interface SuspensionStatusResponse {
  ok: boolean;
  society?: string;
  suspended?: boolean;
  error?: string;
}

export function suspensionStatus(sessionId: string): Promise<UpstreamResult<SuspensionStatusResponse>> {
  return getJson<SuspensionStatusResponse>(
    `/api/suspension-status?society=${encodeURIComponent(sessionId)}`,
  );
}

// ── /api/approvals/pending ────────────────────────────────────────────────

export interface ApprovalItem {
  id: string;
  society: string;
  tool: string;
  status: string;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
  argsPreview?: string;
  argsHash?: string;
}

export interface PendingApprovalsResponse {
  ok: boolean;
  society?: string;
  authorized?: boolean;
  pending?: ApprovalItem[];
  error?: string;
}

/** Public (redacted) view, no admin token required: used only to count
 *  pending items for the SocietySummary. */
export function pendingApprovalsPublic(
  sessionId: string,
): Promise<UpstreamResult<PendingApprovalsResponse>> {
  return getJson<PendingApprovalsResponse>(
    `/api/approvals/pending?society=${encodeURIComponent(sessionId)}`,
  );
}

/** Full (unredacted) view, gated by the society's admin capability token. */
export function pendingApprovalsPrivate(
  sessionId: string,
  adminToken: string,
): Promise<UpstreamResult<PendingApprovalsResponse>> {
  return getJson<PendingApprovalsResponse>(
    `/api/approvals/pending?society=${encodeURIComponent(sessionId)}`,
    { "x-admin-token": adminToken },
  );
}

// ── /api/approvals/resolve ───────────────────────────────────────────────

export interface ResolveApprovalPayload {
  id: string;
  approved: boolean;
  adminToken: string;
  nombre?: string;
}

export interface ResolveApprovalResponse {
  ok: boolean;
  request?: ApprovalItem;
  audit?: { entry: unknown };
  error?: string;
}

export function resolveApproval(
  payload: ResolveApprovalPayload,
): Promise<UpstreamResult<ResolveApprovalResponse>> {
  return postJson<ResolveApprovalResponse>("/api/approvals/resolve", payload);
}

// ── /api/suspender + /api/reanudar ───────────────────────────────────────

export interface ChangeSuspensionPayload {
  society: string;
  adminToken: string;
  motivo?: string;
  acepta: true;
}

export interface ChangeSuspensionResponse {
  ok: boolean;
  suspended?: boolean;
  society?: string;
  audit?: { entry: unknown };
  error?: string;
  message?: string;
}

export function suspendSociety(
  payload: ChangeSuspensionPayload,
): Promise<UpstreamResult<ChangeSuspensionResponse>> {
  return postJson<ChangeSuspensionResponse>("/api/suspender", payload);
}

export function resumeSociety(
  payload: ChangeSuspensionPayload,
): Promise<UpstreamResult<ChangeSuspensionResponse>> {
  return postJson<ChangeSuspensionResponse>("/api/reanudar", payload);
}
