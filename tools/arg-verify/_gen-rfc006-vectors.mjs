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
import {
  createHmac,
  createHash,
  createPrivateKey,
  sign as edSign,
} from "node:crypto";

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
const anchorBodies = [];
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
  anchorBodies.push(body);
  prevAnchor = signature;
});

// ── §6.1 OTS public-anchor proof (ADDITIVE, OPTIONAL) ─────────────────────
// The trust-minimized layer: sha256(canonical(AnchorBody)) committed to the
// public Bitcoin calendars via OpenTimestamps. The SAME bytes anchorSig already
// HMAC-signs are the OTS digest, so the .ots proof and the HMAC anchor commit to
// one object. This is a DETERMINISTIC fixture (a synthetic .ots over anchor #2's
// digest with a single pending-calendar attestation) so the generator stays
// reproducible; a real proof from a live calendar carries the same shape and
// upgrades to a Bitcoin attestation over hours. `arg-verify timestamp` checks
// the digest commitment offline; `ots verify` is the full Bitcoin-header proof.
const OTS_MAGIC = Buffer.from([
  0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d,
  0x70, 0x73, 0x00, 0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2,
  0xe8, 0x84, 0xe8, 0x92, 0x94,
]);
const OTS_VERSION = 0x01;
const OTS_OP_SHA256 = 0x08;
const OTS_ATTESTATION = 0x00;
const OTS_PENDING_TAG = Buffer.from([0x83, 0xdf, 0xe3, 0x0d, 0x2e, 0xf9, 0x0c, 0x8e]);
const sha256hex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
// Digest = sha256(canonical(AnchorBody #2)) — provably the anchorSig material.
const tsAnchorBody = anchorBodies[1];
const tsDigestHex = sha256hex(canonical(tsAnchorBody));
// Synthetic pending-calendar timestamp body: ATTESTATION marker + pending tag +
// a 1-byte length + a short calendar-URI payload (deterministic placeholder).
const tsCalendarUri = Buffer.from("https://a.pool.opentimestamps.org", "utf8");
const tsPendingBody = Buffer.concat([
  Buffer.from([tsCalendarUri.length]),
  tsCalendarUri,
]);
const tsSerialized = Buffer.concat([
  Buffer.from([OTS_ATTESTATION]),
  OTS_PENDING_TAG,
  Buffer.from([tsPendingBody.length]),
  tsPendingBody,
]);
const tsOtsFile = Buffer.concat([
  OTS_MAGIC,
  Buffer.from([OTS_VERSION, OTS_OP_SHA256]),
  Buffer.from(tsDigestHex, "hex"),
  tsSerialized,
]);

// Negative chain fixtures (original hashes, tampered payloads).
const chainMutated = links.map((l) => ({ ...l }));
chainMutated[1] = {
  ...chainMutated[1],
  meta: { ...chainMutated[1].meta, amount: 1501 }, // mutated, hash unchanged
};
const chainDeleted = [links[0], links[2]].map((l) => ({ ...l })); // seq 1,3

// ── §8 export bundle (the real regulator artifact) ──────────────────────
// What Vultur's /api/society/[slug]/export actually emits: a per-society
// NON-contiguous slice (recordsOnly, §4.2) whose timestamp column is
// `createdAt` (the canonical hash material's `ts` := createdAt as ISO-8601
// UTC), wrapped with a §7 attestation under `.attestation`. Fixed Ed25519
// keypair so this vector is byte-reproducible.
const EXPORT_ED25519 = {
  privateKey:
    "MC4CAQAwBQYDK2VwBCIEIFpQhlY4dAnHvp0zbXruA/nsu5ZlxXhnReya+41U+5us",
  publicKey: "MCowBQYDK2VwAyEABXLzwau38jFXlRf48x+DcJpj6Ezj1kjO+5qJn6V+t84=",
};
const SOC = "soc_demo01";
const ET = (s) => `2026-05-17T10:00:0${s}.000Z`;
const exportGlobalRaw = [
  { societyId: null, actor: "system", action: "ledger.genesis", meta: null, ts: ET(0) },
  { societyId: SOC, actor: "mercadopago", action: "mercadopago.preapproval.create", meta: { amount: 15000, currency: "ARS" }, ts: ET(1) },
  { societyId: SOC, actor: "afip", action: "afip.factura.emitir", meta: { cae: "75123456789012", tipo: "C" }, ts: ET(2) },
  { societyId: "soc_other9", actor: "system", action: "org.member.invited", meta: { role: "AUDITOR" }, ts: ET(3) },
  { societyId: SOC, actor: "afip", action: "afip.factura.emitir", meta: { cae: "75123456789099", tipo: "C" }, ts: ET(4) },
];
let exPrev = GENESIS;
const exportGlobal = exportGlobalRaw.map((r, i) => {
  const seq = i + 1;
  const hash = linkHash({ ...r, seq, prevHash: exPrev });
  const row = { seq, prevHash: exPrev, hash, ...r };
  exPrev = hash;
  return row;
});
const exportHead = exportGlobal[exportGlobal.length - 1];
// Society slice with the real export field set (timestamp column = createdAt).
const exportEvents = exportGlobal
  .filter((e) => e.societyId === SOC)
  .map((e) => ({
    seq: e.seq,
    prevHash: e.prevHash,
    hash: e.hash,
    societyId: e.societyId,
    actor: e.actor,
    action: e.action,
    meta: e.meta,
    createdAt: e.ts,
  }));
const exportLedgerVerification = { valid: true, count: exportEvents.length };
const exportBody = {
  kind: "vultur.compliance.attestation",
  version: 1,
  issuedAt: "2026-05-17T10:05:00.000Z",
  society: { id: "cmsoc_demo", slug: "demo-sa", denominacion: "DEMO SOCIEDAD IA S.A.", cuit: "30715000017" },
  chain: {
    globalHeadSeq: exportHead.seq,
    globalHeadHash: exportHead.hash,
    societyEventCount: exportEvents.length,
    verification: exportLedgerVerification,
  },
  mode: "production",
};
const exportMaterial = canonical(exportBody);
const exportPriv = createPrivateKey({
  key: Buffer.from(EXPORT_ED25519.privateKey, "base64"),
  format: "der",
  type: "pkcs8",
});
const exportAttestation = {
  body: exportBody,
  signature: `sha256:${hmacHex(AUDIT_SECRET, exportMaterial)}`,
  sig: edSign(null, Buffer.from(exportMaterial, "utf8"), exportPriv).toString("base64"),
  publicKey: EXPORT_ED25519.publicKey,
  alg: "Ed25519",
};
const exportBundle = {
  exportedAt: "2026-05-17T10:05:00.000Z",
  society: { denominacion: exportBody.society.denominacion, slug: "demo-sa", tipo: "SA", status: "ACTIVE", cuit: exportBody.society.cuit, objeto: "Desarrollo de software", plan: "pro", createdAt: "2026-05-01T00:00:00.000Z" },
  movements: [],
  invoices: [{ cae: "75123456789012", tipo: "C", total: 15000 }],
  auditEvents: exportEvents,
  ledgerVerification: exportLedgerVerification,
  attestation: exportAttestation,
  notice: "Secrets (payment tokens, encrypted AFIP credentials) are excluded by design.",
};
// Tampered: a slice record's meta mutated, hash left intact → recordsOnly
// (§4.2) MUST flag the mutated seq; the attestation Ed25519 still verifies
// (it signs only the head summary), proving why bundle binding is required.
const exportBundleTampered = JSON.parse(JSON.stringify(exportBundle));
exportBundleTampered.auditEvents[1].meta.cae = "00000000000000";

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
  timestampProof: {
    description:
      "RFC-006 §6.1 OTS public-anchor proof (ADDITIVE, OPTIONAL). digest = SHA256(canonical(AnchorBody #2)) — the SAME bytes anchors[1].signature HMAC-signs — committed to the public OTS Bitcoin calendars. otsBase64 is a deterministic synthetic .ots over that digest with one pending-calendar attestation. A conformant verifier MUST: confirm the .ots magic header, confirm its embedded leaf digest string-equals `digest`, and report the attestation status (here: pending, no Bitcoin block yet). `node arg-verify.mjs timestamp <file.ots> --digest <digest>` performs this check offline; the full trust-minimized proof (commit -> Bitcoin header) is the official `ots verify`. NOT part of `vectors` (it needs a binary .ots file and would break the zero-dep/offline `vectors` invariant).",
    anchorSeq: tsAnchorBody.seq,
    anchorBody: tsAnchorBody,
    digestAlg: "sha256",
    digest: tsDigestHex,
    otsBase64: tsOtsFile.toString("base64"),
    expect: { magicValid: true, digestCommits: true, status: "pending" },
  },
  projection: {
    description:
      "RFC-006 §5 normative projection P(L)→RFC-004 OperationalLogEntry. Each entry MUST canonical-equal the published object, its hmac MUST string-equal, AND it MUST pass RFC-004 §3 verifyEntry with secrets.projection.",
    secret: PROJECTION_SECRET,
    entries: projection,
  },
  exportBundle: {
    description:
      "The real regulator artifact: Vultur /api/society/[slug]/export bundle. Per-society NON-contiguous slice (RFC-006 §4.2 recordsOnly); timestamp column is `createdAt` and the canonical hash material's `ts` := new Date(createdAt).toISOString(). Attestation nested under `.attestation` (RFC-006 §7/§8). A conformant verifier MUST: Ed25519-verify the attestation against its embedded SPKI publicKey; bind attestation↔bundle (chain.societyEventCount === auditEvents.length, society slug/cuit match); recordsOnly-verify every auditEvents row with the createdAt→ts mapping.",
    bundle: exportBundle,
    expect: {
      attestationValid: true,
      societyEventCount: exportEvents.length,
      recordsOnly: { valid: true, count: exportEvents.length },
    },
  },
  exportBundleTampered: {
    description:
      "auditEvents[1].meta.cae mutated, hash left intact. recordsOnly MUST flag the mutated record; the attestation Ed25519 still verifies (it signs only the head summary) — which is exactly why attestation↔bundle binding is normative.",
    bundle: exportBundleTampered,
    expect: { attestationValid: true, recordsOnly: { valid: false, brokenAtSeq: 3 } },
  },
  conformance: {
    vectorsCount:
      links.length +
      anchors.length +
      projection.length +
      2 /* neg */ +
      exportEvents.length +
      4 /* export: attest + binding + recordsOnly ok + tamper detected */,
    referenceGenerator: "tools/arg-verify/_gen-rfc006-vectors.mjs",
    independentVerifier: "tools/arg-verify/arg-verify.mjs (vectors)",
    repo: "https://github.com/ar-agents/ar-agents",
    howToClaimConformance:
      "Reproduce every link.hash, every anchor.signature, every projection.entry (canonical-equal) and its hmac (string-equal); verifyChain must match each expect block; every projected entry must pass RFC-004 §3 verifyEntry with secrets.projection. Then add your library to tools/arg-verify/CONFORMANCE-REGISTRY.md.",
  },
};

process.stdout.write(JSON.stringify(doc, null, 2) + "\n");
