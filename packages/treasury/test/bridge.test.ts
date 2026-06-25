/**
 * Treasury full-loop test: a USDC balance -> pesos buffer -> honest AFIP instruction.
 *
 *   in      — the society holds USDC (the amount arrives via @ar-agents/x402 crypto
 *             intake in production; that intake is x402's concern, tested there).
 *   rail 2  — just-in-time USDC->ARS conversion via the off-ramp adapter.
 *   rail 3  — size the AFIP buffer, fund it, emit the honest settlement instruction.
 *
 * Proves the crypto->pesos->AFIP LOGIC with no network and no real funds. x402 and
 * treasury meet at a single seam: "an amount of USDC received" (credited as state.usd).
 */

import { describe, expect, it } from "vitest";
import {
  InMemoryOffRampAdapter,
  applyPayment,
  fundTaxBuffer,
  monotributoCuota,
  requiredArsBuffer,
  settlementPlan,
  type Obligation,
  type TreasuryState,
} from "../src/index";

const T0 = 1_750_000_000_000;
const DAY = 86_400_000;
const FX = 1000; // ARS per USD

describe("treasury full loop: USDC in -> pesos buffer -> AFIP", () => {
  it("funds the AFIP buffer just-in-time and yields a settlement instruction", async () => {
    // the society earned 50 USDC for a service (intake via @ar-agents/x402).
    const received = 50;
    let state: TreasuryState = { usd: received, ars: 0, costBasisPerUsd: 1 };

    // a monotributo cuota (cat A, servicios) is due in 5 days.
    const cuota = monotributoCuota("A", "servicios");
    const obligations: Obligation[] = [
      { id: "mono-2026-06", kind: "monotributo", amountArs: cuota, dueAtMs: T0 + 5 * DAY },
    ];
    const buffer = requiredArsBuffer(obligations, T0, 30 * DAY);

    // rails 2/3: convert just enough USDC to fund the peso buffer.
    const offramp = new InMemoryOffRampAdapter(FX, 0.01);
    const { plan, receipt, state: funded } = await fundTaxBuffer({
      state,
      obligations,
      nowMs: T0,
      horizonMs: 30 * DAY,
      fxRate: FX,
      offramp,
    });
    state = funded;

    expect(plan.convertUsd).toBeGreaterThan(0);
    expect(receipt).toBeDefined();
    // buffer funded...
    expect(state.ars).toBeGreaterThanOrEqual(buffer - 0.01);
    expect(state.ars).toBeGreaterThanOrEqual(cuota); // can pay the obligation
    // ...without over-converting: USDC remains.
    expect(state.usd).toBeGreaterThan(0);
    expect(state.usd).toBeLessThan(received);

    // the obligation is payable from the ARS balance.
    const afterPay = applyPayment(state, cuota);
    expect(afterPay.ars).toBeCloseTo(state.ars - cuota, 2);

    // honest settlement: the rail funds + instructs; it does NOT auto-pay AFIP.
    const sp = settlementPlan(obligations[0], "debito_automatico");
    expect(sp.canAutoExecute).toBe(false);
    expect(sp.autonomy).toBe("passive");
  });

  it("no conversion happens when the ARS buffer is already funded", async () => {
    const cuota = monotributoCuota("A", "servicios");
    const obligations: Obligation[] = [
      { id: "mono", kind: "monotributo", amountArs: cuota, dueAtMs: T0 + 5 * DAY },
    ];
    // start already holding more ARS than the buffer needs.
    const state: TreasuryState = { usd: 50, ars: cuota * 2, costBasisPerUsd: 1 };
    const { plan, receipt } = await fundTaxBuffer({
      state,
      obligations,
      nowMs: T0,
      horizonMs: 30 * DAY,
      fxRate: FX,
      offramp: new InMemoryOffRampAdapter(FX, 0.01),
    });
    expect(plan.convertUsd).toBe(0);
    expect(receipt).toBeUndefined();
  });
});
