/**
 * The kill-switch state + the act of throwing it.
 *
 * A constituted Sociedad Automatizada can be SUSPENDED by its administrator: the
 * art. 102 supervision duty made operational. Suspension is authorized by
 * matching the caller's CUIT against the administrator recorded in the society's
 * signed audit log (you can only suspend a society you constituted), then
 * recorded as its own signed, durable audit entry, then flipped in the
 * suspension set. The generated society's agent consults the state (via
 * /api/suspension-status) and its central enforcement (`enforceRiskPolicy`'s
 * `isHalted`) refuses every tool while suspended.
 *
 * Storage: a Vercel KV set, with an in-memory fallback for local dev / preview.
 */

import { kv } from "@vercel/kv";
import { verifyAdminToken } from "./admin-token";
import { type ApproverAttestation, appendAudit, type AuditEntry, readAudit } from "./audit";
import { jsonCors } from "./cors";
import { clientIp, kvRateLimit, rateLimit } from "./ratelimit";

const SUSPENDED_SET = "society:suspended";
const memSuspended = new Set<string>();

// Audit-log labels of the acts that establish a society's administrator.
const INCORPORATION_TOOLS = new Set([
  "auto_incorporate",
  "incorporate_from_prompt",
  "incorporate_attested",
]);

function isKvWired(): boolean {
  return Boolean(
    process.env.KV_REST_API_URL?.trim() && process.env.KV_REST_API_TOKEN?.trim(),
  );
}

export async function setSuspended(societyId: string, suspended: boolean): Promise<void> {
  if (!isKvWired()) {
    if (suspended) memSuspended.add(societyId);
    else memSuspended.delete(societyId);
    return;
  }
  if (suspended) await kv.sadd(SUSPENDED_SET, societyId);
  else await kv.srem(SUSPENDED_SET, societyId);
}

/**
 * Whether a society is suspended. Throws on a KV error so the caller fails
 * closed: the generated agent's kill-switch (`withHalt`) refuses on a thrown
 * error, and the status endpoint surfaces the error so consumers fail closed too.
 */
export async function isSuspended(societyId: string): Promise<boolean> {
  if (!isKvWired()) return memSuspended.has(societyId);
  return Boolean(await kv.sismember(SUSPENDED_SET, societyId));
}

/**
 * The principal (e.g. `cuit:20123456786`) of the administrator who constituted
 * the society, read from the latest incorporation entry in its signed audit log.
 * null if the society has no incorporation record. This is the authorization
 * anchor for suspension: it ties the off-switch to the signed constitution.
 */
export async function societyAdminPrincipal(sessionId: string): Promise<string | null> {
  const entries = await readAudit(sessionId);
  // The EARLIEST incorporation wins: the original constituting administrator is
  // authoritative. A later (possibly forged) incorporation entry appended to the
  // same session cannot override the admin anchor — this closes the
  // re-incorporation takeover (an attacker cannot become the recognized
  // administrator by appending a second constitution to a victim's session).
  for (const e of entries) {
    if (e && INCORPORATION_TOOLS.has(e.tool) && e.approver?.principal) {
      return e.approver.principal;
    }
  }
  return null;
}

export type SuspensionResult =
  | { ok: false; status: 403 | 404; error: string }
  | { ok: true; suspended: boolean; entry: AuditEntry };

/**
 * Authorize (by the administrator CAPABILITY TOKEN, not a knowable CUIT) and
 * apply a suspend/resume, recording the act as a signed durable audit entry.
 */
export async function changeSuspension(opts: {
  society: string;
  adminToken: string;
  motivo?: string;
  suspend: boolean;
  nombre?: string;
}): Promise<SuspensionResult> {
  const admin = await societyAdminPrincipal(opts.society);
  if (!admin) return { ok: false, status: 404, error: "sociedad_sin_registro" };
  // Possession proof: the secret token minted at constitution, NOT the
  // semi-public CUIT. Knowing the administrator's CUIT is no longer enough.
  if (!(await verifyAdminToken(opts.society, opts.adminToken))) {
    return { ok: false, status: 403, error: "token_invalido" };
  }

  const approver: ApproverAttestation = {
    method: "self-attested",
    principal: admin,
    principalKind: "declared-cuit",
    declaredBy: opts.nombre ?? "administrador",
  };
  // Record the act FIRST (it is the source of truth), then flip the flag.
  const entry = await appendAudit(
    opts.society,
    {
      tool: opts.suspend ? "suspender_sociedad" : "reanudar_sociedad",
      governance: "audit-logged",
      approver,
      input: { motivo: opts.motivo?.slice(0, 500) ?? null },
      output: { suspended: opts.suspend },
    },
    { durable: true },
  );
  await setSuspended(opts.society, opts.suspend);
  return { ok: true, suspended: opts.suspend, entry };
}

/**
 * HTTP glue shared by POST /api/suspender and /api/reanudar. Rate-limits,
 * requires the administrator to reaffirm art. 102 responsibility, then
 * authorizes + records via changeSuspension.
 */
export async function handleSuspensionRequest(req: Request, suspend: boolean): Promise<Response> {
  const ip = clientIp(req);
  if (!rateLimit("suspension", ip, 20, 60 * 60_000)) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  if (!(await kvRateLimit("suspension", ip, 20, 60 * 60))) {
    return jsonCors({ ok: false, error: "rate_limited" }, { status: 429 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonCors({ ok: false, error: "bad_json" }, { status: 400 });
  }
  const b = raw as {
    society?: unknown;
    adminToken?: unknown;
    nombre?: unknown;
    motivo?: unknown;
    acepta?: unknown;
  };
  if (b.acepta !== true) {
    return jsonCors(
      {
        ok: false,
        error: "art102_no_aceptado",
        message: "Reafirmá tu responsabilidad como administrador (art. 102).",
      },
      { status: 400 },
    );
  }
  const society = typeof b.society === "string" ? b.society.trim() : "";
  const adminToken = typeof b.adminToken === "string" ? b.adminToken.trim() : "";
  const nombre = typeof b.nombre === "string" ? b.nombre.trim() : undefined;
  const motivo = typeof b.motivo === "string" ? b.motivo : undefined;
  if (!society) return jsonCors({ ok: false, error: "falta_society" }, { status: 400 });
  if (!adminToken) return jsonCors({ ok: false, error: "falta_token" }, { status: 400 });

  const r = await changeSuspension({ society, adminToken, nombre, motivo, suspend });
  if (!r.ok) return jsonCors({ ok: false, error: r.error }, { status: r.status });
  return jsonCors({ ok: true, suspended: r.suspended, society, audit: { entry: r.entry } });
}
