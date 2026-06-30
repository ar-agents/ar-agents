import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * V2-6 Registry hardening: the dimensional good-standing score, the incident log,
 * the daily history, and the validated lifecycle state machine — plus the
 * additive wiring into the public oracle (dimensions in the SIGNED body, still
 * offline-verifiable) and the admin state-machine endpoint (kill-switch).
 *
 * The lib modules use registry-store's in-memory fallback when KV is unwired, so
 * these run on the in-memory path (no KV mock) with __reset*ForTests between cases.
 */

import {
  scoreEntry,
  rate,
  DIMENSION_WEIGHTS,
} from "../src/lib/good-standing-score";
import {
  appendIncident,
  listIncidents,
  resolveIncident,
  incidentSummary,
  __resetIncidentsForTests,
} from "../src/lib/registry-incidents";
import {
  recordHistoryPoint,
  getHistory,
  __resetHistoryForTests,
} from "../src/lib/registry-history";
import {
  canTransitionStatus,
  canTransitionGoodStanding,
  transitionStatus,
  transitionGoodStanding,
} from "../src/lib/registry-lifecycle";
import {
  upsertRecord,
  getRecord,
  setGoodStanding,
  __resetMemoryForTests,
  type RegistryRecord,
} from "../src/lib/registry-store";
import { GET as oracleGet } from "../src/app/api/registry/good-standing/route";
import { GET as adminGet, POST as adminPost } from "../src/app/api/admin/registry/route";

// ── helpers ──────────────────────────────────────────────────────────────────

function rec(over: Partial<RegistryRecord> = {}): RegistryRecord {
  const now = "2026-06-01T00:00:00.000Z";
  return {
    id: "test-co",
    name: "Test Co",
    type: "productive-sociedad-ia",
    jurisdiction: "AR",
    operator: "Juan Perez",
    publicUrl: "https://test-co.example.com",
    rfcConformance: [],
    disclosure: { es: "x", en: "x" },
    status: "live",
    listedSince: "2026-06-01",
    goodStanding: { state: "active", lastCheckedAt: now, lastScore: 90, lastRating: "A" },
    createdAt: now,
    updatedAt: now,
    source: "self-listed",
    ...over,
  };
}

function resetAll(): void {
  __resetMemoryForTests();
  __resetIncidentsForTests();
  __resetHistoryForTests();
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

// ── pure scorer ────────────────────────────────────────────────────────────────

describe("good-standing-score · scoreEntry (pure, dimensional)", () => {
  const NOW = Date.parse("2026-06-10T00:00:00.000Z");

  it("rate() bands map score → letter, N/A only when null", () => {
    expect(rate(95)).toBe("A");
    expect(rate(85)).toBe("B");
    expect(rate(75)).toBe("C");
    expect(rate(65)).toBe("D");
    expect(rate(50)).toBe("F");
    expect(rate(null)).toBe("N/A");
  });

  it("a never-certified live+active entry scores on liveness+incidents only (conformance/freshness null)", () => {
    const sc = scoreEntry(
      { status: "live", state: "active", conformanceScore: null, lastCheckedAt: null },
      { now: NOW },
    );
    expect(sc.dimensions.conformance.value).toBeNull();
    expect(sc.dimensions.freshness.value).toBeNull();
    expect(sc.dimensions.liveness.value).toBe(100);
    expect(sc.dimensions.incidents.value).toBe(100);
    // composite renormalizes over the 2 computable dims → 100
    expect(sc.overall).toBe(100);
    expect(sc.rating).toBe("A");
  });

  it("a freshly-certified clean entry blends all four dimensions", () => {
    const sc = scoreEntry(
      {
        status: "live",
        state: "active",
        conformanceScore: 80,
        lastCheckedAt: "2026-06-08T00:00:00.000Z", // 2 days → fresh 100
      },
      { now: NOW },
    );
    // (80*.45 + 100*.2 + 100*.2 + 100*.15) / 1 = 91
    expect(sc.overall).toBe(91);
    expect(sc.rating).toBe("A");
    expect(sc.dimensions.freshness.value).toBe(100);
  });

  it("stale conformance (>90d) zeroes the freshness dimension", () => {
    const sc = scoreEntry(
      { status: "live", state: "active", conformanceScore: 90, lastCheckedAt: "2026-01-01T00:00:00.000Z" },
      { now: NOW },
    );
    expect(sc.dimensions.freshness.value).toBe(0);
  });

  it("open incidents drag the incidents dimension, weighted by severity", () => {
    const sc = scoreEntry(
      {
        status: "live",
        state: "active",
        conformanceScore: 100,
        lastCheckedAt: "2026-06-09T00:00:00.000Z",
        incidents: { openCritical: 1, openWarning: 0, openInfo: 0 },
      },
      { now: NOW },
    );
    expect(sc.dimensions.incidents.value).toBe(65); // 100 - 35
  });

  it("a revoked entry has liveness 0 regardless of status", () => {
    const sc = scoreEntry(
      { status: "live", state: "revoked", conformanceScore: 100, lastCheckedAt: "2026-06-09T00:00:00.000Z" },
      { now: NOW },
    );
    expect(sc.dimensions.liveness.value).toBe(0);
  });

  it("weights are the documented constants", () => {
    expect(DIMENSION_WEIGHTS.conformance).toBeGreaterThan(DIMENSION_WEIGHTS.freshness);
  });
});

// ── incident log ───────────────────────────────────────────────────────────────

describe("registry-incidents (append-only, bounded, summarized)", () => {
  beforeEach(resetAll);

  it("appends, lists newest-first, and summarizes open/worst", async () => {
    await appendIncident("e1", { kind: "info-x", severity: "info", note: "n1", source: "test", at: "2026-06-01T00:00:00.000Z" });
    const crit = await appendIncident("e1", { kind: "suspended", severity: "critical", note: "n2", source: "admin", at: "2026-06-02T00:00:00.000Z" });
    expect(crit).not.toBeNull();

    const list = await listIncidents("e1");
    expect(list.map((i) => i.kind)).toEqual(["suspended", "info-x"]); // newest first

    const s = await incidentSummary("e1");
    expect(s.total).toBe(2);
    expect(s.open).toBe(2);
    expect(s.openCritical).toBe(1);
    expect(s.worstOpen).toBe("critical");
    expect(s.lastAt).toBe("2026-06-02T00:00:00.000Z");
  });

  it("resolving an incident drops it from the open count", async () => {
    const a = await appendIncident("e2", { kind: "k", severity: "warning", note: "n", source: "t" });
    expect(await resolveIncident("e2", a!.id)).toBe(true);
    const s = await incidentSummary("e2");
    expect(s.open).toBe(0);
    expect(s.total).toBe(1);
    expect(s.worstOpen).toBeNull();
  });

  it("resolving an unknown id returns false", async () => {
    expect(await resolveIncident("e3", "nope")).toBe(false);
  });
});

// ── daily history ────────────────────────────────────────────────────────────

describe("registry-history (one point per UTC day, bounded, sorted)", () => {
  beforeEach(resetAll);

  it("is idempotent per day (same-day overwrite), sorted oldest→newest", async () => {
    await recordHistoryPoint("h1", { date: "2026-06-01", status: "live", state: "active", score: 80, rating: "B" });
    await recordHistoryPoint("h1", { date: "2026-06-01", status: "live", state: "active", score: 90, rating: "A" }); // overwrite
    await recordHistoryPoint("h1", { date: "2026-06-03", status: "live", state: "active", score: 95, rating: "A" });
    const h = await getHistory("h1");
    expect(h).toHaveLength(2);
    expect(h[0]!.date).toBe("2026-06-01");
    expect(h[0]!.score).toBe(90); // the overwrite won
    expect(h[1]!.date).toBe("2026-06-03");
  });

  it("getHistory(days) truncates to the most recent N", async () => {
    await recordHistoryPoint("h2", { date: "2026-06-01", status: "live", state: "active", score: 1, rating: "F" });
    await recordHistoryPoint("h2", { date: "2026-06-02", status: "live", state: "active", score: 2, rating: "F" });
    const h = await getHistory("h2", 1);
    expect(h).toHaveLength(1);
    expect(h[0]!.date).toBe("2026-06-02");
  });
});

// ── lifecycle state machine ────────────────────────────────────────────────────

describe("registry-lifecycle (validated transitions + side effects)", () => {
  beforeEach(resetAll);

  it("allows declared transitions, rejects illegal jumps, allows no-ops", () => {
    expect(canTransitionStatus("forming", "live")).toBe(true);
    expect(canTransitionStatus("live", "forming")).toBe(false);
    expect(canTransitionStatus("forming", "forming")).toBe(true);
    expect(canTransitionGoodStanding("active", "revoked")).toBe(true);
    expect(canTransitionGoodStanding("revoked", "active")).toBe(false); // terminal
  });

  it("transitionStatus persists, historizes, and (with incident) logs", async () => {
    await upsertRecord(rec({ id: "lc1", status: "forming", goodStanding: { state: "unverified", lastCheckedAt: null, lastScore: null, lastRating: null } }));
    const r = await transitionStatus("lc1", "live", { reason: "went live", incident: { severity: "info" } });
    expect(r.ok).toBe(true);
    expect((await getRecord("lc1"))?.status).toBe("live");
    expect((await getHistory("lc1")).length).toBeGreaterThanOrEqual(1);
    const s = await incidentSummary("lc1");
    expect(s.total).toBe(1);
  });

  it("transitionStatus rejects an illegal jump without writing", async () => {
    await upsertRecord(rec({ id: "lc2", status: "live" }));
    const r = await transitionStatus("lc2", "forming", {});
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("illegal_transition");
    expect((await getRecord("lc2"))?.status).toBe("live"); // unchanged
  });

  it("transitionStatus on an unknown id is not_found", async () => {
    const r = await transitionStatus("ghost", "live", {});
    expect(r.ok === false && r.error).toBe("not_found");
  });

  it("kill-switch: good-standing → revoked is terminal + raises a critical incident", async () => {
    await upsertRecord(rec({ id: "kill1" }));
    const r = await transitionGoodStanding("kill1", "revoked", { reason: "fraud", incident: { severity: "critical", kind: "killed" } });
    expect(r.ok).toBe(true);
    expect((await getRecord("kill1"))?.goodStanding.state).toBe("revoked");
    const s = await incidentSummary("kill1");
    expect(s.openCritical).toBe(1);
    // terminal: cannot auto-return
    const back = await transitionGoodStanding("kill1", "active", {});
    expect(back.ok === false && back.error).toBe("illegal_transition");
  });

  it("revoked is terminal AT THE STORAGE SEAM: setGoodStanding cannot re-activate a killed entity (closes the PATCH-override bypass)", async () => {
    await upsertRecord(
      rec({ id: "seam1", goodStanding: { state: "revoked", lastCheckedAt: null, lastScore: null, lastRating: null } }),
    );
    // Any direct write OUT of revoked throws — the system-wide guarantee that no
    // path (incl. the pre-existing PATCH /api/registry admin override, which calls
    // setGoodStanding directly without the allow-list) can silently re-activate.
    await expect(setGoodStanding("seam1", { state: "active" })).rejects.toThrow(/revoked_terminal/);
    // Staying revoked (e.g. a re-certify refreshing the score) is still allowed.
    const stay = await setGoodStanding("seam1", { state: "revoked", lastScore: 99, lastRating: "A" });
    expect(stay?.goodStanding.state).toBe("revoked");
    expect((await getRecord("seam1"))?.goodStanding.state).toBe("revoked");
  });
});

// ── admin state-machine endpoint ───────────────────────────────────────────────

describe("/api/admin/registry (admin-only state machine)", () => {
  const TOKEN = "admin-secret-xyz";
  beforeEach(() => {
    resetAll();
    process.env.REGISTRY_ADMIN_TOKEN = TOKEN;
  });
  afterEach(() => {
    delete process.env.REGISTRY_ADMIN_TOKEN;
  });

  function adminReq(method: "GET" | "POST", qs = "", body?: unknown, token = TOKEN): Request {
    const init: RequestInit = { method, headers: token ? { "x-admin-token": token } : {} };
    if (body !== undefined) init.body = JSON.stringify(body);
    return new Request(`https://ar-agents.ar/api/admin/registry${qs}`, init);
  }

  it("fail-closed: no/wrong token → 401", async () => {
    expect((await adminGet(adminReq("GET", "", undefined, ""))).status).toBe(401);
    expect((await adminPost(adminReq("POST", "", { id: "x", target: "status", to: "live" }, "wrong"))).status).toBe(401);
  });

  it("GET index lists entities; GET ?id= returns the full risk view", async () => {
    await upsertRecord(rec({ id: "adm1" }));
    const index = (await (await adminGet(adminReq("GET"))).json()) as any;
    expect(index.ok).toBe(true);
    expect(index.entities.some((e: any) => e.id === "adm1")).toBe(true);

    const view = (await (await adminGet(adminReq("GET", "?id=adm1"))).json()) as any;
    expect(view.ok).toBe(true);
    expect(view.record.id).toBe("adm1");
    expect(view.score.dimensions).toBeTruthy();
    expect(Array.isArray(view.incidents)).toBe(true);
    expect(Array.isArray(view.history)).toBe(true);
  });

  it("POST drives the kill-switch; the view then shows the incident", async () => {
    await upsertRecord(rec({ id: "adm2" }));
    const res = await adminPost(
      adminReq("POST", "", { id: "adm2", target: "good-standing", to: "revoked", reason: "abuse", incidentSeverity: "critical" }),
    );
    expect(res.status).toBe(200);
    expect((await getRecord("adm2"))?.goodStanding.state).toBe("revoked");
    const view = (await (await adminGet(adminReq("GET", "?id=adm2"))).json()) as any;
    expect(view.incidentSummary.openCritical).toBe(1);
  });

  it("POST validates target + the destination state", async () => {
    await upsertRecord(rec({ id: "adm3" }));
    expect((await adminPost(adminReq("POST", "", { id: "adm3", target: "bogus", to: "live" }))).status).toBe(400);
    expect((await adminPost(adminReq("POST", "", { id: "adm3", target: "status", to: "not-a-state" }))).status).toBe(400);
  });

  it("POST an illegal transition → 409", async () => {
    await upsertRecord(rec({ id: "adm4", status: "live" }));
    const res = await adminPost(adminReq("POST", "", { id: "adm4", target: "status", to: "forming" }));
    expect(res.status).toBe(409);
  });
});

// ── oracle: additive dimensions in the signed body ─────────────────────────────

const PRIV_B64URL = "MC4CAQAwBQYDK2VwBCIEIOKEiFXVa-DhX25WnikmAd7GzUrhcPuh4MH0yfdk5hN6";
const PUB_B64URL = "MCowBQYDK2VwAyEAqM2KDwAluioaWYAD5-fsvxAbVX4rQ9MLIQJzp63C5wM";

function canonical(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") return JSON.stringify(value);
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}
function verifyOffline(att: { body: unknown; sig: string; publicKey: string }): boolean {
  const pub = createPublicKey({ key: Buffer.from(att.publicKey, "base64"), format: "der", type: "spki" });
  return edVerify(null, Buffer.from(canonical(att.body), "utf8"), pub, Buffer.from(att.sig, "base64"));
}

describe("good-standing oracle · additive dimensions", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchSpy: any;
  beforeEach(() => {
    resetAll();
    process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV_B64URL;
    process.env.AUDIT_ED25519_PUBLIC_KEY = PUB_B64URL;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response("{}", { status: 404 }));
  });
  afterEach(() => {
    fetchSpy.mockRestore();
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    delete process.env.AUDIT_ED25519_PUBLIC_KEY;
  });

  it("an attesting entry carries the dimensional breakdown; the signed body still verifies; the headline score is unchanged", async () => {
    await upsertRecord(rec({ id: "orc1", publicUrl: "https://orc1.example.com" }));
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=orc1"));
    const json = (await res.json()) as any;
    expect(json.body.found).toBe(true);
    // Headline score unchanged (backward compat) = stored lastScore.
    expect(json.body.goodStanding.score).toBe(90);
    // Additive dimensional breakdown present.
    expect(json.body.goodStanding.dimensions).toBeTruthy();
    expect(typeof json.body.goodStanding.dimensionalScore).toBe("number");
    expect(json.body.goodStanding.dimensionalRating).toBeTruthy();
    // The additive fields do NOT break offline verification.
    expect(verifyOffline(json)).toBe(true);
  });

  it("a non-attesting (forming) entry carries NO dimensions (attesting:false instead)", async () => {
    await upsertRecord(
      rec({
        id: "orc2",
        status: "forming",
        source: "formed",
        goodStanding: { state: "unverified", lastCheckedAt: null, lastScore: null, lastRating: null },
      }),
    );
    const res = await oracleGet(new Request("https://ar-agents.ar/api/registry/good-standing?id=orc2"));
    const json = (await res.json()) as any;
    expect(json.body.found).toBe(true);
    expect(json.body.goodStanding.attesting).toBe(false);
    expect(json.body.goodStanding.dimensions).toBeUndefined();
    expect(verifyOffline(json)).toBe(true);
  });
});
