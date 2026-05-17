#!/usr/bin/env node
/**
 * Deterministic generator for /test-vectors/rfc-006-v1.json.
 *
 * This is the "reference" side. The independent check is arg-verify.mjs,
 * which reimplements canonical/HMAC/projection clean-room and asserts every
 * value here reproduces. Re-run to regenerate (idempotent):
 *
 *   node tools/arg-verify/_gen-rfc006-vectors.mjs > \
 *     apps/landing/public/test-vectors/rfc-006-v1.json
 */
import { createHmac, createHash } from "node:crypto";

// RFC-006 §2 canonical-JSON (tightens RFC-004 §3): code-point key order +
// restricted domain (throws outside it). Mirrors arg-verify.mjs exactly so
// the generator and the independent verifier cannot drift.
function cpCompare(a, b) {
  const ai = Array.from(a);
  const bi = Array.from(b);
  const n = Math.min(ai.length, bi.length);
  for (let i = 0; i < n; i++) {
    const x = ai[i].codePointAt(0);
    const y = bi[i].codePointAt(0);
    if (x !== y) return x - y;
  }
  return ai.length - bi.length;
}
function canonical(v) {
  const t = typeof v;
  if (v === null) return "null";
  if (t === "string" || t === "boolean") return JSON.stringify(v);
  if (t === "number") {
    if (!Number.isFinite(v) || !Number.isSafeInteger(v))
      throw new Error(`RFC-006 §2: non-canonicalizable number ${String(v)}`);
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) {
    return `[${v
      .map((x) => {
        if (x === undefined || typeof x === "function" || typeof x === "symbol")
          throw new Error("RFC-006 §2: array element out of domain");
        return canonical(x);
      })
      .join(",")}]`;
  }
  if (t === "object") {
    return `{${Object.keys(v)
      .sort(cpCompare)
      .map((k) => {
        const cv = v[k];
        if (cv === undefined || typeof cv === "function" || typeof cv === "symbol")
          throw new Error(`RFC-006 §2: object value out of domain at ${JSON.stringify(k)}`);
        return `${JSON.stringify(k)}:${canonical(cv)}`;
      })
      .join(",")}}`;
  }
  throw new Error(`RFC-006 §2: value out of domain (type ${t})`);
}
function stripForSign(e) {
  const o = { ...e };
  delete o.hmac;
  delete o.signature;
  return o;
}
const hmacHex = (secret, msg) =>
  createHmac("sha256", secret).update(msg, "utf8").digest("hex");
const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sha256b64url = (s) =>
  b64url(createHash("sha256").update(s, "utf8").digest());

const AUDIT_SECRET = "rfc-006-conformance-secret";
const PROJECTION_SECRET = "rfc-006-projection-secret";
const GENESIS = "GENESIS";
const GOV = new Set([
  "algorithm-only",
  "audit-logged",
  "mocked-upstream",
  "requires-confirmation",
]);

// ── §3 chain ────────────────────────────────────────────────────────────
function linkHash(p) {
  return hmacHex(
    AUDIT_SECRET,
    canonical({
      seq: p.seq,
      prevHash: p.prevHash,
      societyId: p.societyId,
      actor: p.actor,
      action: p.action,
      meta: p.meta ?? null,
      ts: p.ts,
    }),
  );
}
const rawLinks = [
  {
    societyId: null,
    actor: "system",
    action: "ledger.genesis",
    meta: null,
    ts: "2026-05-11T00:00:00.000Z",
  },
  {
    societyId: "soc_abc12345",
    actor: "mercadopago",
    action: "mercadopago.preapproval.create",
    meta: { amount: 1500, currency: "ARS", governance: "audit-logged" },
    ts: "2026-05-11T00:00:01.000Z",
  },
  {
    societyId: "soc_abc12345",
    actor: "afip",
    action: "afip.factura.emitir",
    meta: { cae: "75123456789012", governance: "requires-confirmation" },
    ts: "2026-05-11T00:00:02.000Z",
  },
];
const links = [];
let prevHash = GENESIS;
rawLinks.forEach((r, i) => {
  const payload = { seq: i + 1, prevHash, ...r };
  const hash = linkHash(payload);
  links.push({ ...payload, hash });
  prevHash = hash;
});

// ── §5 projection P(L) → RFC-004 OperationalLogEntry ────────────────────
function sessionId(societyId) {
  if (!(typeof societyId === "string" || societyId === null || societyId === undefined))
    throw new Error("RFC-006 §5: societyId MUST be string|null");
  const s = societyId ?? null;
  if (s !== null && (s === "GLOBAL-LEDGER" || s.startsWith("soc-")))
    throw new Error(`RFC-006 §5: societyId "${s}" is reserved`);
  if (typeof s === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(s)) return s;
  if (s === null) return "GLOBAL-LEDGER";
  return "soc-" + sha256b64url(s).slice(0, 16);
}
function project(L) {
  const hasGov =
    L.meta && typeof L.meta === "object" && GOV.has(L.meta.governance);
  const governance = hasGov ? L.meta.governance : "requires-confirmation";
  const input = hasGov
    ? { actor: L.actor, seq: L.seq, meta: L.meta ?? null }
    : { actor: L.actor, governanceInferred: true, seq: L.seq, meta: L.meta ?? null };
  const entry = {
    id: `${L.ts}-${L.hash.slice(0, 16)}`,
    sessionId: sessionId(L.societyId),
    ts: L.ts,
    tool: L.action,
    governance,
    input,
  };
  const hmac = `sha256:${hmacHex(PROJECTION_SECRET, canonical(stripForSign(entry)))}`;
  return { ...entry, hmac };
}
const projection = links.map((L) => ({ fromSeq: L.seq, entry: project(L) }));

// ── §6 anchors ──────────────────────────────────────────────────────────
function anchorSig(b) {
  return hmacHex(AUDIT_SECRET, canonical(b));
}
const anchorsRaw = [
  { headSeq: 2, headHash: links[1].hash, ts: "2026-05-11T00:01:00.000Z" },
  { headSeq: 3, headHash: links[2].hash, ts: "2026-05-11T00:02:00.000Z" },
];
const anchors = [];
let prevAnchor = GENESIS;
anchorsRaw.forEach((a, i) => {
  const body = {
    seq: i + 1,
    headSeq: a.headSeq,
    headHash: a.headHash,
    prevAnchor,
    ts: a.ts,
  };
  const signature = anchorSig(body);
  anchors.push({ ...body, signature });
  prevAnchor = signature;
});

// Negative chain fixtures (original hashes, tampered payloads).
const chainMutated = links.map((l) => ({ ...l }));
chainMutated[1] = {
  ...chainMutated[1],
  meta: { ...chainMutated[1].meta, amount: 1501 }, // mutated, hash unchanged
};
const chainDeleted = [links[0], links[2]].map((l) => ({ ...l })); // seq 1,3
const chainTruncated = [links[0], links[1]].map((l) => ({ ...l })); // seq 1,2 — clean prefix, tail dropped
const recordsOnly = [links[1], links[2]].map((l) => ({ ...l })); // per-society slice soc_abc12345 = seq 2,3

const doc = {
  $schema: "https://ar-agents.ar/test-vectors/rfc-006-v1.schema.json",
  spec: "https://ar-agents.ar/rfcs/006",
  version: "rfc-006-v1-draft",
  publishedAt: "2026-05-17",
  notes:
    "Conformance vectors for RFC-006 v1 (hash-chained ledger + external anchoring profile, extends RFC-004). Deterministic + reproducible: re-run tools/arg-verify/_gen-rfc006-vectors.mjs and every value holds. arg-verify.mjs reimplements canonical/HMAC/projection clean-room and asserts every value here. License: CC-BY-4.0.",
  secrets: { audit: AUDIT_SECRET, projection: PROJECTION_SECRET },
  chain: {
    description:
      "Genesis-rooted 3-link chain. verifyChain MUST return valid:true. Each link.hash = HMAC-SHA256(audit, canonical({seq,prevHash,societyId,actor,action,meta:meta??null,ts})).",
    genesis: GENESIS,
    links,
    expect: { valid: true, count: 3 },
  },
  chainMutated: {
    description:
      "Same links but link seq=2 meta.amount mutated 1500→1501 while keeping the original hash. verifyChain MUST return valid:false at seq 2 (hash mismatch).",
    links: chainMutated,
    expect: { valid: false, brokenAtSeq: 2, reasonContains: "hash" },
  },
  chainDeleted: {
    description:
      "Middle link (seq 2) removed; links seq 1 and 3 retain original hashes. verifyChain MUST return valid:false (contiguity or prevHash linkage break).",
    links: chainDeleted,
    expect: { valid: false, brokenAtSeq: 3 },
  },
  chainTruncated: {
    description:
      "Tail link (seq 3) dropped: a clean genesis-rooted prefix. Bare verifyChain MUST return valid:true — a key-holding operator CAN truncate the tail and the chain alone cannot detect it. verifyChainAnchored with the §6 anchors MUST return valid:false: the latest external anchor covers headSeq 3 but the chain head is seq 2. This is exactly the RFC-006 §4.0/§6 operator-defense and why anchoring is MUST, not SHOULD.",
    links: chainTruncated,
    expect: { bareValid: true, anchoredValid: false },
  },
  recordsOnly: {
    description:
      "Non-contiguous per-society slice (society soc_abc12345 = seq 2,3). Every record is authentic (per-record hash holds) but set-completeness is NOT proven; verifyChain MUST return valid:false and a verifier MUST label such a result recordsOnly (RFC-006 §4.2). Documents the explicit non-guarantee so it is not mistaken for a completeness proof.",
    links: recordsOnly,
    expect: { recordsAuthentic: true, contiguousValid: false },
  },
  anchors: {
    description:
      "2-anchor chain over the §3 chain head. signature_n = HMAC-SHA256(audit, canonical(AnchorBody)); prevAnchor links to previous signature; genesis prevAnchor = 'GENESIS'.",
    genesis: GENESIS,
    anchors,
    expect: { valid: true, count: 2 },
  },
  projection: {
    description:
      "RFC-006 §5 normative projection P(L)→RFC-004 OperationalLogEntry. Each entry MUST canonical-equal the published object, its hmac MUST string-equal, AND it MUST pass RFC-004 §3 verifyEntry with secrets.projection.",
    secret: PROJECTION_SECRET,
    entries: projection,
  },
  conformance: {
    vectorsCount:
      links.length /* chain hashes */ +
      1 /* chain·verify */ +
      1 /* chain·anchored */ +
      3 /* chainMutated + chainDeleted + chainTruncated */ +
      1 /* recordsOnly */ +
      anchors.length +
      1 /* anchors·verify */ +
      projection.length,
    referenceGenerator: "tools/arg-verify/_gen-rfc006-vectors.mjs",
    independentVerifier: "tools/arg-verify/arg-verify.mjs (vectors)",
    repo: "https://github.com/ar-agents/ar-agents",
    howToClaimConformance:
      "Use RFC-006 §2 canonical (code-point key order; throws outside the safe-integer/string/bool/null/array/object domain). Reproduce every link.hash, every anchor.signature, every projection.entry (canonical-equal) and its hmac (string-equal). verifyChain/verifyAnchors must reject empty, non-genesis-rooted, and non-contiguous input. verifyChainAnchored MUST hold for chain (head==latest verified anchor) and MUST reject chainTruncated. recordsOnly MUST verify per-record yet fail contiguous verification. Every projected entry (P1-3: the verifier's OWN P(L) output, not the published one) MUST pass RFC-004 §3 verifyEntry with secrets.projection. Then add your library to tools/arg-verify/CONFORMANCE-REGISTRY.md.",
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
