import { afterEach, describe, expect, it, vi } from "vitest";
import { decideSpending, inMemoryTally, goodStandingHalt } from "../src/guardrails";
import { resolveGovernance, decideGovernance } from "../src/governance";

const MONEY = "create_payment"; // classifyTool -> "money"
const READ = "lookup_cuit"; // classifyTool -> read

// A tool-aware extractor that reads the REAL charge field (amount_ars), ignoring
// any decoy `amount` key a caller might add. This is what an operator supplies.
const readAmountArs = (_tool: string, args: unknown): number | null => {
  const a = args as Record<string, unknown> | null;
  return a && typeof a.amount_ars === "number" ? a.amount_ars : null;
};

describe("guardrails · decideSpending (fail-safe)", () => {
  const CAPS = { perOpMax: 500, dailyMax: 1000, extractAmount: readAmountArs };

  it("not_applicable for a non-money tool or when caps are absent", () => {
    const t = inMemoryTally();
    expect(decideSpending({ toolName: READ, args: { amount_ars: 10 } }, CAPS, t).kind).toBe("not_applicable");
    expect(decideSpending({ toolName: MONEY, args: { amount_ars: 10 } }, undefined, t).kind).toBe("not_applicable");
  });

  it("CRITICAL-regression: empty caps {} NEVER auto-approves (fail-closed)", () => {
    const t = inMemoryTally();
    const d = decideSpending({ toolName: MONEY, args: { amount_ars: 999_999_999 } }, {}, t);
    expect(d.kind).toBe("over_caps");
    expect(t.spentToday("ARS")).toBe(0);
  });

  it("caps with limits but NO extractAmount -> human (never guesses the amount)", () => {
    const t = inMemoryTally();
    const d = decideSpending({ toolName: MONEY, args: { amount_ars: 10 } }, { perOpMax: 500 }, t);
    expect(d.kind).toBe("over_caps");
  });

  it("CRITICAL-regression: a decoy `amount` key cannot auto-approve an over-cap real charge", () => {
    const t = inMemoryTally();
    // Real charge is amount_ars: 999999; a decoy amount: 1 must be ignored.
    const d = decideSpending({ toolName: MONEY, args: { amount_ars: 999_999, amount: 1 } }, CAPS, t);
    expect(d.kind).toBe("over_caps"); // the real amount exceeds the cap
    expect(t.spentToday("ARS")).toBe(0);
  });

  it("auto-approves a genuinely in-cap money tool and records the spend", () => {
    const t = inMemoryTally();
    const d = decideSpending({ toolName: MONEY, args: { amount_ars: 100 } }, CAPS, t);
    expect(d).toEqual({ kind: "within_caps", amount: 100 });
    expect(t.spentToday("ARS")).toBe(100);
  });

  it("enforces the per-op and DAILY caps", () => {
    const t = inMemoryTally();
    const caps = { perOpMax: 500, dailyMax: 700, extractAmount: readAmountArs };
    expect(decideSpending({ toolName: MONEY, args: { amount_ars: 600 } }, caps, t).kind).toBe("over_caps"); // > per-op
    expect(decideSpending({ toolName: MONEY, args: { amount_ars: 400 } }, caps, t).kind).toBe("within_caps");
    expect(decideSpending({ toolName: MONEY, args: { amount_ars: 400 } }, caps, t).kind).toBe("over_caps"); // 800 > 700 daily
    expect(t.spentToday("ARS")).toBe(400); // only the first in-cap call recorded
  });

  it("unreadable / invalid / throwing amount -> human (never auto-approve)", () => {
    const t = inMemoryTally();
    expect(decideSpending({ toolName: MONEY, args: { note: "x" } }, CAPS, t).kind).toBe("over_caps"); // null
    expect(decideSpending({ toolName: MONEY, args: { amount_ars: -5 } }, CAPS, t).kind).toBe("over_caps"); // negative
    expect(decideSpending({ toolName: MONEY, args: { amount_ars: NaN } }, CAPS, t).kind).toBe("over_caps"); // NaN
    const throwing = { perOpMax: 500, extractAmount: () => { throw new Error("boom"); } };
    expect(decideSpending({ toolName: MONEY, args: {} }, throwing, t).kind).toBe("over_caps");
    expect(t.spentToday("ARS")).toBe(0);
  });
});

describe("governance · caps integration (fail-safe)", () => {
  const CAPS = { perOpMax: 500, dailyMax: 1000, extractAmount: readAmountArs };

  it("in-cap money tool auto-approves WITHOUT an approve hook", async () => {
    const gov = resolveGovernance({ caps: CAPS });
    expect((await decideGovernance(gov, MONEY, undefined, { amount_ars: 100 })).kind).toBe("allow");
  });

  it("over-cap money tool is fail-closed denied (no hook) with the cap reason", async () => {
    const gov = resolveGovernance({ caps: CAPS });
    const d = await decideGovernance(gov, MONEY, undefined, { amount_ars: 5000 });
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") expect(d.message).toMatch(/Spending guardrail/);
  });

  it("over-cap money tool WITH an approve hook asks the human", async () => {
    let asked = false;
    const gov = resolveGovernance({ caps: CAPS, approve: async () => { asked = true; return true; } });
    const d = await decideGovernance(gov, MONEY, undefined, { amount_ars: 5000 });
    expect(asked).toBe(true);
    expect(d.kind).toBe("allow");
  });

  it("empty caps {} does NOT loosen the default (money still fail-closed)", async () => {
    const gov = resolveGovernance({ caps: {} });
    expect((await decideGovernance(gov, MONEY, undefined, { amount_ars: 1 })).kind).toBe("deny");
  });

  it("with NO caps, a money tool stays fail-closed (unchanged default)", async () => {
    const gov = resolveGovernance({});
    expect((await decideGovernance(gov, MONEY, undefined, { amount_ars: 1 })).kind).toBe("deny");
  });

  it("a read tool always passes regardless of caps", async () => {
    const gov = resolveGovernance({ caps: { perOpMax: 1, extractAmount: readAmountArs } });
    expect((await decideGovernance(gov, READ, undefined, { amount_ars: 999 })).kind).toBe("allow");
  });
});

describe("guardrails · goodStandingHalt (registry kill-switch)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let spy: any;
  afterEach(() => spy?.mockRestore());

  function mockState(state: string, ok = true) {
    spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ body: { goodStanding: { state } } }), { status: ok ? 200 : 500 }),
    );
  }

  it("halts when the registry says suspended/revoked", async () => {
    mockState("revoked");
    expect(await goodStandingHalt({ entityId: "co" })("t", {})).toBe(true);
    spy.mockRestore();
    mockState("suspended");
    expect(await goodStandingHalt({ entityId: "co" })("t", {})).toBe(true);
  });

  it("does NOT halt when active", async () => {
    mockState("active");
    expect(await goodStandingHalt({ entityId: "co" })("t", {})).toBe(false);
  });

  it("does NOT halt on a transient error by default (fail-open on unreachable)", async () => {
    spy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { throw new Error("net"); });
    expect(await goodStandingHalt({ entityId: "co" })("t", {})).toBe(false);
    expect(await goodStandingHalt({ entityId: "co", haltOnUnreachable: true })("t", {})).toBe(true);
  });

  it("does nothing (no halt) when neither entityId nor entityUrl is given", async () => {
    expect(await goodStandingHalt({})("t", {})).toBe(false);
  });
});
