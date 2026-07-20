/**
 * `POST /api/identity/verify`, the self-serve "verify your agent" endpoint.
 *
 * Proves an agent controls a signed RFC-002 identity doc, without ever holding
 * its key, then auto-lists it in our discovery format. Two submit modes:
 *
 *   - hosted:  { "origin": "https://youragent.example" }
 *              → fetch {origin}/.well-known/agents.json (SSRF-guarded) + verify.
 *   - paste:   { "doc": { identity, binding, issuedAt, ... } }
 *              → verify the pasted signed doc directly.
 *
 * The crypto lives in `@ar-agents/identity-attest/key-binding` (ed25519 +
 * evm-secp256k1 EOA + EIP-1271). We add only the transport: the SSRF-guarded
 * fetch and, for EIP-1271 smart-contract accounts, an `eth_call` to a Base RPC.
 *
 * On success the agent is persisted to the KV registry and gets a profile URL +
 * badge URL. Only the signature facts are asserted; name/operator/evidence are
 * carried through as self-declared. No score, no rating.
 *
 * Runtime: nodejs (KV + the workspace package, same as /api/constancia/*).
 */

import {
  verifyKeyBinding,
  type Eip1271RpcCall,
  type IdentityDoc as KeyBindingDoc,
} from "@ar-agents/identity-attest/key-binding";
import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, kvRateLimit, rateLimit } from "@/lib/ratelimit";
import { safeExternalUrl } from "@/lib/ssrf";
import {
  IdentityDocSchema,
  agentId,
  badgeUrl,
  extractAttribution,
  getAgentRecord,
  profileUrl,
  recordAgentEvent,
  saveAgentRecord,
  toSummary,
  type AgentRecord,
} from "@/lib/agent-registry";

export const runtime = "nodejs";

const RL_MAX = 20;
const RL_WINDOW_MS = 60_000;
const MAX_DOC_BYTES = 64 * 1024;
// Global daily ceiling on verifications (NOT per-IP). saveAgentRecord writes a
// permanent KV record, so this is a durable-write path: per the kvRateLimit
// doc, an unbounded flood of permanent records is the risk to cap. A party
// rotating IPs (or spoofing x-forwarded-for) cannot get past this shared cap.
const GLOBAL_DAILY_MAX = 5_000;
const GLOBAL_WINDOW_SEC = 86_400;

// Public RPCs for the EIP-1271 on-chain check. Fixed endpoints (not user
// controlled) → no SSRF surface. Override via env for other chains / providers.
function rpcUrlForChain(chainId?: number): string | null {
  if (chainId === 8453) return process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
  if (chainId === 84532)
    return process.env.BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org";
  return process.env.EVM_RPC_URL?.trim() || null;
}

function makeRpcCall(chainId?: number): Eip1271RpcCall {
  return async ({ to, data }) => {
    const url = rpcUrlForChain(chainId);
    if (!url) throw new Error(`no RPC configured for chainId ${chainId}`);
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to, data }, "latest"],
      }),
    });
    const j = (await res.json()) as { result?: string; error?: { message?: string } };
    if (j.error) throw new Error(j.error.message || "eth_call failed");
    return j.result || "0x";
  };
}

/** Fetch {origin}/.well-known/agents.json with an SSRF guard + size cap. */
async function fetchWellKnownDoc(
  origin: string,
): Promise<{ doc: unknown; url: string } | { error: string }> {
  const safe = safeExternalUrl(origin);
  if (!safe) {
    return { error: "origin is not a fetchable public https URL" };
  }
  const url = `${safe.origin}/.well-known/agents.json`;
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: "error", // do not follow redirects into an SSRF target
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return { error: `could not fetch ${url}` };
  }
  if (!res.ok) return { error: `${url} returned HTTP ${res.status}` };
  const text = await res.text();
  if (text.length > MAX_DOC_BYTES) return { error: "agents.json is too large" };
  try {
    return { doc: JSON.parse(text), url };
  } catch {
    return { error: `${url} did not return valid JSON` };
  }
}

async function handle(req: Request): Promise<Response> {
  const ip = clientIp(req);
  // Cheap in-memory backstop first (per-isolate), then the durable cross-isolate
  // quota. verify persists a permanent record, so the durable per-IP gate fails
  // CLOSED: a KV outage that disabled the only real quota must not wave through
  // an unbounded flood of writes. Mirrors the layered pattern in
  // /api/incorporate-preview.
  if (!rateLimit("identity-verify", ip, RL_MAX, RL_WINDOW_MS)) {
    return jsonCors(
      { error: "rate_limited", note: "20 verifications per minute per IP." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (
    !(await kvRateLimit("identity-verify", ip, RL_MAX, 60, { failClosed: true }))
  ) {
    return jsonCors(
      { error: "rate_limited", note: "20 verifications per minute per IP." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }
  if (
    !(await kvRateLimit(
      "identity-verify-global",
      "all",
      GLOBAL_DAILY_MAX,
      GLOBAL_WINDOW_SEC,
      { failClosed: true },
    ))
  ) {
    return jsonCors(
      { error: "rate_limited_global", note: "Daily verification ceiling reached." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  // Cap the request body (paste mode) the same way hosted mode caps the fetched
  // doc, so a large paste cannot force an expensive canonicalize/hash.
  const declaredLen = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLen) && declaredLen > MAX_DOC_BYTES) {
    return jsonCors(
      { error: "bad_request", note: "Body too large." },
      { status: 413 },
    );
  }

  let body: { origin?: unknown; doc?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonCors({ error: "bad_request", note: "Send JSON." }, { status: 400 });
  }

  // Resolve the doc from either mode.
  let rawDoc: unknown;
  let origin: string | null = null;
  if (typeof body.origin === "string" && body.origin.trim()) {
    const fetched = await fetchWellKnownDoc(body.origin.trim());
    if ("error" in fetched) {
      return jsonCors({ verified: false, reason: fetched.error }, { status: 400 });
    }
    rawDoc = fetched.doc;
    origin = new URL(fetched.url).origin;
  } else if (body.doc && typeof body.doc === "object") {
    rawDoc = body.doc;
  } else {
    return jsonCors(
      {
        error: "bad_request",
        note: 'Send { "origin": "https://…" } or { "doc": { … } }.',
      },
      { status: 400 },
    );
  }

  // Shape-validate before touching crypto.
  const parsed = IdentityDocSchema.safeParse(rawDoc);
  if (!parsed.success) {
    return jsonCors(
      {
        verified: false,
        reason: "doc is not a valid RFC-002 identity doc",
        issues: parsed.error.issues.slice(0, 8),
      },
      { status: 400 },
    );
  }
  const doc = parsed.data;

  // Verify the key-binding. Inject the RPC only for the EIP-1271 path.
  const result = await verifyKeyBinding(doc as unknown as KeyBindingDoc, {
    rpcCall: makeRpcCall(doc.identity.chainId),
  });

  if (!result.verified || !result.subject) {
    return jsonCors(
      { verified: false, reason: result.reason, checks: result.checks },
      { status: 200 },
    );
  }

  // Derive the handle + persist. Timestamp is metadata only (not signed).
  const now = new Date().toISOString();
  const id = agentId(result.scheme as AgentRecord["scheme"], result.subject.value);
  const attribution = extractAttribution(req);

  const recordInput: Omit<
    AgentRecord,
    "firstVerifiedAt" | "lastVerifiedAt" | "reverifyCount"
  > = {
    id,
    scheme: result.scheme as AgentRecord["scheme"],
    subject: result.subject.value,
    chainId: doc.identity.chainId,
    accountType: doc.identity.accountType,
    name: doc.agent?.name,
    operator: doc.agent?.operator,
    homepage: doc.agent?.homepage,
    jurisdiction: doc.agent?.jurisdiction,
    evidence: doc.evidence,
    origin,
    docHash: result.recomputedDocHash,
    binding: {
      scheme: doc.binding!.scheme,
      signature: doc.binding!.signature,
      statement: doc.binding!.statement,
    },
    doc,
  };

  const persisted = await saveAgentRecord(recordInput, now);
  await recordAgentEvent("verify", id, attribution, now);

  const stored = (await getAgentRecord(id)) ?? {
    ...recordInput,
    firstVerifiedAt: now,
    lastVerifiedAt: now,
    reverifyCount: 1,
  };

  return jsonCors({
    verified: true,
    id,
    scheme: result.scheme,
    subject: result.subject,
    profileUrl: profileUrl(id),
    badgeUrl: badgeUrl(id),
    persisted,
    persistNote: persisted
      ? null
      : "Verified, but this deployment has no KV wired, so the public listing was not written. The proof above is fully valid.",
    checks: result.checks,
    recoveredAddress: result.recoveredAddress,
    summary: toSummary(stored),
  });
}

export { handle as POST };

export function OPTIONS(): Response {
  return preflight();
}
