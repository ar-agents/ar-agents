/**
 * POST /api/mock-psp/decide  — counterparty-simulator (the loop PROOF).
 *
 * A mock payment-service-provider deciding whether to ONBOARD / transact with an
 * Argentine automated company. It is a thin, honest COUNTERPARTY: it does NOT
 * judge the entity itself — it asks the ALREADY-LIVE public good-standing ORACLE
 * (`GET /api/registry/good-standing`) and accepts or rejects PURELY on the
 * oracle's signed answer. This is the demand side of the one loop:
 *   entities IN the registry  →  a counterparty QUERYING the oracle before
 *   transacting  →  loop proven.
 *
 * Decision rule (deterministic, conservative, fail-closed):
 *   APPROVE  ⇔  found === true
 *               AND goodStanding.state === "active"
 *               AND goodStanding.score >= MIN_SCORE
 *   REJECT   otherwise, with the reason taken from the oracle answer (state /
 *            basis / not-found), never invented here.
 *
 * `forming`, `stale`, `suspended`, `revoked`, `unverified`, or any unknown state
 * is NON-attesting → REJECT. A half-born (`forming`) or stalled (`stale`) entity
 * is explicitly NOT bankable, so a counterparty must decline.
 *
 * Server-side only: it accepts a user-supplied entity reference (url | id | cuit)
 * and, for a URL, SSRF-guards it (lib/ssrf.ts) BEFORE forwarding it to the oracle
 * — the user URL is never fetched directly here, only handed to the oracle as a
 * query param after the guard passes.
 *
 * Edge runtime, CORS-open: a browser-context agent counterparty can call it and
 * read the structured decision + the exact oracle answer it was based on.
 */

import { preflight, jsonCors } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { safeExternalUrl } from "@/lib/ssrf";

export const runtime = "edge";

/** Canonical oracle base. Overridden by the request origin so the simulator
 * works on dev/preview/prod and is mockable in tests, with this as a fallback. */
const ORACLE_SITE = "https://ar-agents.ar";

/**
 * Minimum good-standing score a counterparty requires to transact. The oracle
 * already auto-flips an entry to `active` only at score >= 60 ("C"); the mock
 * PSP holds a slightly higher bar (a real counterparty's risk appetite), so the
 * "score above a threshold" rule is a VISIBLE, independent gate, not a no-op.
 */
const MIN_SCORE = 70;

/** States the oracle can report. Only `active` is attesting; everything else
 * (forming / stale / suspended / revoked / unverified / unknown) is a reject. */
const ATTESTING_STATE = "active";

type DecideRequest = {
  url?: unknown;
  id?: unknown;
  cuit?: unknown;
};

/** The slice of the oracle answer the decision reads. The oracle body is large
 * and signed; we only depend on these fields (and forward the whole answer). */
interface OracleAnswer {
  body?: {
    found?: boolean;
    record?: { status?: string } | null;
    goodStanding?: {
      state?: string;
      score?: number | null;
      rating?: string | null;
      basis?: string;
      reason?: string;
    } | null;
  };
  // Present when the deployment has a signing key; forwarded verbatim.
  sig?: string;
  publicKey?: string;
  alg?: string;
  $schema?: string;
}

type Decision = "approve" | "reject";

/** Pure decision: given the oracle answer, accept/reject + a reason that is
 * always sourced FROM the answer (state / score / not-found), never fabricated. */
function decide(answer: OracleAnswer, minScore: number): {
  decision: Decision;
  reasonCode: string;
  reason: string;
} {
  const body = answer.body;
  if (!body || body.found !== true) {
    return {
      decision: "reject",
      reasonCode: "not_found",
      reason: "entity not found in the registry; no good-standing answer to rely on",
    };
  }

  const gs = body.goodStanding;
  const state = typeof gs?.state === "string" ? gs.state : null;
  const score = typeof gs?.score === "number" ? gs.score : null;

  if (state !== ATTESTING_STATE) {
    // Reason text comes from the oracle (its reason/basis), with the state named.
    const detail = gs?.reason || gs?.basis || "not in active good standing";
    return {
      decision: "reject",
      reasonCode: `state_${state ?? "unknown"}`,
      reason: `good-standing state is "${state ?? "unknown"}", not "${ATTESTING_STATE}": ${detail}`,
    };
  }

  if (score === null) {
    return {
      decision: "reject",
      reasonCode: "no_score",
      reason: "entity is active but the oracle reports no conformance score to rely on",
    };
  }

  if (score < minScore) {
    return {
      decision: "reject",
      reasonCode: "below_threshold",
      reason: `good-standing score ${score} is below this counterparty's threshold of ${minScore}`,
    };
  }

  return {
    decision: "approve",
    reasonCode: "active_above_threshold",
    reason: `active good standing with score ${score} (>= ${minScore}); ${gs?.basis ?? "conformance verified"}`,
  };
}

/** Resolve the entity reference into a SAFE oracle query string. Returns an
 * error string when the input is missing or (for a URL) fails the SSRF guard. */
function buildOracleQuery(
  input: DecideRequest,
): { by: "url" | "id" | "cuit"; value: string; qs: string } | { error: string } {
  const url = typeof input.url === "string" ? input.url.trim() : "";
  const id = typeof input.id === "string" ? input.id.trim() : "";
  const cuit = typeof input.cuit === "string" ? input.cuit.trim() : "";

  if (url) {
    // SSRF guard the user URL BEFORE it is forwarded to the oracle. The oracle
    // also guards it, but the simulator must never relay an unsafe target.
    const safe = safeExternalUrl(url);
    if (!safe) return { error: "invalid url (must be a public http(s) URL)" };
    return { by: "url", value: safe.origin, qs: `url=${encodeURIComponent(safe.origin)}` };
  }
  if (id) {
    if (id.length > 64) return { error: "invalid id" };
    return { by: "id", value: id, qs: `id=${encodeURIComponent(id)}` };
  }
  if (cuit) {
    const digits = cuit.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 13) return { error: "invalid cuit" };
    return { by: "cuit", value: digits, qs: `cuit=${encodeURIComponent(digits)}` };
  }
  return { error: "provide one of: url, id, cuit" };
}

/** Derive the oracle base URL from the incoming request origin (works on
 * dev/preview/prod + lets tests point it at a mock), falling back to the
 * canonical site. The path is fixed and not user-controlled — no SSRF surface. */
function oracleBase(req: Request): string {
  try {
    return new URL(req.url).origin || ORACLE_SITE;
  } catch {
    return ORACLE_SITE;
  }
}

export async function POST(req: Request): Promise<Response> {
  // Abuse damping: this route fans out one oracle GET per call.
  if (!rateLimit("mock-psp-decide", clientIp(req), 30, 60_000)) {
    return jsonCors({ error: "rate_limited" }, { status: 429 });
  }

  let input: DecideRequest;
  try {
    const raw = (await req.json()) as unknown;
    if (!raw || typeof raw !== "object") {
      return jsonCors({ error: "body must be a JSON object" }, { status: 400 });
    }
    input = raw as DecideRequest;
  } catch {
    return jsonCors({ error: "invalid JSON body" }, { status: 400 });
  }

  const resolved = buildOracleQuery(input);
  if ("error" in resolved) {
    return jsonCors({ error: resolved.error }, { status: 400 });
  }

  // Ask the ALREADY-LIVE oracle. We only READ its signed answer; we never edit
  // the registry or the oracle (Lane 1 owns those).
  const oracleUrl = `${oracleBase(req)}/api/registry/good-standing?${resolved.qs}`;
  let answer: OracleAnswer;
  try {
    const r = await fetch(oracleUrl, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!r.ok) {
      return jsonCors(
        {
          decision: "reject",
          reasonCode: "oracle_unavailable",
          reason: `the good-standing oracle returned ${r.status}; a counterparty declines when it cannot verify standing`,
          query: { by: resolved.by, value: resolved.value },
          oracle: { url: oracleUrl, status: r.status },
        },
        { status: 200 },
      );
    }
    answer = (await r.json()) as OracleAnswer;
  } catch {
    return jsonCors(
      {
        decision: "reject",
        reasonCode: "oracle_unreachable",
        reason: "the good-standing oracle was unreachable; a counterparty declines when it cannot verify standing",
        query: { by: resolved.by, value: resolved.value },
        oracle: { url: oracleUrl, status: null },
      },
      { status: 200 },
    );
  }

  const verdict = decide(answer, MIN_SCORE);

  // Return the decision AND the exact oracle answer it was based on, so the
  // result is auditable: a reader can re-verify the signed body independently.
  return jsonCors(
    {
      kind: "ar-agents.mock-psp.decision",
      version: 1,
      decidedAt: new Date().toISOString(),
      query: { by: resolved.by, value: resolved.value },
      policy: { minScore: MIN_SCORE, attestingState: ATTESTING_STATE },
      decision: verdict.decision,
      reasonCode: verdict.reasonCode,
      reason: verdict.reason,
      // The signed oracle answer this decision was based on (forwarded verbatim).
      oracleAnswer: answer,
    },
    { status: 200, headers: { "cache-control": "no-store" } },
  );
}

export async function OPTIONS(): Promise<Response> {
  return preflight();
}
