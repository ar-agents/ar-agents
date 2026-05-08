import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  getSellerReputation,
  evaluateReputationAlerts,
  monitorReputation,
  type SellerReputation,
} from "../src";

const GREEN_REP: SellerReputation = {
  level_id: "5_green",
  power_seller_status: "platinum",
  metrics: {
    claims: { rate: 0.005, value: 1, period: "60d" },
    delayed_handling_time: { rate: 0.01, value: 2, period: "60d" },
    cancellations: { rate: 0.002, value: 0, period: "60d" },
    sales: { period: "60d", completed: 200 },
  },
};

const YELLOW_REP: SellerReputation = {
  level_id: "3_yellow",
  metrics: {
    claims: { rate: 0.05, value: 12, period: "60d" },
    delayed_handling_time: { rate: 0.04, value: 8, period: "60d" },
    cancellations: { rate: 0.025, value: 6, period: "60d" },
  },
};

const RED_REP: SellerReputation = {
  level_id: "1_red",
  metrics: {
    claims: { rate: 0.1, value: 30 },
    delayed_handling_time: { rate: 0.08 },
    cancellations: { rate: 0.07 },
  },
};

describe("getSellerReputation", () => {
  it("hits /users/{id}/seller_reputation", async () => {
    const fm = mockFetch()
      .on("GET", "/users/12345/seller_reputation", () => ({
        status: 200,
        body: GREEN_REP,
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getSellerReputation(client, 12345);
    expect(r.level_id).toBe("5_green");
  });
});

describe("evaluateReputationAlerts", () => {
  it("green snapshot has no alerts", () => {
    const alerts = evaluateReputationAlerts(GREEN_REP);
    expect(alerts).toHaveLength(0);
  });

  it("yellow level fires warning + warning rates fire", () => {
    const alerts = evaluateReputationAlerts(YELLOW_REP);
    const titles = alerts.map((a) => a.title);
    expect(titles).toContain("Reputation thermometer is YELLOW");
    expect(alerts.some((a) => a.metric === "claims.rate")).toBe(true);
    // Severity should include at least one warning.
    expect(alerts.some((a) => a.severity === "warning")).toBe(true);
  });

  it("red level fires critical alerts", () => {
    const alerts = evaluateReputationAlerts(RED_REP);
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
    expect(
      alerts.find((a) => a.metric === "delayed_handling_time.rate")?.severity,
    ).toBe("critical");
  });

  it("respects custom thresholds", () => {
    const alerts = evaluateReputationAlerts(GREEN_REP, {
      warningClaimRate: 0.001,
      criticalClaimRate: 0.002,
    });
    // claims.rate 0.005 > critical 0.002.
    expect(alerts.some((a) => a.severity === "critical")).toBe(true);
  });
});

describe("monitorReputation", () => {
  it("yields a snapshot + alerts on each poll", async () => {
    const fm = mockFetch()
      .on("GET", "/users/12345/seller_reputation", () => ({
        status: 200,
        body: YELLOW_REP,
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const ctrl = new AbortController();
    const it = monitorReputation(client, 12345, {
      intervalMs: 5,
      signal: ctrl.signal,
    });
    const first = await it.next();
    expect(first.value?.snapshot?.level_id).toBe("3_yellow");
    expect(first.value?.alerts.length).toBeGreaterThan(0);
    ctrl.abort();
  });
});
