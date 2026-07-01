#!/usr/bin/env node
/**
 * arg-portability.mjs — standalone, DEPENDENCY-FREE verifier + replayer for an
 * ar-agents Portability Bundle. Node built-ins only (node:fs, node:crypto). No
 * network, no ar-agents infrastructure, nothing from the app. This is the literal
 * "we do not hold your data hostage" proof: anyone can verify a bundle and
 * reconstruct the entity's registry state with stock Node.
 *
 *   node arg-portability.mjs verify <bundle.json> [expectedPublicKeyB64]
 *   node arg-portability.mjs replay <bundle.json> [expectedPublicKeyB64]
 *
 * Exit 0 iff all checks pass, non-zero otherwise. Sibling of arg-verify.mjs.
 * `canonical006` and the `scoreEntry` port are copied byte-identical from the app
 * (apps/landing/src/lib/canonical006.ts + good-standing-score.ts); a frozen test
 * vector pins them against drift.
 */
import { readFileSync } from "node:fs";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";

const BUNDLE_KIND = "ar-agents.portability.bundle.v1";
const MANIFEST_KIND = "ar-agents.portability.manifest.v1";

// ── canonical006 — BYTE-IDENTICAL to apps/landing/src/lib/canonical006.ts ──────
function canonical006(value) {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`canonical: non-finite number out of domain: ${value}`);
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (t === "bigint" || t === "function" || t === "symbol" || t === "undefined") {
    throw new TypeError(`canonical: ${t} is out of domain: not a JSON value`);
  }
  if (Array.isArray(value)) {
    let out = "[";
    for (let i = 0; i < value.length; i++) {
      if (!(i in value)) throw new TypeError(`canonical: array hole at index ${i}`);
      out += (i ? "," : "") + canonical006(value[i]);
    }
    return out + "]";
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical006(value[k])}`).join(",")}}`;
}

function sha256Hex(s) {
  return createHash("sha256").update(Buffer.from(s, "utf8")).digest("hex");
}

function normB64(s) {
  return String(s).replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
}

// ── scoreEntry port — BYTE-IDENTICAL to good-standing-score.ts ─────────────────
const DIMENSION_WEIGHTS = { conformance: 0.45, freshness: 0.2, liveness: 0.2, incidents: 0.15 };
const FRESH_FULL_DAYS = 7;
const FRESH_ZERO_DAYS = 90;
const DAY_MS = 86_400_000;
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function rate(score) {
  if (score === null) return "N/A";
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  if (score >= 60) return "D";
  return "F";
}
function freshnessScore(lastCheckedAt, nowMs) {
  if (!lastCheckedAt) return null;
  const tp = Date.parse(lastCheckedAt);
  if (!Number.isFinite(tp)) return null;
  const days = (nowMs - tp) / DAY_MS;
  if (days <= FRESH_FULL_DAYS) return 100;
  if (days >= FRESH_ZERO_DAYS) return 0;
  return Math.round(100 * ((FRESH_ZERO_DAYS - days) / (FRESH_ZERO_DAYS - FRESH_FULL_DAYS)));
}
function livenessScore(status, state) {
  if (state === "revoked") return 0;
  if (state === "suspended") return 20;
  switch (status) {
    case "live":
      return state === "active" ? 100 : 50;
    case "draft":
      return 30;
    case "forming":
      return 25;
    case "deprecated":
      return 10;
    case "stale":
      return 10;
    default:
      return 0;
  }
}
function incidentsScore(s) {
  if (!s) return 100;
  const penalty = s.openCritical * 35 + s.openWarning * 12 + s.openInfo * 3;
  return clamp(100 - penalty, 0, 100);
}
function conformanceScore(input) {
  if (typeof input.conformanceScore === "number" && Number.isFinite(input.conformanceScore)) {
    return clamp(Math.round(input.conformanceScore), 0, 100);
  }
  return null;
}
function scoreEntry(input, nowMs) {
  const dims = {
    conformance: { value: conformanceScore(input), weight: DIMENSION_WEIGHTS.conformance },
    freshness: { value: freshnessScore(input.lastCheckedAt, nowMs), weight: DIMENSION_WEIGHTS.freshness },
    liveness: { value: livenessScore(input.status, input.state), weight: DIMENSION_WEIGHTS.liveness },
    incidents: { value: incidentsScore(input.incidents), weight: DIMENSION_WEIGHTS.incidents },
  };
  let wsum = 0;
  let acc = 0;
  for (const d of Object.values(dims)) {
    if (d.value === null) continue;
    wsum += d.weight;
    acc += d.value * d.weight;
  }
  const overall = wsum > 0 ? Math.round(acc / wsum) : null;
  return { overall, rating: rate(overall), dimensions: dims };
}

// ── verify ─────────────────────────────────────────────────────────────────────
function verifyManifestSig(manifest, sig, publicKey) {
  try {
    const pub = createPublicKey({ key: Buffer.from(publicKey, "base64"), format: "der", type: "spki" });
    return edVerify(null, Buffer.from(canonical006(manifest), "utf8"), pub, Buffer.from(sig, "base64"));
  } catch {
    return false;
  }
}

function verifyBundle(bundle, expectedPub) {
  const reasons = [];
  const perSection = [];
  const structural = Boolean(bundle) && bundle.kind === BUNDLE_KIND;
  if (!structural) reasons.push(`unexpected bundle kind "${bundle && bundle.kind}"`);

  const manifest = bundle && bundle.body;
  if (!manifest || manifest.kind !== MANIFEST_KIND || !Array.isArray(manifest.sections)) {
    reasons.push("missing or invalid manifest");
    return { ok: false, structural, sectionIntegrity: false, signaturePresent: false, signatureValid: false, entityConsistent: false, perSection, reasons };
  }

  const sections = bundle.sections && typeof bundle.sections === "object" ? bundle.sections : {};
  let sectionIntegrity = true;
  for (const meta of manifest.sections) {
    const data = sections[meta.name];
    if (data === undefined) {
      sectionIntegrity = false;
      perSection.push({ name: meta.name, status: "MISSING" });
      reasons.push(`declared section "${meta.name}" missing`);
      continue;
    }
    const h = sha256Hex(canonical006(data));
    if (h === meta.sha256) {
      perSection.push({ name: meta.name, status: "PASS", pii: meta.pii });
    } else {
      sectionIntegrity = false;
      perSection.push({ name: meta.name, status: "TAMPERED" });
      reasons.push(`section "${meta.name}" hash mismatch (tampered)`);
    }
  }
  for (const name of Object.keys(sections)) {
    if (!manifest.sections.some((m) => m.name === name)) {
      sectionIntegrity = false;
      perSection.push({ name, status: "UNKNOWN" });
      reasons.push(`undeclared section "${name}" not covered by the signed manifest`);
    }
  }

  // INTEGRITY vs AUTHENTICITY. The signature verifies against the bundle's OWN
  // embedded key (self-consistency). An attacker can re-sign a tampered bundle with
  // THEIR OWN key, so a valid unpinned signature proves only self-consistency, NOT
  // that ar-agents issued it. Authenticity requires pinning the ar-agents key.
  const signaturePresent = Boolean(bundle.sig && bundle.publicKey);
  const pinSupplied = Boolean(expectedPub);
  const pinMatches = pinSupplied && signaturePresent && normB64(expectedPub) === normB64(bundle.publicKey);
  let signatureValid = false;
  if (signaturePresent) {
    signatureValid = verifyManifestSig(manifest, bundle.sig, bundle.publicKey);
    if (!signatureValid) reasons.push("manifest signature does not verify");
  } else {
    reasons.push("UNSIGNED — a PII bundle should never be unsigned; treating as NOT verified");
  }
  if (pinSupplied && signaturePresent && !pinMatches) {
    reasons.push("bundle public key does not match the pinned ar-agents key (authenticity not established)");
  }
  let authenticity;
  if (!signaturePresent || !signatureValid) authenticity = "failed";
  else if (pinSupplied) authenticity = pinMatches ? "confirmed" : "failed";
  else authenticity = "self-consistent-unpinned";

  let entityConsistent = true;
  const rec = sections.record;
  if (rec && typeof rec === "object" && typeof rec.id === "string" && rec.id !== manifest.entityId) {
    entityConsistent = false;
    reasons.push("record.id does not match manifest.entityId");
  }

  const integrity = structural && sectionIntegrity && entityConsistent && signaturePresent && signatureValid;
  const ok = integrity && (!pinSupplied || pinMatches);
  return { ok, integrity, structural, sectionIntegrity, signaturePresent, signatureValid, authenticity, pinSupplied, pinMatches, entityConsistent, perSection, reasons };
}

// ── replay ───────────────────────────────────────────────────────────────────
function replay(bundle) {
  const s = bundle.sections || {};
  const rec = s.record || {};
  const gs = s.goodStanding || {};
  let reDerived = null;
  let reDerivedMatches = false;
  if (gs.input) {
    const nowMs = Date.parse(bundle.body.generatedAt);
    reDerived = scoreEntry(gs.input, Number.isFinite(nowMs) ? nowMs : 0);
    reDerivedMatches = gs.result ? canonical006(reDerived) === canonical006(gs.result) : false;
  }
  const history = Array.isArray(s.history) ? s.history : [];
  const incidents = Array.isArray(s.incidents) ? s.incidents : [];
  return {
    entityId: bundle.body.entityId,
    name: rec.name ?? null,
    status: rec.status ?? null,
    source: rec.source ?? null,
    goodStanding: {
      state: (gs.input && gs.input.state) ?? (rec.goodStanding && rec.goodStanding.state) ?? null,
      score: reDerived ? reDerived.overall : null,
      rating: reDerived ? reDerived.rating : null,
      reDerivedMatches,
    },
    historyCount: history.length,
    incidentCount: incidents.length,
    openIncidentCount: incidents.filter((i) => !i.resolvedAt).length,
    railPosture: s.railPosture ?? null,
    includesPii: bundle.body.includesPii,
    generatedAt: bundle.body.generatedAt,
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────────
function main() {
  const [, , verb, file, expectedPub] = process.argv;
  if (!verb || !file) {
    console.error("usage: node arg-portability.mjs <verify|replay> <bundle.json> [expectedPublicKeyB64]");
    process.exit(2);
  }
  let bundle;
  try {
    bundle = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    console.error(`cannot read/parse ${file}: ${e && e.message}`);
    process.exit(2);
  }

  const r = verifyBundle(bundle, expectedPub);
  for (const ps of r.perSection) {
    console.log(`  ${String(ps.status).padEnd(9)} ${ps.name}${ps.pii ? " (pii)" : ""}`);
  }
  // Integrity: is the bundle internally self-consistent?
  console.log(
    r.signaturePresent
      ? r.signatureValid
        ? "  integrity: OK (self-consistent)"
        : "  integrity: FAILED (signature does not verify)"
      : "  integrity: FAILED (unsigned)",
  );
  // Authenticity: did ar-agents issue it? Only a pinned key can establish that.
  if (r.authenticity === "confirmed") {
    console.log("  authenticity: CONFIRMED (matches the pinned ar-agents key)");
  } else if (r.authenticity === "self-consistent-unpinned") {
    console.log("  authenticity: NOT CHECKED (no ar-agents key pinned)");
    console.error(
      "  WARNING: an unpinned bundle proves only INTERNAL CONSISTENCY, not that ar-agents issued it —\n" +
        "  anyone can sign a bundle with their own key. To confirm the issuer, re-run with the ar-agents\n" +
        "  public key published at https://ar-agents.ar/.well-known/sociedad-ia/keys :\n" +
        `    node arg-portability.mjs ${verb} ${file} <ar-agents-publicKey>`,
    );
  } else {
    console.log("  authenticity: FAILED (unsigned, invalid signature, or key mismatch)");
  }

  if (verb === "verify") {
    if (r.ok) {
      console.log(
        r.pinSupplied
          ? "OK — bundle verified (authenticity confirmed)"
          : "OK — internally consistent; authenticity NOT checked (pin the ar-agents key to confirm the issuer)",
      );
      process.exit(0);
    }
    console.error("FAILED:\n  - " + r.reasons.join("\n  - "));
    process.exit(1);
  }

  if (verb === "replay") {
    if (!r.ok) {
      console.error("cannot replay an unverified bundle:\n  - " + r.reasons.join("\n  - "));
      process.exit(1);
    }
    const state = replay(bundle);
    console.log(JSON.stringify(state, null, 2));
    if (bundle.sections && bundle.sections.goodStanding && bundle.sections.goodStanding.input && !state.goodStanding.reDerivedMatches) {
      console.error("REPLAY DRIFT: re-derived good-standing does not match the stored verdict");
      process.exit(1);
    }
    console.log("OK — registry state reconstructed off ar-agents infrastructure");
    process.exit(0);
  }

  console.error(`unknown verb "${verb}" (expected verify|replay)`);
  process.exit(2);
}

main();
