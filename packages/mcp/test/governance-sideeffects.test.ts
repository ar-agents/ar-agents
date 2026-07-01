import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { classifyTool, levelRequiresApproval } from "@ar-agents/core";
import { adaptToolSetToMcp, combineToolSets } from "../src/adapter";
import { decideGovernance, resolveGovernance } from "../src/governance";
import { buildIdentityTools } from "../src/registries/identity";
import { buildMiArgentinaTools } from "../src/registries/mi-argentina";
import { buildMercadoPagoTools } from "../src/registries/mercadopago";
import { buildWhatsAppTools } from "../src/registries/whatsapp";
import { buildIdentityAttestTools } from "../src/registries/identity-attest";
import { buildBankingTools } from "../src/registries/banking";
import { buildFacturacionTools } from "../src/registries/facturacion";
import { buildShippingTools } from "../src/registries/shipping";
import { buildBoletinOficialTools } from "../src/registries/boletin-oficial";
import { buildIgjTools } from "../src/registries/igj";
import { buildFirmaDigitalTools } from "../src/registries/firma-digital";
import { buildGdeTadTools } from "../src/registries/gde-tad";

// ---------------------------------------------------------------------------
// FIX 2 regression: the art. 102 gate must read each tool's `sideEffects` and
// pass it into @ar-agents/core `classifyTool` — restoring parity with the local
// `enforceRiskPolicy` path. WITHOUT this, a future read-ish-named tool that
// carries `sideEffects: "moves money"` (or "irreversible") with no name override
// would be DOWNGRADED to "read" and ALLOWED by the default-ON server — a latent
// fail-OPEN. These tests fail CLOSED at CI the moment that wiring regresses.
// ---------------------------------------------------------------------------

const DEFAULT_ON = resolveGovernance({}, {} as NodeJS.ProcessEnv); // enforce ON, no hook

describe("adapter carries sideEffects onto McpTool (parity plumbing)", () => {
  it("adaptToolSetToMcp keeps the source tool's sideEffects", () => {
    const set: ToolSet = {
      // A read-ISH name that, on name alone, classifies as "read" and would pass.
      get_wallet_balance: tool({
        description: "Read a wallet balance",
        inputSchema: z.object({}),
        execute: async () => ({}),
        // ...but it actually moves money.
        sideEffects: "moves money",
      } as Parameters<typeof tool>[0]),
    };
    const adapter = adaptToolSetToMcp(set);
    const t = adapter.tools.find((x) => x.name === "get_wallet_balance")!;
    expect(t.sideEffects).toBe("moves money");
  });

  it("combineToolSets preserves sideEffects across the merge", () => {
    const set: ToolSet = {
      get_thing: tool({
        description: "d",
        inputSchema: z.object({}),
        execute: async () => ({}),
        sideEffects: "irreversible",
      } as Parameters<typeof tool>[0]),
    };
    const combined = combineToolSets([set]);
    expect(combined.tools[0]!.sideEffects).toBe("irreversible");
  });

  it("a tool with no sideEffects yields undefined (not a stray string)", () => {
    const set: ToolSet = {
      get_thing: tool({
        description: "d",
        inputSchema: z.object({}),
        execute: async () => ({}),
      }),
    };
    const adapter = adaptToolSetToMcp(set);
    expect(adapter.tools[0]!.sideEffects).toBeUndefined();
  });
});

describe("decideGovernance honours sideEffects (closes the fail-OPEN)", () => {
  // The exact latent bug: a read-ish NAME that on its own passes the gate.
  it("read-ish name passes WITHOUT sideEffects (baseline)", async () => {
    const d = await decideGovernance(DEFAULT_ON, "get_wallet_balance", undefined, {});
    expect(d.kind).toBe("allow");
  });

  it("SAME read-ish name is DENIED once sideEffects='moves money' (fail-closed)", async () => {
    const d = await decideGovernance(
      DEFAULT_ON,
      "get_wallet_balance",
      undefined,
      {},
      "moves money",
    );
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") expect(d.level).toBe("money");
  });

  it("read-ish name + sideEffects='irreversible' is DENIED", async () => {
    const d = await decideGovernance(
      DEFAULT_ON,
      "get_thing",
      undefined,
      {},
      "irreversible",
    );
    expect(d.kind).toBe("deny");
    if (d.kind === "deny") expect(d.level).toBe("irreversible");
  });

  it("sideEffects='creates resource' is NOT gated (core: low-stakes, reversible)", async () => {
    // Locks core's contract: "creates resource" -> create, which passes. (We do
    // NOT broaden this in @ar-agents/core.)
    const d = await decideGovernance(
      DEFAULT_ON,
      "do_thing",
      undefined,
      {},
      "creates resource",
    );
    expect(d.kind).toBe("allow");
  });

  it("sideEffects='network read'/'none' keep a tool on the read path", async () => {
    for (const se of ["network read", "none"]) {
      const d = await decideGovernance(DEFAULT_ON, "do_thing", undefined, {}, se);
      expect(d.kind, `sideEffects=${se}`).toBe("allow");
    }
  });
});

// ---------------------------------------------------------------------------
// Forward guard across the FULL registered surface: load every tool the server
// would register (all registries enabled) and assert the server's classify path
// (name + description + sideEffects, exactly as decideGovernance computes it)
// agrees with @ar-agents/core. If a future package ships a tool whose
// sideEffects makes it approval-level, this proves the default-ON server gates
// it — without anyone having to remember to wire it.
// ---------------------------------------------------------------------------

describe("full registered surface — sideEffects-risky tools fail CLOSED", () => {
  const savedEnv = { ...process.env };
  beforeEach(() => {
    // Enable the optional registries so the full tool surface materialises.
    // NOTE: we deliberately do NOT enable MercadoLibre here. MP and MELI both
    // expose a `get_order` tool, so combineToolSets (correctly) throws on the
    // collision — the real server would crash at startup if both are wired.
    // That pre-existing collision is out of scope for the art. 102 gate work;
    // this guard exercises the largest collision-free registered surface.
    process.env.MP_ACCESS_TOKEN = "TEST-do-not-use";
    process.env.WA_ACCESS_TOKEN = "EAAfake";
    process.env.WA_PHONE_NUMBER_ID = "fake-phone-id";
    process.env.ATTEST_SIGNING_SECRET = "deadbeefdeadbeefdeadbeefdeadbeef";
  });
  afterEach(() => {
    process.env = { ...savedEnv };
  });

  function fullAdapter() {
    return combineToolSets([
      buildIdentityTools(),
      buildMiArgentinaTools(),
      buildMercadoPagoTools(),
      buildWhatsAppTools(),
      buildIdentityAttestTools(),
      buildBankingTools(),
      buildFacturacionTools(),
      buildShippingTools(),
      buildBoletinOficialTools(),
      buildIgjTools(),
      buildFirmaDigitalTools(),
      buildGdeTadTools(),
    ]);
  }

  it("every registered tool: the server's classify path matches core", async () => {
    const adapter = fullAdapter();
    expect(adapter.tools.length).toBeGreaterThan(100);
    for (const t of adapter.tools) {
      const level = classifyTool({
        name: t.name,
        description: t.description,
        sideEffects: t.sideEffects,
      });
      const gov = resolveGovernance({}, {} as NodeJS.ProcessEnv);
      const d = await decideGovernance(
        gov,
        t.name,
        t.description,
        {},
        t.sideEffects,
      );
      // Default-ON, no approve hook: approval-level => denied; otherwise allowed.
      if (levelRequiresApproval(level)) {
        expect(d.kind, `${t.name} (${level}) should be GATED`).toBe("deny");
      } else {
        expect(d.kind, `${t.name} (${level}) should pass`).toBe("allow");
      }
    }
  });

  it("ANY registered tool whose sideEffects is money/irreversible is approval-level", () => {
    // Today no registered tool ships a money/irreversible sideEffects (the AR
    // packages classify by name). This guard activates automatically the moment
    // one does — it can never silently slip past the gate.
    const adapter = fullAdapter();
    const risky = adapter.tools.filter((t) => {
      const se = (t.sideEffects ?? "").toLowerCase();
      return se === "moves money" || se === "irreversible";
    });
    for (const t of risky) {
      const level = classifyTool({
        name: t.name,
        description: t.description,
        sideEffects: t.sideEffects,
      });
      expect(
        levelRequiresApproval(level),
        `${t.name} sideEffects=${t.sideEffects} must be approval-level`,
      ).toBe(true);
    }
  });
});
