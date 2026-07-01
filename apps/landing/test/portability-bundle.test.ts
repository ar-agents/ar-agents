import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { createHash, createPublicKey, generateKeyPairSync, sign as nodeSign, verify as edVerify } from "node:crypto";

/**
 * Portability Bundle: build -> verify -> replay round trip, tamper detection, PII
 * gating, offline Ed25519 verification, CUIT authoritativeness, dense byte
 * stability, and the standalone dependency-free arg-portability.mjs (proving
 * off-infra verification + reconstruction).
 */

import {
  upsertRecord,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";
import { setUboProfile, linkUbo, __resetUboForTests } from "../src/lib/ubo";
import { __resetHistoryForTests } from "../src/lib/registry-history";
import { appendIncident, __resetIncidentsForTests } from "../src/lib/registry-incidents";
import { canonical006 } from "../src/lib/canonical006";
import {
  verifyBundle,
  replayBundle,
  SECTION,
  type PortabilityBundle,
} from "../src/lib/portability-bundle-core";
import { buildBundle } from "../src/lib/portability-bundle";

const PRIV = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";
const MJS = join(import.meta.dirname, "../public/arg-portability.mjs");
const NOW = "2026-06-15T00:00:00.000Z";

function verifyOffline(body: unknown, sig: string, pk: string): boolean {
  const pub = createPublicKey({ key: Buffer.from(pk, "base64"), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(canonical006(body), "utf8"), pub, Buffer.from(sig, "base64"));
}

/** Attacker forge: tamper the record, patch its manifest digest, re-sign with a FRESH key. */
function forgeWithNewKey(bundle: PortabilityBundle): PortabilityBundle {
  const b = JSON.parse(JSON.stringify(bundle)) as PortabilityBundle;
  (b.sections[SECTION.record] as { operator: string }).operator = "ATTACKER";
  const leaf = b.body.sections.find((m) => m.name === SECTION.record)!;
  leaf.sha256 = createHash("sha256").update(Buffer.from(canonical006(b.sections[SECTION.record]), "utf8")).digest("hex");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  b.sig = nodeSign(null, Buffer.from(canonical006(b.body), "utf8"), privateKey).toString("base64");
  b.publicKey = (publicKey.export({ format: "der", type: "spki" }) as Buffer).toString("base64");
  return b;
}

function rec(id: string, over: Partial<RegistryRecord> = {}): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id,
    name: "Test Co",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Perez",
    publicUrl: `https://${id}.example.com`,
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status: "live",
    listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
    ...over,
  };
}

function resetAll(): void {
  __resetMemoryForTests();
  __resetUboForTests();
  __resetHistoryForTests();
  __resetIncidentsForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

describe("portability bundle · build → verify → replay", () => {
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("builds a signed bundle that verifies + verifies OFFLINE", async () => {
    await upsertRecord(rec("bundle-a"));
    const b = (await buildBundle("bundle-a", { now: NOW }))!;
    expect(b.kind).toBe("ar-agents.portability.bundle.v1");
    expect(b.sig && b.publicKey).toBeTruthy();
    const v = await verifyBundle(b);
    expect(v.ok).toBe(true);
    expect(v.signatureValid).toBe(true);
    expect(v.sectionIntegrity).toBe(true);
    // Offline: the manifest signature verifies with only the embedded public key.
    expect(verifyOffline(b.body, b.sig!, b.publicKey!)).toBe(true);
  });

  it("replay reconstructs state + RE-DERIVES the good-standing verdict", async () => {
    await upsertRecord(rec("bundle-r"));
    const b = (await buildBundle("bundle-r", { now: NOW }))!;
    const r = await replayBundle(b);
    expect(r.ok).toBe(true);
    expect(r.state?.entityId).toBe("bundle-r");
    expect(r.state?.status).toBe("live");
    expect(r.state?.goodStanding.reDerivedMatches).toBe(true);
    expect(typeof r.state?.goodStanding.score).toBe("number");
  });

  it("detects a tampered SECTION (hash mismatch) while the manifest sig still verifies", async () => {
    await upsertRecord(rec("bundle-t"));
    const b = (await buildBundle("bundle-t", { now: NOW }))!;
    (b.sections[SECTION.record] as { operator: string }).operator = "Mallory";
    const v = await verifyBundle(b);
    expect(v.sectionIntegrity).toBe(false);
    expect(v.ok).toBe(false);
    // The manifest signature itself still verifies (tamper is caught by the hash).
    expect(verifyOffline(b.body, b.sig!, b.publicKey!)).toBe(true);
  });

  it("detects a tampered MANIFEST (signature invalid)", async () => {
    await upsertRecord(rec("bundle-m"));
    const b = (await buildBundle("bundle-m", { now: NOW }))!;
    b.body.entityId = "someone-else";
    const v = await verifyBundle(b);
    expect(v.signatureValid).toBe(false);
    expect(v.ok).toBe(false);
  });

  it("rejects an UNDECLARED section (smuggled data not covered by the manifest)", async () => {
    await upsertRecord(rec("bundle-u"));
    const b = (await buildBundle("bundle-u", { now: NOW }))!;
    b.sections["smuggled"] = { evil: true };
    const v = await verifyBundle(b);
    expect(v.unknownSections).toContain("smuggled");
    expect(v.sectionIntegrity).toBe(false);
    expect(v.ok).toBe(false);
  });

  it("fails a pinned-key mismatch", async () => {
    await upsertRecord(rec("bundle-p"));
    const b = (await buildBundle("bundle-p", { now: NOW }))!;
    const v = await verifyBundle(b, { pinnedPublicKey: "AAAA" });
    // The signature is still self-consistent vs the embedded key; the PIN is what fails.
    expect(v.authenticity).toBe("failed");
    expect(v.ok).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/pinned key/);
  });

  it("an attacker re-signing with their OWN key is self-consistent but NOT authentic unless pinned", async () => {
    await upsertRecord(rec("forge-a"));
    const b = (await buildBundle("forge-a", { now: NOW }))!;
    const legitPub = b.publicKey!;
    const forged = forgeWithNewKey(b);

    // Unpinned: the forged bundle is internally self-consistent (sig verifies vs its
    // OWN key), but authenticity is only "self-consistent-unpinned" (NOT proof of issuer).
    const unpinned = await verifyBundle(forged);
    expect(unpinned.signatureValid).toBe(true);
    expect(unpinned.authenticity).toBe("self-consistent-unpinned");
    expect((forged.sections.record as { operator: string }).operator).toBe("ATTACKER");

    // Pinned to the REAL ar-agents key: the forged key mismatches -> rejected.
    const pinned = await verifyBundle(forged, { pinnedPublicKey: legitPub });
    expect(pinned.authenticity).toBe("failed");
    expect(pinned.ok).toBe(false);

    // A genuine bundle pinned to its own (legit) key -> authenticity confirmed.
    expect((await verifyBundle(b, { pinnedPublicKey: legitPub })).authenticity).toBe("confirmed");
  });

  it("treats an UNSIGNED bundle as NOT verified (fail-closed)", async () => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
    await upsertRecord(rec("bundle-un"));
    const b = (await buildBundle("bundle-un", { now: NOW }))!;
    expect(b.sig).toBeUndefined();
    const v = await verifyBundle(b);
    expect(v.signaturePresent).toBe(false);
    expect(v.ok).toBe(false);
  });
});

describe("portability bundle · PII gating", () => {
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("includePii:false redacts operator, drops UBO + formation", async () => {
    await upsertRecord(
      rec("pii-a", {
        formation: { sidecar: { representante: { nombre: "Juan Perez", cuit: "20-12345678-6" } } },
      }),
    );
    await setUboProfile("pii-a", { legalName: "Juan Perez", govId: { type: "CUIT", value: "20-12345678-6" }, jurisdiction: "AR" });
    await linkUbo("pii-a");

    const full = (await buildBundle("pii-a", { includePii: true, now: NOW }))!;
    expect(full.body.includesPii).toBe(true);
    expect(full.sections[SECTION.ubo]).toBeTruthy();
    expect((full.sections[SECTION.record] as { formation?: unknown }).formation).toBeTruthy();

    const shared = (await buildBundle("pii-a", { includePii: false, now: NOW }))!;
    expect(shared.body.includesPii).toBe(false);
    expect(shared.sections[SECTION.ubo]).toBeUndefined();
    expect((shared.sections[SECTION.record] as { operator: string }).operator).toBe("[redacted]");
    expect((shared.sections[SECTION.record] as { formation?: unknown }).formation).toBeUndefined();
    // uboStatus (PII-free) is still allowed in the shareable subset.
    expect(shared.sections[SECTION.uboStatus]).toBeTruthy();
    // The shareable subset still verifies.
    expect((await verifyBundle(shared)).ok).toBe(true);
  });

  it("redacts incident notes in the shareable subset, keeps them in the full export", async () => {
    await upsertRecord(rec("inc-a"));
    await appendIncident("inc-a", { kind: "suspended", severity: "warning", note: "contacted Juan Perez re AML", source: "admin" });

    const full = (await buildBundle("inc-a", { includePii: true, now: NOW }))!;
    const fullInc = full.sections[SECTION.incidents] as Array<{ note: string }>;
    expect(fullInc[0]?.note).toMatch(/Juan Perez/);

    const shared = (await buildBundle("inc-a", { includePii: false, now: NOW }))!;
    const sharedInc = shared.sections[SECTION.incidents] as Array<{ note: string; kind: string; severity: string }>;
    expect(sharedInc[0]?.note).toBe("[redacted]");
    expect(sharedInc[0]?.kind).toBe("suspended"); // signal preserved
    expect(sharedInc[0]?.severity).toBe("warning");
  });

  it("never exports a self-declared CUIT as authoritative; seed CUIT stays authoritative", async () => {
    await upsertRecord(rec("cuit-self", { source: "self-listed", operatorCuit: "20-12345678-6", publicUrl: "https://cuit-self.example.com" }));
    const selfB = (await buildBundle("cuit-self", { now: NOW }))!;
    const selfRec = selfB.sections[SECTION.record] as { operatorCuit?: string; selfDeclaredCuit?: string };
    expect(selfRec.operatorCuit).toBeUndefined();
    expect(selfRec.selfDeclaredCuit).toBe("20-12345678-6");

    await upsertRecord(rec("cuit-seed", { source: "seed", operatorCuit: "30-11111111-7", publicUrl: "https://cuit-seed.example.com" }));
    const seedB = (await buildBundle("cuit-seed", { now: NOW }))!;
    const seedRec = seedB.sections[SECTION.record] as { operatorCuit?: string; selfDeclaredCuit?: string };
    expect(seedRec.operatorCuit).toBe("30-11111111-7");
    expect(seedRec.selfDeclaredCuit).toBeUndefined();
  });
});

describe("portability bundle · dense byte-stability (canonical006 never sees undefined)", () => {
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("a JSON round-trip does not change any section's canonical bytes or the signature", async () => {
    await upsertRecord(rec("dense-a", { railPosture: { usdRail: "ousd", ousdEnabled: true, asOf: NOW } }));
    const b = (await buildBundle("dense-a", { now: NOW }))!;
    const roundTripped = JSON.parse(JSON.stringify(b)) as PortabilityBundle;
    for (const meta of b.body.sections) {
      expect(canonical006(roundTripped.sections[meta.name])).toBe(canonical006(b.sections[meta.name]));
    }
    // Still verifies after transport.
    expect((await verifyBundle(roundTripped)).ok).toBe(true);
    expect(verifyOffline(roundTripped.body, roundTripped.sig!, roundTripped.publicKey!)).toBe(true);
  });
});

describe("portability bundle · standalone arg-portability.mjs (off-infra)", () => {
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("verifies a signed bundle (exit 0) and rejects a tampered one (exit 1); replay reconstructs state", async () => {
    await upsertRecord(rec("mjs-a"));
    const b = (await buildBundle("mjs-a", { now: NOW }))!;
    const good = join(tmpdir(), "pb-good.json");
    const bad = join(tmpdir(), "pb-bad.json");
    writeFileSync(good, JSON.stringify(b));
    const tampered = JSON.parse(JSON.stringify(b)) as PortabilityBundle;
    (tampered.sections[SECTION.record] as { operator: string }).operator = "Mallory";
    writeFileSync(bad, JSON.stringify(tampered));

    const v = spawnSync("node", [MJS, "verify", good], { encoding: "utf8" });
    expect(v.status).toBe(0);
    expect(v.stdout).toMatch(/integrity: OK/);

    const vBad = spawnSync("node", [MJS, "verify", bad], { encoding: "utf8" });
    expect(vBad.status).toBe(1);

    const rp = spawnSync("node", [MJS, "replay", good], { encoding: "utf8" });
    expect(rp.status).toBe(0);
    expect(rp.stdout).toMatch(/reconstructed off ar-agents infrastructure/);
    const printed = JSON.parse(rp.stdout.slice(rp.stdout.indexOf("{"), rp.stdout.lastIndexOf("}") + 1));
    expect(printed.entityId).toBe("mjs-a");
    expect(printed.goodStanding.reDerivedMatches).toBe(true);
  });

  it("pins the public key: a wrong pinned key fails (exit 1)", async () => {
    await upsertRecord(rec("mjs-p"));
    const b = (await buildBundle("mjs-p", { now: NOW }))!;
    const f = join(tmpdir(), "pb-pin.json");
    writeFileSync(f, JSON.stringify(b));
    const wrong = spawnSync("node", [MJS, "verify", f, "AAAAwrongkey"], { encoding: "utf8" });
    expect(wrong.status).toBe(1);
    const right = spawnSync("node", [MJS, "verify", f, b.publicKey!], { encoding: "utf8" });
    expect(right.status).toBe(0);
  });

  it("CLI: an unpinned forged bundle is never reported as authentic; pinning the real key rejects it", async () => {
    await upsertRecord(rec("mjs-forge"));
    const b = (await buildBundle("mjs-forge", { now: NOW }))!;
    const legitPub = b.publicKey!;
    const forged = forgeWithNewKey(b);
    const f = join(tmpdir(), "pb-forged.json");
    writeFileSync(f, JSON.stringify(forged));

    // Unpinned: exit 0 (internally consistent) but the output MUST NOT claim authenticity.
    const unpinned = spawnSync("node", [MJS, "verify", f], { encoding: "utf8" });
    expect(unpinned.status).toBe(0);
    expect(unpinned.stdout).toMatch(/authenticity: NOT CHECKED/);
    expect(unpinned.stdout).not.toMatch(/authenticity: CONFIRMED/);
    expect(unpinned.stdout).not.toMatch(/authenticity confirmed/);

    // Pinned to the real ar-agents key: the forged key mismatches -> rejected.
    const pinned = spawnSync("node", [MJS, "verify", f, legitPub], { encoding: "utf8" });
    expect(pinned.status).toBe(1);
  });
});

describe("portability bundle · verify/replay core is PURE (no @vercel/kv, no next)", () => {
  it("the verify path source imports nothing from @vercel/kv or next", () => {
    for (const p of ["../src/lib/portability-bundle-core.ts", "../src/lib/canonical006.ts", "../src/lib/good-standing-score.ts"]) {
      const src = readFileSync(join(import.meta.dirname, p), "utf8");
      // Allow `import type` (erased); forbid any runtime import from kv/next.
      const runtimeImports = src.match(/^\s*import\s+(?!type\b)[^;]*from\s+["']([^"']+)["']/gm) ?? [];
      for (const line of runtimeImports) {
        expect(line).not.toMatch(/@vercel\/kv|["']next/);
      }
    }
  });
});
