/**
 * Async human-in-the-loop approval queue: art. 102 supervision for a deployed,
 * autonomous Sociedad Automatizada.
 *
 * A deployed society's agent cannot block synchronously waiting for a human on
 * every high-stakes act. So its central gate (`enforceRiskPolicy`'s `approve`)
 * calls the GATE here: if this exact action (society + tool + args hash) was
 * already approved, it is consumed and the act proceeds; otherwise a pending
 * request is queued and the act is DEFERRED (the gate returns false). The
 * administrator approves or denies pending requests, and EVERY decision is a
 * signed, durable audit act tied to their CUIT (matched against the society's
 * signed constitution). Approvals are single-use, so an approved transfer runs
 * once, not forever.
 *
 * Storage: Vercel KV, with an in-memory fallback for local dev / preview.
 */

import { kv } from "@vercel/kv";
import { verifyAdminToken } from "./admin-token";
import { type ApproverAttestation, appendAudit, type AuditEntry, readAudit } from "./audit";
import { societyAdminPrincipal } from "./suspension";

export type ApprovalStatus = "pending" | "approved" | "denied" | "consumed";

export interface ApprovalRequest {
  id: string;
  society: string;
  tool: string;
  argsHash: string;
  /** A short, human-readable preview of the args, for the administrator. */
  argsPreview: string;
  status: ApprovalStatus;
  createdAt: string;
  resolvedAt?: string;
  resolvedBy?: string;
}

const REQ_TTL_SECONDS = 30 * 24 * 60 * 60; // pendings/decisions expire after 30 days
const enc = new TextEncoder();

// ── stable args hash (canonical JSON + sha256) ───────────────────────────────

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

/** Stable 32-hex-char fingerprint of a tool's args, so the same action maps to
 *  the same approval regardless of key order. */
export async function hashArgs(args: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(canonical(args)));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

// ── storage (KV with in-memory fallback) ─────────────────────────────────────

const memReq = new Map<string, ApprovalRequest>();
const memAct = new Map<string, string>(); // actKey -> requestId
const memPending = new Map<string, Set<string>>(); // society -> set of ids

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

const reqKey = (id: string) => `appr:req:${id}`;
const actKey = (society: string, tool: string, h: string) => `appr:act:${society}:${tool}:${h}`;
const pendingKey = (society: string) => `appr:pending:${society}`;

async function getReq(id: string): Promise<ApprovalRequest | null> {
  if (!isKvWired()) return memReq.get(id) ?? null;
  return (await kv.get<ApprovalRequest>(reqKey(id))) ?? null;
}

async function putReq(req: ApprovalRequest): Promise<void> {
  if (!isKvWired()) {
    memReq.set(req.id, req);
    return;
  }
  await kv.set(reqKey(req.id), req, { ex: REQ_TTL_SECONDS });
}

async function getActId(society: string, tool: string, h: string): Promise<string | null> {
  if (!isKvWired()) return memAct.get(actKey(society, tool, h)) ?? null;
  return (await kv.get<string>(actKey(society, tool, h))) ?? null;
}

async function putActId(society: string, tool: string, h: string, id: string): Promise<void> {
  if (!isKvWired()) {
    memAct.set(actKey(society, tool, h), id);
    return;
  }
  await kv.set(actKey(society, tool, h), id, { ex: REQ_TTL_SECONDS });
}

async function addPending(society: string, id: string): Promise<void> {
  if (!isKvWired()) {
    const s = memPending.get(society) ?? new Set<string>();
    s.add(id);
    memPending.set(society, s);
    return;
  }
  await kv.sadd(pendingKey(society), id);
}

async function removePending(society: string, id: string): Promise<void> {
  if (!isKvWired()) {
    memPending.get(society)?.delete(id);
    return;
  }
  await kv.srem(pendingKey(society), id);
}

async function listPendingIds(society: string): Promise<string[]> {
  if (!isKvWired()) return [...(memPending.get(society) ?? [])];
  const ids = await kv.smembers(pendingKey(society));
  return Array.isArray(ids) ? (ids as string[]) : [];
}

const memConsumed = new Set<string>();

/**
 * Atomic single-use claim on an approval id. Only the FIRST concurrent caller
 * wins (SETNX / set-if-absent), so two simultaneous gate calls can never both
 * consume one approval and run the approved act twice.
 */
async function claimConsume(id: string): Promise<boolean> {
  if (!isKvWired()) {
    if (memConsumed.has(id)) return false;
    memConsumed.add(id);
    return true;
  }
  const got = await kv.set(`appr:consumed:${id}`, "1", { nx: true, ex: REQ_TTL_SECONDS });
  return Boolean(got);
}

// ── public API ───────────────────────────────────────────────────────────────

/** Queue a pending approval for an action, deduping on (society, tool, argsHash)
 *  while one is already pending. */
export async function requestApproval(
  society: string,
  tool: string,
  argsHash: string,
  argsPreview: string,
): Promise<ApprovalRequest> {
  const existingId = await getActId(society, tool, argsHash);
  if (existingId) {
    const existing = await getReq(existingId);
    if (existing) {
      // Dedup a still-pending request; KEEP a denial STICKY (a denied action must
      // not silently re-queue and grind through on a fatigued re-approval). A
      // "consumed" request falls through: single-use, so the next instance of the
      // same action re-queues for a fresh approval.
      if (existing.status === "pending" || existing.status === "denied") return existing;
    }
  }
  const req: ApprovalRequest = {
    id: crypto.randomUUID(),
    society,
    tool,
    argsHash,
    argsPreview: argsPreview.slice(0, 500),
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  await putReq(req);
  await putActId(society, tool, argsHash, req.id);
  await addPending(society, req.id);
  return req;
}

/** Consume an approved-and-unconsumed approval for an action. Single use: once
 *  consumed the act proceeds exactly once. Returns true iff consumed. */
export async function consumeApproval(
  society: string,
  tool: string,
  argsHash: string,
): Promise<boolean> {
  const id = await getActId(society, tool, argsHash);
  if (!id) return false;
  const req = await getReq(id);
  if (!req || req.status !== "approved") return false;
  // Atomic single-use: only ONE concurrent caller may consume this approval.
  // Without this guard, two concurrent gate calls both observe "approved" and
  // both proceed -> the approved act executes twice (double-spend / double-file).
  if (!(await claimConsume(id))) return false;
  req.status = "consumed";
  req.resolvedAt = req.resolvedAt ?? new Date().toISOString();
  await putReq(req);
  return true;
}

/**
 * The gate the society's enforcement calls. Consume-or-queue: returns
 * `{ approved: true }` if this action was already approved (and consumes it),
 * else queues a pending request and returns `{ approved: false, ... }`.
 */
export async function gateAction(
  society: string,
  tool: string,
  args: unknown,
): Promise<{ approved: boolean; status: ApprovalStatus; requestId?: string }> {
  const h = await hashArgs(args);
  if (await consumeApproval(society, tool, h)) {
    return { approved: true, status: "consumed" };
  }
  const preview = (() => {
    try {
      return JSON.stringify(args) ?? "";
    } catch {
      return "";
    }
  })();
  const req = await requestApproval(society, tool, h, preview);
  return { approved: false, status: req.status, requestId: req.id };
}

export async function approvalById(id: string): Promise<ApprovalRequest | null> {
  return getReq(id);
}

/** Pending approvals for a society, newest first. */
export async function pendingApprovals(society: string): Promise<ApprovalRequest[]> {
  const ids = await listPendingIds(society);
  const reqs = await Promise.all(ids.map((id) => getReq(id)));
  return reqs
    .filter((r): r is ApprovalRequest => Boolean(r) && r!.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export type ResolveResult =
  | { ok: false; status: 404 | 409; error: string }
  | { ok: true; request: ApprovalRequest; entry: AuditEntry };

/**
 * Resolve a pending approval (approve or deny). Records a signed, durable audit
 * act bound to the administrator. Authorization (CUIT match) is the caller's
 * job; this trusts the passed `approver`.
 */
export async function resolveApproval(
  id: string,
  approved: boolean,
  approver: ApproverAttestation,
): Promise<ResolveResult> {
  const req = await getReq(id);
  if (!req) return { ok: false, status: 404, error: "aprobacion_inexistente" };
  if (req.status !== "pending") return { ok: false, status: 409, error: "ya_resuelta" };

  req.status = approved ? "approved" : "denied";
  req.resolvedAt = new Date().toISOString();
  req.resolvedBy = approver.declaredBy;
  await putReq(req);
  await removePending(req.society, req.id);

  const entry = await appendAudit(
    req.society,
    {
      tool: approved ? "aprobar_accion" : "denegar_accion",
      governance: "requires-confirmation",
      approver,
      input: { tool: req.tool, argsHash: req.argsHash, argsPreview: req.argsPreview },
      output: { approved },
    },
    { durable: true },
  );
  return { ok: true, request: req, entry };
}

/**
 * Authorize (by CUIT match against the society's signed constitution) and
 * resolve. Shared by the resolve endpoint.
 */
export async function authorizeAndResolve(opts: {
  id: string;
  approved: boolean;
  adminToken: string;
  nombre?: string;
}): Promise<ResolveResult | { ok: false; status: 403; error: string }> {
  const req = await getReq(opts.id);
  if (!req) return { ok: false, status: 404, error: "aprobacion_inexistente" };
  // Possession proof: the society's admin capability token, NOT a knowable CUIT.
  if (!(await verifyAdminToken(req.society, opts.adminToken))) {
    return { ok: false, status: 403, error: "token_invalido" };
  }
  const admin = await societyAdminPrincipal(req.society);
  return resolveApproval(opts.id, opts.approved, {
    method: "self-attested",
    principal: admin ?? "cuit:unknown",
    principalKind: "declared-cuit",
    declaredBy: opts.nombre ?? "administrador",
  });
}

/** Read a society's administrator metadata via the audit log (re-exported for
 *  endpoints that gate on it). */
export { readAudit };
