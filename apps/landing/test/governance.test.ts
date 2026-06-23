/**
 * Unit tests for the ALE runtime-enforcement primitives (lib/governance.ts):
 * distributed kill-switch, graduated sanctions, tiered arbitration L0, and the
 * steward council roll-back window.
 */

import { describe, expect, it } from "vitest";
import {
  evaluateKillSwitch,
  escalate,
  deescalate,
  sanctionForSeverity,
  SANCTION_LADDER,
  routeClaim,
  resolveL0,
  ARBITRATION,
  isMajorityHuman,
  canRollback,
  ROLLBACK_WINDOW_HOURS,
  guardTools,
  loadKillSwitch,
  type DecisionRule,
} from "../src/lib/governance";
import {
  generateGovernanceTs,
  generateInstructionsMd,
  generateAgentTs,
  Body,
} from "../src/lib/incorporate";

const NO_TRIGGERS = {
  selfMonitor: false,
  stewardOverride: false,
  regulatorSuspension: false,
  insurerWithdrawal: false,
};

describe("evaluateKillSwitch() — 4 distributed triggers", () => {
  it("does not halt when no trigger is set", () => {
    const r = evaluateKillSwitch(NO_TRIGGERS);
    expect(r.halted).toBe(false);
    expect(r.triggeredBy).toEqual([]);
  });
  it("halts on any single trigger (each is independent)", () => {
    for (const k of [
      "selfMonitor",
      "stewardOverride",
      "regulatorSuspension",
      "insurerWithdrawal",
    ] as const) {
      const r = evaluateKillSwitch({ ...NO_TRIGGERS, [k]: true });
      expect(r.halted).toBe(true);
      expect(r.triggeredBy).toContain(k);
    }
  });
  it("lists every trigger that fired", () => {
    const r = evaluateKillSwitch({
      ...NO_TRIGGERS,
      regulatorSuspension: true,
      insurerWithdrawal: true,
    });
    expect(r.triggeredBy).toEqual(["regulatorSuspension", "insurerWithdrawal"]);
  });
});

describe("graduated sanctions", () => {
  it("escalates one rung and clamps at kill-switch", () => {
    expect(escalate("none")).toBe("warning");
    expect(escalate("throttle")).toBe("partial-suspension");
    expect(escalate("kill-switch")).toBe("kill-switch");
  });
  it("deescalates one rung and clamps at none", () => {
    expect(deescalate("warning")).toBe("none");
    expect(deescalate("none")).toBe("none");
  });
  it("maps severity to the right rung, monotonically", () => {
    expect(sanctionForSeverity(0)).toBe("none");
    expect(sanctionForSeverity(0.2)).toBe("warning");
    expect(sanctionForSeverity(0.4)).toBe("throttle");
    expect(sanctionForSeverity(0.6)).toBe("partial-suspension");
    expect(sanctionForSeverity(0.8)).toBe("full-suspension");
    expect(sanctionForSeverity(1)).toBe("kill-switch");
  });
  it("clamps out-of-range severity", () => {
    expect(sanctionForSeverity(-5)).toBe("none");
    expect(sanctionForSeverity(99)).toBe("kill-switch");
  });
  it("only severity >= 1 reaches kill-switch", () => {
    expect(sanctionForSeverity(0.99)).not.toBe("kill-switch");
  });
  it("is non-decreasing across the range", () => {
    let prev = -1;
    for (let s = 0; s <= 1.0001; s += 0.05) {
      const idx = SANCTION_LADDER.indexOf(sanctionForSeverity(s));
      expect(idx).toBeGreaterThanOrEqual(prev);
      prev = idx;
    }
  });
});

describe("routeClaim() — tiered arbitration", () => {
  it("routes a small claim to L0 (automated, 48h)", () => {
    const r = routeClaim({ amountUsd: 10_000 });
    expect(r.layer).toBe(0);
    expect(r.automated).toBe(true);
    expect(r.deadlineHours).toBe(ARBITRATION.L0_DEADLINE_HOURS);
  });
  it("routes a claim at/over the L0 cap to L1", () => {
    expect(routeClaim({ amountUsd: ARBITRATION.L0_MAX_USD }).layer).toBe(1);
    expect(routeClaim({ amountUsd: 200_000 }).layer).toBe(1);
  });
  it("routes cross-jurisdictional to L2", () => {
    expect(routeClaim({ amountUsd: 10_000, crossJurisdictional: true }).layer).toBe(2);
  });
  it("routes constitutional questions to L3 (courts, no auto deadline)", () => {
    const r = routeClaim({ amountUsd: 10_000, constitutional: true });
    expect(r.layer).toBe(3);
    expect(r.deadlineHours).toBeNull();
    expect(r.automated).toBe(false);
  });
});

describe("resolveL0() — automated decision-log resolution", () => {
  const rules: DecisionRule[] = [
    { id: "refund-under-5k", match: (c) => c.amountUsd < 5_000, resolution: "auto-refund" },
  ];
  it("resolves an L0 claim that matches a rule", () => {
    const r = resolveL0({ amountUsd: 1_000 }, rules);
    expect(r.resolved).toBe(true);
    if (r.resolved) {
      expect(r.ruleId).toBe("refund-under-5k");
      expect(r.resolution).toBe("auto-refund");
    }
  });
  it("escalates an L0 claim with no matching rule", () => {
    const r = resolveL0({ amountUsd: 20_000 }, rules);
    expect(r.resolved).toBe(false);
    if (!r.resolved) expect(r.escalateTo).toBe(1);
  });
  it("never auto-resolves a non-L0 claim", () => {
    const r = resolveL0({ amountUsd: 500_000 }, rules);
    expect(r.resolved).toBe(false);
  });
});

describe("steward council roll-back", () => {
  const humanMajority = {
    stewards: [
      { id: "a", human: true },
      { id: "b", human: true },
      { id: "c", human: false },
    ],
  };
  const botMajority = {
    stewards: [
      { id: "a", human: true },
      { id: "b", human: false },
      { id: "c", human: false },
    ],
  };

  it("requires a majority-human council", () => {
    expect(isMajorityHuman(humanMajority)).toBe(true);
    expect(isMajorityHuman(botMajority)).toBe(false);
    expect(isMajorityHuman({ stewards: [] })).toBe(false);
    expect(
      isMajorityHuman({ stewards: [{ id: "a", human: true }, { id: "b", human: false }] }),
    ).toBe(false); // tie is not a majority
  });

  const t0 = 1_000_000_000_000;
  it("allows a steward to roll back within the 72h window", () => {
    const within = t0 + 10 * 3_600_000;
    expect(canRollback(humanMajority, "a", t0, within)).toBe(true);
  });
  it("rejects roll-back after the window", () => {
    const after = t0 + (ROLLBACK_WINDOW_HOURS + 1) * 3_600_000;
    expect(canRollback(humanMajority, "a", t0, after)).toBe(false);
  });
  it("rejects a non-steward actor", () => {
    expect(canRollback(humanMajority, "stranger", t0, t0 + 3_600_000)).toBe(false);
  });
  it("rejects roll-back when the council is not majority-human", () => {
    expect(canRollback(botMajority, "a", t0, t0 + 3_600_000)).toBe(false);
  });
});

describe("generated society ships + binds the enforcement", () => {
  it("generateGovernanceTs() emits the four mechanisms with the paper's parameters", () => {
    const mod = generateGovernanceTs();
    for (const sym of [
      "evaluateKillSwitch",
      "sanctionForSeverity",
      "escalate",
      "routeClaim",
      "resolveL0",
      "isMajorityHuman",
      "canRollback",
    ]) {
      expect(mod).toContain("export function " + sym);
    }
    expect(mod).toContain("L0_MAX_USD: 50000");
    expect(mod).toContain("ROLLBACK_WINDOW_HOURS = 72");
    // Self-contained: the shipped module pulls in no deps.
    expect(mod).not.toContain("import ");
  });

  it("instructs the operating agent to consult lib/governance.ts before acting", () => {
    const md = generateInstructionsMd(
      Body.parse({
        denominacion: "ACME-AI SAS",
        tipo: "SOCIEDAD-IA",
        capitalSocial: 1,
        objeto:
          "Servicios digitales y desarrollo de software propio operados por agentes de IA.",
      }),
    );
    expect(md).toContain("lib/governance.ts");
    expect(md).toContain("evaluateKillSwitch");
  });

  it("ships the hard kill-switch gate (guardTools + loadKillSwitch)", () => {
    const mod = generateGovernanceTs();
    expect(mod).toContain("export function guardTools");
    expect(mod).toContain("export function loadKillSwitch");
    expect(mod).toContain("AR_KILL_REGULATOR");
  });

  it("wires the generated agent to hard-gate its tools through the kill-switch", () => {
    const ts = generateAgentTs(
      Body.parse({
        denominacion: "ACME-AI SAS",
        tipo: "SOCIEDAD-IA",
        capitalSocial: 1,
        objeto:
          "Servicios digitales y desarrollo de software propio operados por agentes de IA.",
      }),
      ["identity"],
    );
    expect(ts).toContain('from "./governance"');
    expect(ts).toContain("guardTools(");
    expect(ts).toContain("loadKillSwitch");
  });
});

describe("guardTools() — hard kill-switch gate on tool execution", () => {
  const NO = () => ({
    selfMonitor: false,
    stewardOverride: false,
    regulatorSuspension: false,
    insurerWithdrawal: false,
  });
  const HALT = () => ({
    selfMonitor: false,
    stewardOverride: true,
    regulatorSuspension: false,
    insurerWithdrawal: false,
  });

  it("runs the real execute when no trigger is active", async () => {
    const tools = { do_thing: { description: "x", execute: async (a: { n: number }) => ({ doubled: a.n * 2 }) } };
    const g = guardTools(tools, NO);
    const r = await (g.do_thing as { execute: (a: { n: number }) => Promise<unknown> }).execute({ n: 21 });
    expect(r).toEqual({ doubled: 42 });
  });

  it("blocks execution (side effects never run) when halted", async () => {
    let ran = false;
    const tools = {
      pay: {
        execute: async () => {
          ran = true;
          return { paid: true };
        },
      },
    };
    const g = guardTools(tools, HALT);
    const r = (await (g.pay as { execute: () => Promise<unknown> }).execute()) as {
      blocked?: boolean;
      reason?: string;
      triggeredBy?: string[];
    };
    expect(ran).toBe(false);
    expect(r.blocked).toBe(true);
    expect(r.reason).toBe("kill-switch");
    expect(r.triggeredBy).toContain("stewardOverride");
  });

  it("passes non-executable entries through unchanged and preserves metadata", () => {
    const tools = {
      do_thing: { description: "x", execute: async () => ({ ok: true }) },
      not_a_tool: { description: "passthrough" },
    };
    const g = guardTools(tools, NO);
    expect((g.not_a_tool as { execute?: unknown }).execute).toBeUndefined();
    expect((g.do_thing as { description: string }).description).toBe("x");
  });
});

describe("loadKillSwitch()", () => {
  it("reads the 4 triggers from env (1 / true = on)", () => {
    const ks = loadKillSwitch({
      AR_KILL_REGULATOR: "1",
      AR_KILL_STEWARD: "true",
      AR_KILL_SELF: "0",
    });
    expect(ks.regulatorSuspension).toBe(true);
    expect(ks.stewardOverride).toBe(true);
    expect(ks.selfMonitor).toBe(false);
    expect(ks.insurerWithdrawal).toBe(false);
  });
  it("defaults all-off with empty env", () => {
    const ks = loadKillSwitch({});
    expect(Object.values(ks).every((v) => v === false)).toBe(true);
  });
});
