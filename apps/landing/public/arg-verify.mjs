#!/usr/bin/env node
/**
 * arg-verify — independent conformance + verification tool for the /arg
 * operational-log standard (RFC-004 HMAC, RFC-005 Ed25519).
 *
 * ZERO dependencies. Node built-ins only. Does not import /arg or Vultur
 * code and never makes a network call. A regulator, auditor, or journalist
 * runs this offline to:
 *
 *   1. `vectors`      Prove the published RFC-004 + RFC-005 conformance
 *                     vectors reproduce byte-for-byte against a clean-room
 *                     implementation of the spec (not the reference impl).
 *   2. `entry`        Verify a single OperationalLogEntry (RFC-004 §5 /
 *                     RFC-005 §5 flow): HMAC with a shared secret and/or
 *                     Ed25519 against a published key set.
 *   3. `attestation`  Verify a Vultur `vultur.compliance.attestation`
 *                     document offline against its embedded Ed25519 key.
 *
 * The point of (1): the cited standard is only worth citing if anyone can
 * independently reproduce its conformance vectors without trusting us.
 * The point of (3): the flagship implementation (Vultur) emits a different
 * artifact than the RFC entry shape — see CONFORMANCE.md. This tool checks
 * both so the divergence is measurable, not hand-waved.
 *
 * Usage:
 *   node arg-verify.mjs vectors [--vectors-dir DIR]
 *   node arg-verify.mjs entry <entry.json> [--secret S] [--keys keys.json]
 *   node arg-verify.mjs attestation <attestation.json> [expectedPubKeyB64]
 *
 * Exit code 0 = all checks passed, non-zero = at least one failed.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import {
  createHmac,
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  timingSafeEqual,
} from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));

// ── Canonical-JSON, RFC-004 §3 (normative) ──────────────────────────────
// Keys sorted lexicographically at every level; arrays positional; the
// `hmac` and `signature` fields stripped by the caller before signing.
// This is a clean-room reimplementation written from the RFC text, NOT a
// copy of apps/landing/src/lib/audit.ts — that is the point of an
// independent verifier.
// RFC-006 §2 domain (normative): JSON data model ONLY. Out-of-domain input
// (undefined / function / symbol / BigInt / non-finite number / array hole)
// is REJECTED, not silently serialized — because the canonical string is the
// signed material, so any value two conformant implementations could
// serialize differently is a cross-implementation signature-forgery hole
// (e.g. JSON.stringify drops an `undefined` member; a naïve serializer emits
// literal `undefined`). Byte-identical to the prior implementation on every
// valid JSON value (all 31 vectors unaffected); it only ever throws on input
// the spec now forbids.
function canonical(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value))
      throw new TypeError(
        `canonical: non-finite number out of domain (RFC-006 §2): ${value}`,
      );
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined")
    throw new TypeError(
      `canonical: ${t} is out of domain (RFC-006 §2): not a JSON value`,
    );
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (!(i in value))
        throw new TypeError(
          `canonical: array hole at index ${i} out of domain (RFC-006 §2)`,
        );
      out += (i ? "," : "") + canonical(value[i]);
    }
    return out + "]";
  }
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(",")}}`;
}

function stripForSign(entry) {
  const e = { ...entry };
  delete e.hmac;
  delete e.signature;
  return e;
}

function hmacSha256Hex(material, secret) {
  return createHmac("sha256", secret).update(material, "utf8").digest("hex");
}

function eqConstTime(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  try {
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

// ── Output helpers ──────────────────────────────────────────────────────
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RST = "\x1b[0m";
let failures = 0;
function pass(id, note = "") {
  console.log(`  ${GREEN}PASS${RST}  ${id}${note ? `  ${DIM}${note}${RST}` : ""}`);
}
function fail(id, note = "") {
  failures++;
  console.log(`  ${RED}FAIL${RST}  ${id}${note ? `  ${note}` : ""}`);
}

// ── `vectors` ───────────────────────────────────────────────────────────
function defaultVectorsDir() {
  // Repo layout: <repo>/tools/arg-verify/arg-verify.mjs
  //              <repo>/apps/landing/public/test-vectors/*.json
  return resolve(HERE, "..", "..", "apps", "landing", "public", "test-vectors");
}

function runRfc004(dir) {
  console.log(`\nRFC-004 (HMAC-SHA256 operational log) — ${DIM}rfc-004-v1.json${RST}`);
  const doc = JSON.parse(readFileSync(join(dir, "rfc-004-v1.json"), "utf8"));
  const secret = doc.secret;
  const hmacById = new Map();
  for (const v of doc.vectors) {
    if (v.expectedCanonical !== undefined) {
      const got = canonical(v.input);
      got === v.expectedCanonical
        ? pass(v.id, "canonical")
        : fail(v.id, `canonical mismatch\n        want ${v.expectedCanonical}\n        got  ${got}`);
      continue;
    }
    if (v.entry && v.expectedHmac) {
      const got = `sha256:${hmacSha256Hex(canonical(stripForSign(v.entry)), secret)}`;
      hmacById.set(v.id, got);
      if (got === v.expectedHmac) pass(v.id, "hmac");
      else fail(v.id, `hmac mismatch\n        want ${v.expectedHmac}\n        got  ${got}`);
    }
  }
  // Cross-checks (mustEqual / mustDifferFrom).
  for (const v of doc.vectors) {
    if (v.mustEqual && hmacById.has(v.id) && hmacById.has(v.mustEqual)) {
      eqConstTime(hmacById.get(v.id), hmacById.get(v.mustEqual))
        ? pass(`${v.id}·mustEqual(${v.mustEqual})`)
        : fail(`${v.id}·mustEqual(${v.mustEqual})`, "expected equal HMACs");
    }
    if (v.mustDifferFrom && hmacById.has(v.id) && hmacById.has(v.mustDifferFrom)) {
      hmacById.get(v.id) !== hmacById.get(v.mustDifferFrom)
        ? pass(`${v.id}·mustDifferFrom(${v.mustDifferFrom})`)
        : fail(`${v.id}·mustDifferFrom(${v.mustDifferFrom})`, "HMACs unexpectedly equal");
    }
  }
}

function runRfc005(dir) {
  console.log(`\nRFC-005 (Ed25519 asymmetric upgrade) — ${DIM}rfc-005-v1.json${RST}`);
  const doc = JSON.parse(readFileSync(join(dir, "rfc-005-v1.json"), "utf8"));
  const kp = doc.keypair;
  const priv = createPrivateKey({
    key: Buffer.from(kp.privateKey, "base64url"),
    format: "der",
    type: "pkcs8",
  });
  const pub = createPublicKey({
    key: Buffer.from(kp.publicKey, "base64url"),
    format: "der",
    type: "spki",
  });
  const sigById = new Map();
  for (const v of doc.vectors) {
    const msg = Buffer.from(canonical(stripForSign(v.entry)), "utf8");
    const sig = edSign(null, msg, priv);
    const b64u = sig.toString("base64url");
    sigById.set(v.id, b64u);
    const matches = b64u === v.expectedSignature.value;
    const verifies = edVerify(null, msg, pub, sig);
    if (matches && verifies) pass(v.id, "ed25519 sig + verify");
    else if (!matches)
      fail(v.id, `signature mismatch\n        want ${v.expectedSignature.value}\n        got  ${b64u}`);
    else fail(v.id, "signature did not verify against the published public key");
  }
  for (const v of doc.vectors) {
    if (v.mustDifferFrom && sigById.has(v.id) && sigById.has(v.mustDifferFrom)) {
      sigById.get(v.id) !== sigById.get(v.mustDifferFrom)
        ? pass(`${v.id}·mustDifferFrom(${v.mustDifferFrom})`)
        : fail(`${v.id}·mustDifferFrom(${v.mustDifferFrom})`, "signatures unexpectedly equal");
    }
  }
}

// ── RFC-006: hash-chained ledger + anchoring + RFC-004 projection ───────
// Clean-room reimplementation of RFC-006 §3-§6; independent of the
// generator. The §5 projection makes an RFC-006 ledger RFC-004-conformant.
const RFC004_GOV = new Set([
  "algorithm-only",
  "audit-logged",
  "mocked-upstream",
  "requires-confirmation",
]);

// RFC-006 §8 export mapping (normative): an export record's timestamp column
// is `createdAt`; the canonical hash material's `ts` is `createdAt` rendered
// as ISO-8601 UTC. Native links already carry `ts`; `ts ?? createdAt→ISO`
// makes the verifier accept BOTH the native shape and the real producer
// export shape with one code path (non-breaking — `ts` wins when present).
function linkTs(L) {
  if (L.ts != null) return L.ts;
  if (L.createdAt != null) return new Date(L.createdAt).toISOString();
  return undefined;
}

function chainLinkHash(secret, L) {
  return hmacSha256Hex(
    canonical({
      seq: L.seq,
      prevHash: L.prevHash,
      societyId: L.societyId,
      actor: L.actor,
      action: L.action,
      meta: L.meta ?? null,
      ts: linkTs(L),
    }),
    secret,
  );
}

// RFC-006 §4.2 — per-record (recordsOnly) verification. For a filtered,
// NON-contiguous slice (e.g. one society's events pulled out of the global
// chain, as the Ley-25.326 export emits) contiguity/linkage cannot hold;
// assert only that each stored hash recomputes. Proves each record is
// unmutated, NOT set-completeness — callers MUST label results recordsOnly.
function verifyRecordsOnly(events, secret) {
  for (const e of events) {
    if (!eqConstTime(chainLinkHash(secret, e), e.hash))
      return {
        valid: false,
        count: events.length,
        brokenAtSeq: e.seq,
        reason: "hash mismatch (record tampered)",
        recordsOnly: true,
      };
  }
  return { valid: true, count: events.length, recordsOnly: true };
}

function verifyChain(links, secret) {
  let prev = "GENESIS";
  for (let i = 0; i < links.length; i++) {
    const e = links[i];
    if (i > 0 && e.seq !== links[i - 1].seq + 1)
      return { valid: false, brokenAtSeq: e.seq, reason: "non-contiguous sequence" };
    if (e.prevHash !== prev)
      return { valid: false, brokenAtSeq: e.seq, reason: "prevHash mismatch (insertion/deletion)" };
    if (!eqConstTime(chainLinkHash(secret, e), e.hash))
      return { valid: false, brokenAtSeq: e.seq, reason: "hash mismatch (record tampered)" };
    prev = e.hash;
  }
  return { valid: true, count: links.length };
}

function anchorSig(secret, b) {
  return hmacSha256Hex(
    canonical({
      seq: b.seq,
      headSeq: b.headSeq,
      headHash: b.headHash,
      prevAnchor: b.prevAnchor,
      ts: b.ts,
    }),
    secret,
  );
}

function verifyAnchors(anchors, secret) {
  let prev = "GENESIS";
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (i > 0 && a.seq !== anchors[i - 1].seq + 1)
      return { valid: false, brokenAtSeq: a.seq, reason: "non-contiguous" };
    if (a.prevAnchor !== prev)
      return { valid: false, brokenAtSeq: a.seq, reason: "prevAnchor mismatch" };
    if (!eqConstTime(anchorSig(secret, a), a.signature))
      return { valid: false, brokenAtSeq: a.seq, reason: "signature mismatch" };
    prev = a.signature;
  }
  return { valid: true, count: anchors.length };
}

// RFC-006 §5 projection P(L) → RFC-004 OperationalLogEntry.
function projectLink(L, projSecret) {
  const gov =
    L.meta && typeof L.meta === "object" && RFC004_GOV.has(L.meta.governance)
      ? L.meta.governance
      : "audit-logged";
  let sid;
  if (typeof L.societyId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(L.societyId))
    sid = L.societyId;
  else if (L.societyId == null) sid = "GLOBAL-LEDGER";
  else
    sid =
      "soc-" +
      createHash("sha256").update(String(L.societyId), "utf8").digest("base64url").slice(0, 16);
  const entry = {
    id: `${L.ts}-${L.hash.slice(0, 8)}`,
    sessionId: sid,
    ts: L.ts,
    tool: L.action,
    governance: gov,
    input: { actor: L.actor, seq: L.seq, meta: L.meta ?? null },
  };
  return { ...entry, hmac: `sha256:${hmacSha256Hex(canonical(entry), projSecret)}` };
}

// RFC-004 §3 entry verification (used to prove projected entries conform).
function verifyRfc004Entry(entry, secret) {
  if (!entry || typeof entry.hmac !== "string" || !entry.hmac.startsWith("sha256:"))
    return false;
  return eqConstTime(
    entry.hmac.slice("sha256:".length),
    hmacSha256Hex(canonical(stripForSign(entry)), secret),
  );
}

function runRfc006(dir) {
  console.log(
    `\nRFC-006 (hash-chained ledger + anchoring + RFC-004 projection) — ${DIM}rfc-006-v1.json${RST}`,
  );
  const doc = JSON.parse(readFileSync(join(dir, "rfc-006-v1.json"), "utf8"));
  const aSec = doc.secrets.audit;
  const pSec = doc.secrets.projection;

  for (const L of doc.chain.links) {
    const got = chainLinkHash(aSec, L);
    eqConstTime(got, L.hash)
      ? pass(`chain·seq${L.seq}`, "link hash")
      : fail(`chain·seq${L.seq}`, `hash mismatch\n        want ${L.hash}\n        got  ${got}`);
  }
  const v = verifyChain(doc.chain.links, aSec);
  v.valid && v.count === doc.chain.expect.count
    ? pass("chain·verify", "valid contiguous chain")
    : fail("chain·verify", JSON.stringify(v));

  const m = verifyChain(doc.chainMutated.links, aSec);
  !m.valid &&
  m.brokenAtSeq === doc.chainMutated.expect.brokenAtSeq &&
  String(m.reason).includes(doc.chainMutated.expect.reasonContains)
    ? pass("chainMutated·detected", `invalid @seq${m.brokenAtSeq} (${m.reason})`)
    : fail("chainMutated·detected", JSON.stringify(m));

  const d = verifyChain(doc.chainDeleted.links, aSec);
  !d.valid
    ? pass("chainDeleted·detected", `invalid @seq${d.brokenAtSeq} (${d.reason})`)
    : fail("chainDeleted·detected", "deletion NOT detected");

  for (const a of doc.anchors.anchors) {
    eqConstTime(anchorSig(aSec, a), a.signature)
      ? pass(`anchor·seq${a.seq}`, "signature")
      : fail(`anchor·seq${a.seq}`, "signature mismatch");
  }
  const av = verifyAnchors(doc.anchors.anchors, aSec);
  av.valid && av.count === doc.anchors.expect.count
    ? pass("anchors·verify", "valid anchor chain")
    : fail("anchors·verify", JSON.stringify(av));

  const bySeq = new Map(doc.chain.links.map((l) => [l.seq, l]));
  for (const pe of doc.projection.entries) {
    const L = bySeq.get(pe.fromSeq);
    const got = projectLink(L, pSec);
    const canonEq = canonical(got) === canonical(pe.entry);
    const hmacEq = got.hmac === pe.entry.hmac;
    const rfc004ok = verifyRfc004Entry(pe.entry, pSec);
    canonEq && hmacEq && rfc004ok
      ? pass(`projection·seq${pe.fromSeq}`, "P(L) deterministic + RFC-004 §3 valid")
      : fail(
          `projection·seq${pe.fromSeq}`,
          `canonEq=${canonEq} hmacEq=${hmacEq} rfc004verify=${rfc004ok}`,
        );
  }

  // §8 export bundle (the real regulator artifact).
  if (doc.exportBundle) {
    const eb = doc.exportBundle.bundle;
    const att = eb.attestation;
    const pub = createPublicKey({
      key: Buffer.from(att.publicKey, "base64"),
      format: "der",
      type: "spki",
    });
    const attOk = edVerify(
      null,
      Buffer.from(canonical(att.body), "utf8"),
      pub,
      Buffer.from(att.sig, "base64"),
    );
    attOk
      ? pass("export·attestation", "Ed25519 valid over canonical(body)")
      : fail("export·attestation", "attestation signature did not verify");
    const bindOk =
      att.body.chain.societyEventCount === eb.auditEvents.length &&
      att.body.society.slug === eb.society.slug &&
      canonical(att.body.chain.verification) ===
        canonical(eb.ledgerVerification);
    bindOk
      ? pass("export·binding", "attestation ↔ bundle bound (count/identity/verification)")
      : fail("export·binding", "attestation does not bind to the surrounding bundle");
    const ro = verifyRecordsOnly(eb.auditEvents, doc.secrets.audit);
    ro.valid && ro.count === doc.exportBundle.expect.recordsOnly.count
      ? pass("export·recordsOnly", `${ro.count} record(s) authentic (§4.2 non-contiguous slice)`)
      : fail("export·recordsOnly", JSON.stringify(ro));

    const tb = doc.exportBundleTampered.bundle;
    const tAttOk = edVerify(
      null,
      Buffer.from(canonical(tb.attestation.body), "utf8"),
      createPublicKey({
        key: Buffer.from(tb.attestation.publicKey, "base64"),
        format: "der",
        type: "spki",
      }),
      Buffer.from(tb.attestation.sig, "base64"),
    );
    const tRo = verifyRecordsOnly(tb.auditEvents, doc.secrets.audit);
    tAttOk && !tRo.valid &&
    tRo.brokenAtSeq === doc.exportBundleTampered.expect.recordsOnly.brokenAtSeq
      ? pass(
          "exportTampered·detected",
          `attestation still valid but recordsOnly flags seq ${tRo.brokenAtSeq} — proves why §8 binding is normative`,
        )
      : fail("exportTampered·detected", JSON.stringify({ tAttOk, tRo }));
  }
}

// RFC-006 §2 canonical-JSON self-check. Asserts (a) `canonical()` reproduces
// the SPEC-correct lexicographic form on pinned vectors — including the
// integer-like-key case where the producer model `JSON.stringify(sort(v))`
// is NON-conformant (ECMAScript reorders array-index keys numeric-first; the
// spec mandates lexicographic). `canonical()` is the conformant reference;
// the producer divergence is documented in CONFORMANCE.md. And (b) it
// REJECTS every out-of-domain value rather than emit a forgeable string.
// CI-enforced via the self-defending `arg-verify` workflow.
function runDomain() {
  console.log(`\nRFC-006 §2 (canonical-JSON) — ${DIM}clean-room self-check${RST}`);
  // [value, expected canonical] — pinned to the normative lexicographic form,
  // independent of any runtime's object-key enumeration.
  const pinned = [
    [{ z: 1, a: 2, m: { y: [3, 2, 1], x: "ü" } }, '{"a":2,"m":{"x":"ü","y":[3,2,1]},"z":1}'],
    [[null, false, 0, -1, "", "→"], '[null,false,0,-1,"","→"]'],
    // The integer-like-key case: lexicographic "10" < "2" < "9" < "note".
    // Producer JSON.stringify(sort(v)) would WRONGLY emit 2,9,10,note.
    [{ "10": "j", "2": "b", "9": "i", note: "n" }, '{"10":"j","2":"b","9":"i","note":"n"}'],
    [{ "": "e", "0": "z", a: [{ c: null, b: true }] }, '{"":"e","0":"z","a":[{"b":true,"c":null}]}'],
    ["plain", '"plain"'],
    [42, "42"],
    [-7.5, "-7.5"],
    [true, "true"],
    [null, "null"],
    [[], "[]"],
    [{}, "{}"],
    // Numbers: ECMAScript Number→String (shortest round-trip).
    [1e21, "1e+21"],
    [-0, "0"],
    [1.0, "1"],
  ];
  let ok = true;
  for (const [v, expected] of pinned) {
    const got = canonical(v);
    if (got !== expected) {
      ok = false;
      fail("domain·lexicographic", `want ${expected}\n        got  ${got}`);
    }
  }
  if (ok)
    pass(
      "domain·lexicographic",
      `${pinned.length} pinned vectors match the normative form (incl. integer-like keys where the producer model is non-conformant)`,
    );

  // Strings as-is, NO Unicode normalization (RFC-006 §2): NFC e-acute
  // (U+00E9) vs NFD (e + U+0301) MUST canonicalize to their own distinct
  // bytes — verbatim JSON.stringify, no normalization applied.
  const nfc = String.fromCodePoint(0xe9);
  const nfd = "e" + String.fromCodePoint(0x301);
  canonical(nfc) === JSON.stringify(nfc) &&
  canonical(nfd) === JSON.stringify(nfd) &&
  canonical(nfc) !== canonical(nfd)
    ? pass("domain\u00b7unicode-as-is", "NFC/NFD serialized verbatim, distinct (no normalization)")
    : fail("domain\u00b7unicode-as-is", "Unicode normalization or escaping divergence");

  const sym = Symbol("s");
  const outOfDomain = [
    ["undefined", undefined],
    ["function", () => 1],
    ["symbol", sym],
    ["bigint", 10n],
    ["NaN", NaN],
    ["Infinity", Infinity],
    ["-Infinity", -Infinity],
    ["array-hole", [1, , 3]],
    ["object-undefined-member", { a: 1, b: undefined }],
    ["array-undefined-element", [1, undefined, 3]],
  ];
  for (const [name, v] of outOfDomain) {
    let threw = false;
    try {
      canonical(v);
    } catch {
      threw = true;
    }
    threw
      ? pass(`domain·reject(${name})`, "rejected (no ambiguous/forgeable output)")
      : fail(`domain·reject(${name})`, "out-of-domain value was NOT rejected");
  }
}

function cmdVectors(args) {
  const i = args.indexOf("--vectors-dir");
  const dir = i >= 0 ? resolve(args[i + 1]) : defaultVectorsDir();
  console.log(`arg-verify · conformance vectors\nvectors dir: ${dir}`);
  try {
    runDomain();
    runRfc004(dir);
    runRfc005(dir);
    runRfc006(dir);
  } catch (e) {
    console.error(`\n${RED}error${RST}: ${e.message}`);
    console.error(
      `${DIM}hint: pass --vectors-dir pointing at the dir containing rfc-004-v1.json / rfc-005-v1.json${RST}`,
    );
    process.exit(2);
  }
  console.log(
    failures === 0
      ? `\n${GREEN}ALL VECTORS PASS${RST} — the published /arg standard is independently reproducible.\n`
      : `\n${RED}${failures} CHECK(S) FAILED${RST}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

// ── `entry` (RFC-004 §5 / RFC-005 §5 verification flow) ──────────────────
function cmdEntry(args) {
  const file = args[0];
  if (!file) {
    console.error("usage: arg-verify entry <entry.json> [--secret S] [--keys keys.json]");
    process.exit(2);
  }
  const si = args.indexOf("--secret");
  const ki = args.indexOf("--keys");
  const secret = si >= 0 ? args[si + 1] : process.env.AUDIT_HMAC_SECRET;
  const keysFile = ki >= 0 ? args[ki + 1] : null;
  const entry = JSON.parse(readFileSync(resolve(file), "utf8"));
  const material = canonical(stripForSign(entry));
  let any = false;

  if (entry.hmac && secret) {
    any = true;
    const want = String(entry.hmac).replace(/^sha256:/, "");
    const got = hmacSha256Hex(material, secret);
    eqConstTime(want, got)
      ? pass("hmac", "RFC-004 §3 HMAC-SHA256 over canonical form")
      : fail("hmac", "HMAC does not match — entry altered or wrong secret");
  } else if (entry.hmac && !secret) {
    console.log(`  ${DIM}skip  hmac (no --secret / AUDIT_HMAC_SECRET given)${RST}`);
  }

  if (entry.signature) {
    if (!keysFile) {
      console.log(`  ${DIM}skip  signature (no --keys <published key set> given)${RST}`);
    } else {
      any = true;
      const keyset = JSON.parse(readFileSync(resolve(keysFile), "utf8"));
      const keys = keyset.keys ?? [keyset.keypair].filter(Boolean);
      const k = keys.find((x) => x.keyId === entry.signature.keyId);
      if (!k) {
        fail("signature", `keyId "${entry.signature.keyId}" not found in key set`);
      } else {
        const pub = createPublicKey({
          key: Buffer.from(k.publicKey, k.publicKey.includes("_") || k.publicKey.includes("-") ? "base64url" : "base64"),
          format: "der",
          type: "spki",
        });
        const ok = edVerify(
          null,
          Buffer.from(material, "utf8"),
          pub,
          Buffer.from(entry.signature.value, "base64url"),
        );
        ok
          ? pass("signature", `RFC-005 Ed25519 (keyId ${k.keyId})`)
          : fail("signature", "Ed25519 signature did not verify");
      }
    }
  }

  if (!any) {
    console.error(
      `  ${RED}nothing verifiable${RST}: entry has no hmac+secret and no signature+keys`,
    );
    process.exit(2);
  }
  process.exit(failures === 0 ? 0 : 1);
}

// ── `attestation` (Vultur vultur.compliance.attestation) ────────────────
function cmdAttestation(args) {
  const file = args[0];
  if (!file) {
    console.error("usage: arg-verify attestation <attestation.json> [expectedPubKeyB64]");
    process.exit(2);
  }
  const att = JSON.parse(readFileSync(resolve(file), "utf8"));
  const expected = args[1];
  if (expected && att.publicKey !== expected) {
    console.error(`${RED}✗${RST} embedded public key does NOT match the expected key`);
    process.exit(1);
  }
  if (!att.body || !att.sig || !att.publicKey) {
    console.error(`${RED}✗${RST} not a vultur.compliance.attestation (missing body/sig/publicKey)`);
    process.exit(1);
  }
  const pub = createPublicKey({
    key: Buffer.from(att.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  const ok = edVerify(
    null,
    Buffer.from(canonical(att.body), "utf8"),
    pub,
    Buffer.from(att.sig, "base64"),
  );
  if (!ok) {
    console.error(`${RED}✗ INVALID${RST} — attestation was altered or forged`);
    process.exit(1);
  }
  const s = att.body.society ?? {};
  const c = att.body.chain ?? {};
  console.log(`${GREEN}✓ VALID${RST} vultur.compliance.attestation`);
  console.log(`  society:    ${s.denominacion ?? "—"} (${s.slug ?? "—"})`);
  console.log(`  cuit:       ${s.cuit ?? "—"}`);
  console.log(`  issuedAt:   ${att.body.issuedAt ?? "—"}`);
  console.log(`  chainHead:  seq ${c.globalHeadSeq ?? "?"} · ${c.globalHeadHash ?? "?"}`);
  console.log(`  ledgerOK:   ${c.verification?.valid ?? "?"}`);
  console.log(
    `  ${DIM}note: this verifies the Vultur attestation shape, NOT an RFC-004 entry. See CONFORMANCE.md.${RST}`,
  );
  process.exit(0);
}

// ── `bundle` (verify a real Vultur Ley-25.326 export end-to-end) ────────
// The artifact a regulator actually downloads:
//   { exportedAt, society, movements, invoices, auditEvents,
//     ledgerVerification, attestation:{body,sig,publicKey,...}, notice }
// `arg-verify attestation` fails on it (attestation is nested, not
// top-level); `arg-verify chain` fails on it (auditEvents is a
// NON-contiguous per-society slice keyed by `createdAt`, not `ts`).
// This command verifies the whole bundle the way RFC-006 §8 specifies:
//   1. Ed25519-verify the embedded attestation (trust-free, no secret).
//   2. Bind attestation ↔ surrounding bundle (a valid attestation around
//      a swapped bundle MUST NOT pass).
//   3. recordsOnly-verify the auditEvents slice (§4.2) with the
//      createdAt→ts mapping — needs --secret (HMAC is operator-keyed;
//      honest skip + clear notice when absent).
function cmdBundle(args) {
  const file = args[0];
  if (!file) {
    console.error(
      "usage: arg-verify bundle <vultur-export-SLUG.json> [--secret S] [expectedPubKeyB64]",
    );
    process.exit(2);
  }
  const si = args.indexOf("--secret");
  const secret = si >= 0 ? args[si + 1] : process.env.AUDIT_SECRET;
  const expected = args
    .slice(1)
    .find((a, idx) => a !== "--secret" && args[idx] !== "--secret" && !a.startsWith("--"));
  const b = JSON.parse(readFileSync(resolve(file), "utf8"));
  const att = b.attestation;
  if (!att || !att.body || !att.sig || !att.publicKey) {
    console.error(
      `${RED}✗${RST} not a Vultur export bundle (missing .attestation{body,sig,publicKey})`,
    );
    process.exit(1);
  }

  // 1 · Ed25519 attestation (trust-free).
  if (expected && att.publicKey !== expected) {
    fail("attestation·pubkey", "embedded public key != expected pinned key");
  } else if (expected) {
    pass("attestation·pubkey", "matches pinned key");
  }
  const pub = createPublicKey({
    key: Buffer.from(att.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  const attOk = edVerify(
    null,
    Buffer.from(canonical(att.body), "utf8"),
    pub,
    Buffer.from(att.sig, "base64"),
  );
  attOk
    ? pass("attestation·ed25519", "signature valid over canonical(body)")
    : fail("attestation·ed25519", "signature did NOT verify — altered or forged");

  // 2 · Bind attestation ↔ bundle (defeats valid-attestation-around-swapped-bundle).
  const c = att.body.chain ?? {};
  const events = Array.isArray(b.auditEvents) ? b.auditEvents : null;
  if (!events) fail("bundle·shape", "no auditEvents array");
  else {
    c.societyEventCount === events.length
      ? pass("bundle·bind·count", `societyEventCount=${events.length}`)
      : fail(
          "bundle·bind·count",
          `attestation says ${c.societyEventCount}, bundle has ${events.length}`,
        );
  }
  const aS = att.body.society ?? {};
  const bS = b.society ?? {};
  aS.slug === bS.slug && (aS.cuit == null || aS.cuit === bS.cuit)
    ? pass("bundle·bind·identity", `${aS.slug} / ${aS.cuit ?? "—"}`)
    : fail("bundle·bind·identity", "attestation society != bundle society");
  canonical(c.verification ?? null) === canonical(b.ledgerVerification ?? null)
    ? pass("bundle·bind·verification", "attestation echoes bundle ledgerVerification")
    : fail("bundle·bind·verification", "attestation.verification != bundle.ledgerVerification");

  // 3 · recordsOnly slice (§4.2) — needs the operator HMAC secret.
  if (events && secret) {
    const r = verifyRecordsOnly(events, secret);
    r.valid
      ? pass("bundle·recordsOnly", `${r.count} record(s) authentic (non-contiguous slice)`)
      : fail(
          "bundle·recordsOnly",
          `record tampered @seq ${r.brokenAtSeq} (${r.reason})`,
        );
  } else if (events) {
    console.log(
      `  ${DIM}skip  recordsOnly (no --secret/AUDIT_SECRET; HMAC is operator-keyed. The Ed25519 attestation above is the trust-free guarantee per RFC-006 §7)${RST}`,
    );
  }

  if (failures === 0) {
    console.log(
      `\n${GREEN}✓ BUNDLE VERIFIED${RST} — ${aS.denominacion ?? "—"} (${aS.slug ?? "—"}) · head seq ${c.globalHeadSeq ?? "?"}`,
    );
    process.exit(0);
  }
  console.log(`\n${RED}✗ BUNDLE FAILED${RST} — ${failures} check(s) failed`);
  process.exit(1);
}

// ── `chain` (verify an RFC-006 ledger) ──────────────────────────────────
function cmdChain(args) {
  const file = args[0];
  if (!file) {
    console.error("usage: arg-verify chain <chain.json> --secret S");
    process.exit(2);
  }
  const si = args.indexOf("--secret");
  const secret = si >= 0 ? args[si + 1] : process.env.AUDIT_SECRET;
  if (!secret) {
    console.error("error: --secret (or AUDIT_SECRET) required");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  const links = Array.isArray(raw) ? raw : raw.links ?? raw.chain?.links;
  if (!Array.isArray(links)) {
    console.error("error: file has no link array (expect [...] or {links:[...]})");
    process.exit(2);
  }
  const r = verifyChain(links, secret);
  if (r.valid) {
    console.log(`${GREEN}✓ VALID${RST} RFC-006 chain — ${r.count} link(s), contiguous + linked + authentic`);
    process.exit(0);
  }
  console.error(`${RED}✗ INVALID${RST} RFC-006 chain — broke at seq ${r.brokenAtSeq}: ${r.reason}`);
  process.exit(1);
}

// ── `project` (RFC-006 ledger → RFC-004 entries) ────────────────────────
function cmdProject(args) {
  const file = args[0];
  if (!file) {
    console.error(
      "usage: arg-verify project <chain.json> --proj-secret P [--secret S] [--verify]",
    );
    process.exit(2);
  }
  const pi = args.indexOf("--proj-secret");
  const si = args.indexOf("--secret");
  const projSecret = pi >= 0 ? args[pi + 1] : process.env.PROJECTION_SECRET;
  if (!projSecret) {
    console.error("error: --proj-secret (or PROJECTION_SECRET) required");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(resolve(file), "utf8"));
  const links = Array.isArray(raw) ? raw : raw.links ?? raw.chain?.links;
  if (!Array.isArray(links)) {
    console.error("error: file has no link array");
    process.exit(2);
  }
  if (args.includes("--verify")) {
    const secret = si >= 0 ? args[si + 1] : process.env.AUDIT_SECRET;
    if (secret) {
      const r = verifyChain(links, secret);
      if (!r.valid) {
        console.error(
          `${RED}✗${RST} native chain invalid (seq ${r.brokenAtSeq}: ${r.reason}); refusing to project a tampered ledger`,
        );
        process.exit(1);
      }
    }
  }
  const entries = links.map((L) => projectLink(L, projSecret));
  // Self-check: every projected entry must pass RFC-004 §3.
  const allOk = entries.every((e) => verifyRfc004Entry(e, projSecret));
  if (!allOk) {
    console.error(`${RED}✗${RST} a projected entry failed RFC-004 §3 self-verify (bug)`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(entries, null, 2) + "\n");
  process.exit(0);
}

// ── `file` (detached Ed25519 signature over an arbitrary file) ──────────
// Verifies a sidecar `<file>.sig.json` manifest against the file's bytes.
// Used for published artifacts that live outside the RFC-004/005/006 entry
// shape — e.g. a PDF of the implementation reference, a spec snapshot, an
// announcement document. The manifest schema is intentionally tiny so a
// third party can reproduce it with `openssl` if they want to:
//   {
//     "file": "<basename>",
//     "sizeBytes": <int>,
//     "sha256": "<hex>",
//     "algorithm": "ed25519",
//     "keyId": "<id>",
//     "publicKey": "<base64url SPKI DER>",
//     "signature": "<base64url Ed25519 over the raw file bytes>",
//     "signedAt": "<ISO-8601>",
//     "signedBy": { "name": "...", "email": "..." },
//     "keyDirectory": "<https URL to a doc-signing-keys.json keyset>"
//   }
//
// The publicKey in the manifest is the trust root; if a caller wants to
// double-check it against the published keyset (in case the manifest was
// substituted alongside a forged signature), they can fetch
// `keyDirectory` and pass `--pubkey-b64url <expected>` to this command.
function cmdFile(args) {
  const file = args[0];
  if (!file || file.startsWith("--")) {
    console.error(
      "usage: arg-verify file <file> [--manifest <file.sig.json>] [--pubkey-b64url <expected>]",
    );
    process.exit(2);
  }
  const mi = args.indexOf("--manifest");
  const pi = args.indexOf("--pubkey-b64url");
  const manifestPath = mi >= 0 ? args[mi + 1] : `${file}.sig.json`;
  const expectedPub = pi >= 0 ? args[pi + 1] : null;

  const fileBytes = readFileSync(resolve(file));
  const manifest = JSON.parse(readFileSync(resolve(manifestPath), "utf8"));

  if (manifest.algorithm !== "ed25519") {
    fail("manifest·algorithm", `unsupported algorithm "${manifest.algorithm}" (only ed25519)`);
    process.exit(1);
  }

  // 1 · Size + SHA-256 over the raw file bytes (defense against manifest
  // pointing to a different artifact than the file the user has).
  if (typeof manifest.sizeBytes === "number") {
    fileBytes.length === manifest.sizeBytes
      ? pass("file·size", `${fileBytes.length} bytes`)
      : fail(
          "file·size",
          `manifest sizeBytes=${manifest.sizeBytes} but file has ${fileBytes.length} bytes`,
        );
  }
  const sha = createHash("sha256").update(fileBytes).digest("hex");
  if (manifest.sha256) {
    eqConstTime(sha, manifest.sha256)
      ? pass("file·sha256", `${sha.slice(0, 16)}…`)
      : fail("file·sha256", `manifest sha256=${manifest.sha256}\n        got            ${sha}`);
  }

  // 2 · Optional pinned-key check: caller supplied --pubkey-b64url, refuse
  // any manifest claiming a different one. Defeats key-swap during MITM.
  if (expectedPub) {
    eqConstTime(manifest.publicKey, expectedPub)
      ? pass("file·pinned-key", "manifest publicKey matches the expected pinned key")
      : fail(
          "file·pinned-key",
          `manifest publicKey=${manifest.publicKey}\n        expected         ${expectedPub}`,
        );
  }

  // 3 · Ed25519 verify over the raw file bytes.
  const pub = createPublicKey({
    key: Buffer.from(manifest.publicKey, "base64url"),
    format: "der",
    type: "spki",
  });
  const ok = edVerify(
    null,
    fileBytes,
    pub,
    Buffer.from(manifest.signature, "base64url"),
  );
  ok
    ? pass("file·ed25519", `signature valid · keyId ${manifest.keyId ?? "—"}`)
    : fail("file·ed25519", "Ed25519 signature did NOT verify — file or manifest tampered");

  if (failures === 0) {
    const who = manifest.signedBy
      ? `${manifest.signedBy.name ?? "—"}${manifest.signedBy.email ? ` <${manifest.signedBy.email}>` : ""}`
      : "—";
    console.log(
      `\n${GREEN}✓ FILE VERIFIED${RST} — ${manifest.file ?? file} · signed by ${who} · ${manifest.signedAt ?? "—"}`,
    );
    process.exit(0);
  }
  console.log(`\n${RED}✗ FILE FAILED${RST} — ${failures} check(s) failed`);
  process.exit(1);
}

// ── dispatch ────────────────────────────────────────────────────────────
const [cmd, ...rest] = process.argv.slice(2);
switch (cmd) {
  case "vectors":
    cmdVectors(rest);
    break;
  case "entry":
    cmdEntry(rest);
    break;
  case "attestation":
    cmdAttestation(rest);
    break;
  case "chain":
    cmdChain(rest);
    break;
  case "bundle":
    cmdBundle(rest);
    break;
  case "project":
    cmdProject(rest);
    break;
  case "file":
    cmdFile(rest);
    break;
  default:
    console.log(
      [
        "arg-verify — independent verifier for the /arg operational-log standard",
        "",
        "  node arg-verify.mjs vectors [--vectors-dir DIR]      RFC-004/005/006 vectors",
        "  node arg-verify.mjs entry <entry.json> [--secret S] [--keys keys.json]",
        "  node arg-verify.mjs attestation <attestation.json> [expectedPubKeyB64]",
        "  node arg-verify.mjs chain <chain.json> --secret S    RFC-006 ledger",
        "  node arg-verify.mjs bundle <vultur-export-SLUG.json> [--secret S] [pubkeyB64]",
        "  node arg-verify.mjs project <chain.json> --proj-secret P [--secret S --verify]",
        "  node arg-verify.mjs file <file> [--manifest <file.sig.json>] [--pubkey-b64url X]",
        "",
        "Zero dependencies. Offline. RFC-004 (HMAC) · RFC-005 (Ed25519) ·",
        "RFC-006 (hash-chained ledger + anchoring, projects onto RFC-004).",
        "See CONFORMANCE.md for the RFC ⇄ Vultur (@vultur/core) mapping.",
      ].join("\n"),
    );
    process.exit(cmd ? 2 : 0);
}
