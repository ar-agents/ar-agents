import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * V2-8 Registry Garbage Collector: flips stalled `forming` stubs to `stale`
 * (reversible, historized, incident-logged) past the staleness threshold. In-memory.
 */

import { runRegistryGc, GET as gcGet } from "../src/app/api/cron/registry-gc/route";
import {
  createFormingStub,
  getRecord,
  upsertRecord,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";
import { __resetIncidentsForTests, incidentSummary } from "../src/lib/registry-incidents";
import { __resetHistoryForTests } from "../src/lib/registry-history";

const NOW = Date.parse("2026-07-01T00:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z"; // ~6 months before NOW (> 45d)
const RECENT = "2026-06-25T00:00:00.000Z"; // 6 days before NOW (< 45d)

function liveRec(id: string): RegistryRecord {
  return {
    id,
    name: "Live Co",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Perez",
    publicUrl: `https://${id}.example.com`,
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status: "live",
    listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: OLD, lastScore: 80, lastRating: "B" },
    createdAt: OLD,
    updatedAt: OLD,
    source: "self-listed",
  };
}

function resetAll(): void {
  __resetMemoryForTests();
  __resetIncidentsForTests();
  __resetHistoryForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  delete process.env.CRON_SECRET;
  delete process.env.REGISTRY_ADMIN_TOKEN;
}

describe("registry garbage collector", () => {
  beforeEach(resetAll);
  afterEach(resetAll);

  it("stales a stalled forming stub, leaves a recent one + non-forming entries alone", async () => {
    const oldStub = await createFormingStub({ denominacion: "Vieja SA", tipo: "SAS" }, "s-old", { now: OLD });
    const newStub = await createFormingStub({ denominacion: "Nueva SA", tipo: "SAS" }, "s-new", { now: RECENT });
    await upsertRecord(liveRec("live-co"));
    expect(oldStub && newStub).toBeTruthy();

    // Dry run: identifies the candidate but mutates nothing.
    const dry = await runRegistryGc(true, NOW);
    expect(dry.candidates).toContain(oldStub!.id);
    expect(dry.candidates).not.toContain(newStub!.id);
    expect(dry.staled).toEqual([]);
    expect((await getRecord(oldStub!.id))?.status).toBe("forming"); // unchanged

    // Real run: stales the old one only.
    const run = await runRegistryGc(false, NOW);
    expect(run.staled).toContain(oldStub!.id);
    expect((await getRecord(oldStub!.id))?.status).toBe("stale");
    expect((await getRecord(newStub!.id))?.status).toBe("forming");
    expect((await getRecord("live-co"))?.status).toBe("live");
    // The flip logged an incident (info) + is historized via transitionStatus.
    expect((await incidentSummary(oldStub!.id)).total).toBeGreaterThanOrEqual(1);
  });

  it("is idempotent: a second run has no new candidates (stale is not forming)", async () => {
    const oldStub = await createFormingStub({ denominacion: "Otra SA", tipo: "SAS" }, "s-2", { now: OLD });
    await runRegistryGc(false, NOW);
    const again = await runRegistryGc(false, NOW);
    expect(again.candidates).not.toContain(oldStub!.id);
    expect(again.staled).toEqual([]);
  });

  it("GET is fail-closed without CRON_SECRET / admin token (401)", async () => {
    const res = await gcGet(new Request("https://ar-agents.ar/api/cron/registry-gc"));
    expect(res.status).toBe(401);
  });

  it("GET runs for a valid admin token", async () => {
    process.env.REGISTRY_ADMIN_TOKEN = "admin-gc";
    const res = await gcGet(
      new Request("https://ar-agents.ar/api/cron/registry-gc?dryRun=1", {
        headers: { "x-admin-token": "admin-gc" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.ok).toBe(true);
    expect(json.dryRun).toBe(true);
  });
});
