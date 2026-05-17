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

// RFC-004 §3 canonical-JSON (normative).
function canonical(v) {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  return `{${Object.keys(v)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`)
    .join(",")}}`;
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
  if (typeof societyId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(societyId))
    return societyId;
  if (societyId == null) return "GLOBAL-LEDGER";
  return "soc-" + sha256b64url(String(societyId)).slice(0, 16);
}
function project(L) {
  const governance =
    L.meta &&
    typeof L.meta === "object" &&
    GOV.has(L.meta.governance)
      ? L.meta.governance
      : "audit-logged";
  const entry = {
    id: `${L.ts}-${L.hash.slice(0, 8)}`,
    sessionId: sessionId(L.societyId),
    ts: L.ts,
    tool: L.action,
    governance,
    input: { actor: L.actor, seq: L.seq, meta: L.meta ?? null },
  };
  const hmac = `sha256:${hmacHex(PROJECTION_SECRET, canonical(entry))}`;
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
      links.length + anchors.length + projection.length + 2 /* neg */,
    referenceGenerator: "tools/arg-verify/_gen-rfc006-vectors.mjs",
    independentVerifier: "tools/arg-verify/arg-verify.mjs (vectors)",
    repo: "https://github.com/ar-agents/ar-agents",
    howToClaimConformance:
      "Reproduce every link.hash, every anchor.signature, every projection.entry (canonical-equal) and its hmac (string-equal); verifyChain must match each expect block; every projected entry must pass RFC-004 §3 verifyEntry with secrets.projection. Then add your library to tools/arg-verify/CONFORMANCE-REGISTRY.md.",
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
