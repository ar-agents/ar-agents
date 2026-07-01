import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash, generateKeyPairSync, sign as nodeSign } from "node:crypto";

/** RFC-003 reciprocity: a receiving jurisdiction accepts an AUTHENTIC portability
 * bundle and emits a portable credit file. Forged / wrong-key bundles are rejected. */

import { upsertRecord, setKeyPosture, __resetMemoryForTests, type RegistryRecord } from "../src/lib/registry-store";
import { __resetHistoryForTests } from "../src/lib/registry-history";
import { __resetIncidentsForTests } from "../src/lib/registry-incidents";
import { __resetUboForTests } from "../src/lib/ubo";
import { canonical006 } from "../src/lib/canonical006";
import { SECTION, type PortabilityBundle } from "../src/lib/portability-bundle-core";
import { buildBundle } from "../src/lib/portability-bundle";
import { buildAcceptance } from "../src/lib/reciprocity";

const PRIV = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";
const NOW = "2026-06-15T00:00:00.000Z";

function rec(id: string): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id, name: "Test Co", type: "productive-sociedad-ia", jurisdiction: "AR", operator: "Juan Perez",
    publicUrl: `https://${id}.example.com`, rfcConformance: [], disclosure: { es: "x", en: "x" },
    status: "live", listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 80, lastRating: "B" },
    createdAt: now, updatedAt: now, source: "self-listed",
  };
}
function reset(): void {
  __resetMemoryForTests();
  __resetHistoryForTests();
  __resetIncidentsForTests();
  __resetUboForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}
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

describe("reciprocity · buildAcceptance", () => {
  beforeEach(() => {
    reset();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB;
  });
  afterEach(() => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("accepts an authentic (pinned) bundle and emits a portable credit file", async () => {
    await upsertRecord(rec("rec-a"));
    await setKeyPosture("rec-a", { mode: "ubo_controlled" });
    const b = (await buildBundle("rec-a", { now: NOW }))!;
    const acc = await buildAcceptance(b, { pinnedPublicKey: b.publicKey!, targetJurisdiction: "US-WY" });
    expect(acc.accepted).toBe(true);
    expect(acc.authenticity).toBe("confirmed");
    expect(acc.sourceJurisdiction).toBe("AR");
    expect(acc.targetJurisdiction).toBe("US-WY");
    expect(acc.portableCreditFile?.entityId).toBe("rec-a");
    expect(acc.portableCreditFile?.keyPosture).toBe("ubo_controlled");
    expect(acc.portableCreditFile?.goodStanding.rating).toBeTruthy();
    expect(acc.acceptedFields).toContain("goodStanding");
  });

  it("rejects when pinned to the WRONG key (authenticity not established)", async () => {
    await upsertRecord(rec("rec-b"));
    const b = (await buildBundle("rec-b", { now: NOW }))!;
    const acc = await buildAcceptance(b, { pinnedPublicKey: "AAAAwrongkey", targetJurisdiction: "US-WY" });
    expect(acc.accepted).toBe(false);
    expect(acc.authenticity).toBe("failed");
    expect(acc.portableCreditFile).toBeNull();
    expect(acc.reasons.join(" ")).toMatch(/authenticity/);
  });

  it("rejects a forged bundle even when pinned to the real ar-agents key", async () => {
    await upsertRecord(rec("rec-c"));
    const b = (await buildBundle("rec-c", { now: NOW }))!;
    const legitPub = b.publicKey!;
    const forged = forgeWithNewKey(b);
    const acc = await buildAcceptance(forged, { pinnedPublicKey: legitPub, targetJurisdiction: "US-WY" });
    expect(acc.accepted).toBe(false);
    expect(acc.portableCreditFile).toBeNull();
  });
});
