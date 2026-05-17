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

// ── Canonical-JSON (RFC-006 §2, tightens RFC-004 §3) ────────────────────
// Clean-room (not a copy of the reference impl). Two hardenings make the
// predicate runtime-independent (red-team P0-1/P0-2):
//   (a) object keys ordered by Unicode CODE POINT, not UTF-16 code unit —
//       JS default .sort() is code-unit and disagrees with Python/Go/JCS
//       on astral-plane keys (false "tampered" across conformant impls);
//   (b) the signable domain is restricted so canonical() can never emit
//       non-JSON (`{"a":[1,,2]}`, bare `undefined`, `NaN`→`null`) or a
//       runtime-dependent number — anything outside it THROWS.
function cpCompare(a, b) {
  const ai = Array.from(a); // string iterator → code points, not UTF-16 units
  const bi = Array.from(b);
  const n = Math.min(ai.length, bi.length);
  for (let i = 0; i < n; i++) {
    const x = ai[i].codePointAt(0);
    const y = bi[i].codePointAt(0);
    if (x !== y) return x - y;
  }
  return ai.length - bi.length;
}
function canonical(value) {
  const t = typeof value;
  if (value === null) return "null";
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value))
      throw new Error(
        `RFC-006 §2: only finite safe-integer numbers are canonicalizable (got ${String(value)})`,
      );
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((v) => {
        if (v === undefined || typeof v === "function" || typeof v === "symbol")
          throw new Error(
            "RFC-006 §2: array element out of canonical domain (undefined/function/symbol)",
          );
        return canonical(v);
      })
      .join(",")}]`;
  }
  if (t === "object") {
    const keys = Object.keys(value).sort(cpCompare);
    return `{${keys
      .map((k) => {
        const cv = value[k];
        if (cv === undefined || typeof cv === "function" || typeof cv === "symbol")
          throw new Error(
            `RFC-006 §2: object value out of canonical domain at key ${JSON.stringify(k)}`,
          );
        return `${JSON.stringify(k)}:${canonical(cv)}`;
      })
      .join(",")}}`;
  }
  throw new Error(`RFC-006 §2: value out of canonical domain (type ${t})`);
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

function chainLinkHash(secret, L) {
  return hmacSha256Hex(
    canonical({
      seq: L.seq,
      prevHash: L.prevHash,
      societyId: L.societyId,
      actor: L.actor,
      action: L.action,
      meta: L.meta ?? null,
      ts: L.ts,
    }),
    secret,
  );
}

// Hardened (red-team P0-3). The bare chain only proves INTERIOR integrity.
// A key-holding operator can still tail-truncate or wholesale-rewrite a
// genesis-rooted chain and have it verify. So a passing contiguous chain
// requires: non-empty, starts at seq 1 with prevHash GENESIS (a forged
// 1-link "fresh history" still passes THIS — completeness vs the operator
// is only provable via an external anchor, see verifyChainAnchored).
function verifyChain(links, secret) {
  if (!Array.isArray(links) || links.length === 0)
    return { valid: false, reason: "empty/non-array chain (no provable history)" };
  if (links[0].seq !== 1)
    return {
      valid: false,
      brokenAtSeq: links[0].seq,
      reason: "chain does not start at seq 1 (head truncation)",
    };
  if (links[0].prevHash !== "GENESIS")
    return {
      valid: false,
      brokenAtSeq: links[0].seq,
      reason: "first link prevHash is not GENESIS",
    };
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
  const head = links[links.length - 1];
  return { valid: true, count: links.length, headSeq: head.seq, headHash: head.hash };
}

// Operator-defense (RFC-006 §4.0/§6). The ONLY thing that stops a
// key-holding operator from tail-truncating or rewriting wholesale is an
// external anchor: require the chain head to equal the head covered by the
// latest VERIFIED anchor. Without anchors, completeness vs the operator is
// not provable — say so honestly rather than returning a misleading pass.
function verifyChainAnchored(links, secret, anchors) {
  const c = verifyChain(links, secret);
  if (!c.valid) return c;
  if (!Array.isArray(anchors) || anchors.length === 0)
    return {
      valid: false,
      reason: "no external anchors: completeness/operator-defense not provable",
    };
  const a = verifyAnchors(anchors, secret);
  if (!a.valid)
    return { valid: false, reason: `anchor chain invalid: ${a.reason}`, brokenAtSeq: a.brokenAtSeq };
  const last = anchors[anchors.length - 1];
  if (last.headSeq !== c.headSeq || last.headHash !== c.headHash)
    return {
      valid: false,
      brokenAtSeq: c.headSeq,
      reason: `chain head (seq ${c.headSeq}) ≠ latest external anchor (seq ${last.headSeq}) — tail truncation or rewrite`,
    };
  return { valid: true, count: c.count, anchoredHeadSeq: last.headSeq };
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
  if (!Array.isArray(anchors) || anchors.length === 0)
    return { valid: false, reason: "empty/non-array anchor chain" };
  if (anchors[0].seq !== 1)
    return { valid: false, brokenAtSeq: anchors[0].seq, reason: "anchors do not start at seq 1" };
  if (anchors[0].prevAnchor !== "GENESIS")
    return { valid: false, brokenAtSeq: anchors[0].seq, reason: "first anchor prevAnchor is not GENESIS" };
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

// RFC-006 §5 projection P(L) → RFC-004 OperationalLogEntry. Hardened
// (red-team P0-4 / P1-2):
//   • societyId MUST be string|null — no String() coercion (1 and "1"
//     must not collide); reserved values that alias a derived sessionId
//     ("GLOBAL-LEDGER", "soc-"-prefixed) are rejected.
//   • id carries 16 hex of hash (64-bit) not 8 (32-bit) — kills the
//     birthday collision at realistic same-ts ledger sizes.
//   • missing governance projects to the MOST operator-onerous class
//     ("requires-confirmation"), never a liability-sharing default, and
//     is flagged governanceInferred so the lossy point is auditable.
//   • HMAC over stripForSign(entry) for symmetry with verifyRfc004Entry.
function projectLink(L, projSecret) {
  if (!(typeof L.societyId === "string" || L.societyId === null || L.societyId === undefined))
    throw new Error("RFC-006 §5: societyId MUST be string|null (no type coercion)");
  const sidRaw = L.societyId ?? null;
  if (sidRaw !== null && (sidRaw === "GLOBAL-LEDGER" || sidRaw.startsWith("soc-")))
    throw new Error(`RFC-006 §5: societyId "${sidRaw}" is reserved (aliases a derived sessionId)`);
  let sid;
  if (typeof sidRaw === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(sidRaw)) sid = sidRaw;
  else if (sidRaw === null) sid = "GLOBAL-LEDGER";
  else
    sid =
      "soc-" +
      createHash("sha256").update(sidRaw, "utf8").digest("base64url").slice(0, 16);
  const hasGov =
    L.meta && typeof L.meta === "object" && RFC004_GOV.has(L.meta.governance);
  const governance = hasGov ? L.meta.governance : "requires-confirmation";
  const input = hasGov
    ? { actor: L.actor, seq: L.seq, meta: L.meta ?? null }
    : { actor: L.actor, governanceInferred: true, seq: L.seq, meta: L.meta ?? null };
  const entry = {
    id: `${L.ts}-${L.hash.slice(0, 16)}`,
    sessionId: sid,
    ts: L.ts,
    tool: L.action,
    governance,
    input,
  };
  return {
    ...entry,
    hmac: `sha256:${hmacSha256Hex(canonical(stripForSign(entry)), projSecret)}`,
  };
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

  // P0-3: operator-defense only holds with a verified external anchor.
  const ca = verifyChainAnchored(doc.chain.links, aSec, doc.anchors.anchors);
  ca.valid
    ? pass("chain·anchored", "head matches latest verified external anchor")
    : fail("chain·anchored", JSON.stringify(ca));

  // P1-4: tail truncation. The bare chain CANNOT catch it (a clean prefix
  // verifies); only the external anchor does. This vector proves both.
  if (doc.chainTruncated) {
    const bare = verifyChain(doc.chainTruncated.links, aSec);
    const anch = verifyChainAnchored(doc.chainTruncated.links, aSec, doc.anchors.anchors);
    bare.valid && !anch.valid
      ? pass("chainTruncated·detected", `bare chain passes (prefix), anchor rejects: ${anch.reason}`)
      : fail("chainTruncated·detected", `bare=${JSON.stringify(bare)} anchored=${JSON.stringify(anch)}`);
  }

  // P1-4: recordsOnly non-guarantee. A non-contiguous per-society slice:
  // every record is authentic, but completeness is NOT proven and MUST be
  // labelled. Demonstrate: per-record hash holds, contiguous verify fails.
  if (doc.recordsOnly) {
    const recs = doc.recordsOnly.links;
    const allAuthentic = recs.every((e) => eqConstTime(chainLinkHash(aSec, e), e.hash));
    const contiguous = verifyChain(recs, aSec);
    allAuthentic && !contiguous.valid
      ? pass("recordsOnly·non-guarantee", "records authentic; completeness explicitly NOT claimed")
      : fail("recordsOnly·non-guarantee", `authentic=${allAuthentic} contiguous=${JSON.stringify(contiguous)}`);
  }

  const bySeq = new Map(doc.chain.links.map((l) => [l.seq, l]));
  for (const pe of doc.projection.entries) {
    const L = bySeq.get(pe.fromSeq);
    const got = projectLink(L, pSec);
    const canonEq = canonical(got) === canonical(pe.entry);
    const hmacEq = got.hmac === pe.entry.hmac;
    // P1-3: verify OUR re-derived projection, not the vector-supplied one,
    // so the RFC-004-validity check is independent, not circular.
    const rfc004ok = verifyRfc004Entry(got, pSec);
    canonEq && hmacEq && rfc004ok
      ? pass(`projection·seq${pe.fromSeq}`, "P(L) deterministic + RFC-004 §3 valid")
      : fail(
          `projection·seq${pe.fromSeq}`,
          `canonEq=${canonEq} hmacEq=${hmacEq} rfc004verify=${rfc004ok}`,
        );
  }
}

function cmdVectors(args) {
  const i = args.indexOf("--vectors-dir");
  const dir = i >= 0 ? resolve(args[i + 1]) : defaultVectorsDir();
  console.log(`arg-verify · conformance vectors\nvectors dir: ${dir}`);
  try {
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
        // P1-1: RFC-005 §4 mandates base64url for the key set. Decode it
        // unconditionally — the old includes('_'||'-') heuristic mis-typed
        // ~27% of valid keys as std base64 and reported compliant
        // operators as non-conformant. Fail explicitly if the SPKI doesn't
        // parse rather than silently mis-decoding.
        let pub = null;
        try {
          pub = createPublicKey({
            key: Buffer.from(k.publicKey, "base64url"),
            format: "der",
            type: "spki",
          });
        } catch {
          fail(
            "signature",
            `publicKey for keyId "${k.keyId}" is not valid base64url SPKI Ed25519 (RFC-005 §4)`,
          );
        }
        if (pub) {
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
  if (expected) {
    if (!eqConstTime(String(att.publicKey ?? ""), expected)) {
      console.error(`${RED}✗${RST} embedded public key does NOT match the expected (pinned) key`);
      process.exit(1);
    }
  } else {
    // P2: do not silently skip pinning — a self-signed attestation
    // verifies against its own embedded key, which proves nothing about
    // WHOSE key it is. Say so loudly.
    console.error(
      `${DIM}warning: no expected public key passed — key pinning DISABLED. ` +
        `This proves the doc is internally consistent, NOT that it is the ` +
        `key published at the operator's /.well-known. Pass the expected ` +
        `key as arg 2 for a trust-anchored check.${RST}`,
    );
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

// ── `chain` (verify an RFC-006 ledger) ──────────────────────────────────
function cmdChain(args) {
  const file = args[0];
  if (!file) {
    console.error("usage: arg-verify chain <chain.json> --secret S [--anchors anchors.json]");
    process.exit(2);
  }
  const si = args.indexOf("--secret");
  const ai = args.indexOf("--anchors");
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
  if (ai >= 0) {
    const araw = JSON.parse(readFileSync(resolve(args[ai + 1]), "utf8"));
    const anchors = Array.isArray(araw) ? araw : araw.anchors ?? araw.anchors?.anchors;
    const r = verifyChainAnchored(links, secret, anchors);
    if (r.valid) {
      console.log(
        `${GREEN}✓ VALID${RST} RFC-006 chain — ${r.count} link(s), head anchored at seq ${r.anchoredHeadSeq} (operator-defense holds)`,
      );
      process.exit(0);
    }
    console.error(`${RED}✗ INVALID${RST} RFC-006 anchored chain — ${r.reason}`);
    process.exit(1);
  }
  const r = verifyChain(links, secret);
  if (r.valid) {
    console.log(
      `${GREEN}✓ VALID${RST} RFC-006 chain — ${r.count} link(s), contiguous + linked + authentic`,
    );
    console.error(
      `${DIM}note: interior integrity only. Pass --anchors <anchors.json> to ` +
        `prove completeness vs the key-holding operator (RFC-006 §4.0/§6).${RST}`,
    );
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
  case "project":
    cmdProject(rest);
    break;
  default:
    console.log(
      [
        "arg-verify — independent verifier for the /arg operational-log standard",
        "",
        "  node arg-verify.mjs vectors [--vectors-dir DIR]      RFC-004/005/006 vectors",
        "  node arg-verify.mjs entry <entry.json> [--secret S] [--keys keys.json]",
        "  node arg-verify.mjs attestation <attestation.json> [expectedPubKeyB64]",
        "  node arg-verify.mjs chain <chain.json> --secret S [--anchors a.json]",
        "  node arg-verify.mjs project <chain.json> --proj-secret P [--secret S --verify]",
        "",
        "Zero dependencies. Offline. RFC-004 (HMAC) · RFC-005 (Ed25519) ·",
        "RFC-006 (hash-chained ledger + anchoring, projects onto RFC-004).",
        "See CONFORMANCE.md for the RFC ⇄ Vultur (@vultur/core) mapping.",
      ].join("\n"),
    );
    process.exit(cmd ? 2 : 0);
}
