/**
 * Full-bridge integration test: the three rails composed end-to-end.
 *
 *   rail 1  x402 intake     — a client pays the society in USDC (real EIP-712 sig,
 *                             local verify, in-memory facilitator settle)
 *   rail 2  off-ramp        — just-in-time USDC->ARS conversion via the adapter
 *   rail 3  treasury/fiscal — size the AFIP buffer, fund it, emit the honest
 *                             settlement instruction
 *
 * Proves @ar-agents/x402 and @ar-agents/treasury compose into the crypto->pesos->AFIP
 * loop, with no network and no real funds.
 */

import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { getAddress } from "viem";
import {
  X402Receiver,
  InMemoryFacilitator,
  signExactPayment,
  encodePaymentHeader,
} from "@ar-agents/x402";
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

const TEST_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const account = privateKeyToAccount(TEST_KEY);
const PAY_TO = getAddress("0x209693Bc6afc0C5328bA36FaF03C514EF312287C");
const T0 = 1_750_000_000_000;
const DAY = 86_400_000;
const FX = 1000; // ARS per USD

async function receiveUsdc(usdc: number, nonceByte: string): Promise<number> {
  const facilitator = new InMemoryFacilitator({ now: () => T0 });
  const receiver = new X402Receiver({ facilitator, now: () => T0 });
  const price = {
    usdc,
    network: "base-sepolia" as const,
    payTo: PAY_TO,
    resource: "https://api.sociedad.ar/service",
  };
  const reqs = receiver.requirements(price);
  const payment = await signExactPayment({
    account,
    requirements: reqs,
    now: () => T0,
    nonce: ("0x" + nonceByte.repeat(32)) as `0x${string}`,
  });
  const r = await receiver.process(encodePaymentHeader(payment), reqs);
  if (!r.ok) throw new Error(`intake failed: ${r.reason}`);
  return r.receipt.amountUsdc;
}

describe("full bridge: x402 -> treasury -> AFIP", () => {
  it("intake funds the AFIP buffer just-in-time and yields a settlement instruction", async () => {
    // rail 1: the society earns 50 USDC for a service.
    const received = await receiveUsdc(50, "11");
    expect(received).toBe(50);

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
    // buffer is now funded...
    expect(state.ars).toBeGreaterThanOrEqual(buffer - 0.01);
    expect(state.ars).toBeGreaterThanOrEqual(cuota); // can pay the obligation
    // ...without over-converting: USDC remains.
    expect(state.usd).toBeGreaterThan(0);
    expect(state.usd).toBeLessThan(received);

    // the obligation is payable from the ARS balance.
    const afterPay = applyPayment(state, cuota);
    expect(afterPay.ars).toBeCloseTo(state.ars - cuota, 2);

    // honest settlement: the rail funds + instructs; it does not auto-pay AFIP.
    const sp = settlementPlan(obligations[0], "debito_automatico");
    expect(sp.canAutoExecute).toBe(false);
    expect(sp.autonomy).toBe("passive");
  });

  it("multiple intakes accumulate into the USDC treasury", async () => {
    const a = await receiveUsdc(10, "22");
    const b = await receiveUsdc(15, "33");
    const state: TreasuryState = { usd: a + b, ars: 0, costBasisPerUsd: 1 };
    expect(state.usd).toBe(25);
  });

  it("no conversion happens when the ARS buffer is already funded", async () => {
    const received = await receiveUsdc(50, "44");
    const cuota = monotributoCuota("A", "servicios");
    const obligations: Obligation[] = [
      { id: "mono", kind: "monotributo", amountArs: cuota, dueAtMs: T0 + 5 * DAY },
    ];
    // start already holding more ARS than the buffer needs.
    const state: TreasuryState = { usd: received, ars: cuota * 2, costBasisPerUsd: 1 };
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
