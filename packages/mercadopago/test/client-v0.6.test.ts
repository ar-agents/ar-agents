import { describe, expect, it } from "vitest";
import "./setup";
import { analyze3DS, MercadoPagoClient, TEST_CARDS_AR, buildTestCardScenario } from "../src";

const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });

describe("Account / Balance (v0.6)", () => {
  it("returns the seller's balance", async () => {
    const balance = await client.getAccountBalance();
    expect(balance.available_balance).toBe(50_000);
    expect(balance.unavailable_balance).toBe(12_500);
    expect(balance.total_amount).toBe(62_500);
    expect(balance.currency_id).toBe("ARS");
  });

  it("lists account movements with paging", async () => {
    const r = await client.listAccountMovements({ limit: 25, offset: 0 });
    expect(r.movements).toHaveLength(2);
    expect(r.movements[0]!.type).toBe("payment");
    expect(r.movements[1]!.amount).toBe(-1000);
    expect(r.paging.total).toBe(2);
  });

  it("forwards date filters to the query string", async () => {
    let capturedUrl = "";
    const customClient = new MercadoPagoClient({
      accessToken: "TEST-fake-token",
      fetch: ((async (url: string) => {
        capturedUrl = url;
        return new Response(JSON.stringify({ results: [], paging: { limit: 25, offset: 0, total: 0 } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }) as unknown) as typeof fetch,
    });
    await customClient.listAccountMovements({ from: "2026-05-01", to: "2026-05-31" });
    expect(capturedUrl).toContain("begin_date=2026-05-01");
    expect(capturedUrl).toContain("end_date=2026-05-31");
  });
});

describe("Settlements (v0.6)", () => {
  it("lists settlements", async () => {
    const r = await client.listSettlements({});
    expect(r.settlements).toHaveLength(1);
    expect(r.settlements[0]!.status).toBe("processed");
    expect(r.settlements[0]!.bank_account?.bank_name).toBe("Banco Galicia");
  });

  it("fetches a single settlement", async () => {
    const s = await client.getSettlement("settle_xyz");
    expect(s.id).toBe("settle_xyz");
    expect(s.amount).toBe(25_000);
    expect(s.bank_account?.cbu).toBe("0070123145678901234564");
  });
});

describe("Test cards (v0.6)", () => {
  it("exports VISA + Mastercard + Amex test cards", () => {
    expect(TEST_CARDS_AR.VISA_CREDIT).toBeTruthy();
    expect(TEST_CARDS_AR.MASTERCARD_CREDIT).toBeTruthy();
    expect(TEST_CARDS_AR.AMEX_CREDIT).toBeTruthy();
    expect(TEST_CARDS_AR.VISA_CREDIT!.paymentMethodId).toBe("visa");
  });

  it("test cards include APRO scenario for happy path", () => {
    expect(TEST_CARDS_AR.VISA_CREDIT!.holderNameToTest.APRO).toBe("approved");
  });

  it("buildTestCardScenario returns ready-to-use payment params", () => {
    const scenario = buildTestCardScenario("VISA_CREDIT", "OTHE", 1500);
    expect(scenario.transactionAmount).toBe(1500);
    expect(scenario.paymentMethodId).toBe("visa");
    expect(scenario.holderName).toBe("OTHE");
    expect(scenario.payerEmail).toMatch(/@testuser\.com$/);
  });

  it("buildTestCardScenario throws on unknown card", () => {
    expect(() =>
      buildTestCardScenario("NONEXISTENT" as never, "APRO", 100),
    ).toThrow(/Unknown test card/);
  });

  it("buildTestCardScenario throws on unknown scenario", () => {
    expect(() =>
      buildTestCardScenario("VISA_CREDIT", "ZZZZ", 100),
    ).toThrow(/scenario ZZZZ/);
  });
});

describe("3DS analyzer (v0.6)", () => {
  it("returns 'not_required' when three_d_secure_mode is missing", () => {
    const info = analyze3DS({
      id: "1",
      status: "approved",
      transaction_amount: 100,
      currency_id: "ARS",
    } as never);
    expect(info.status).toBe("not_required");
    expect(info.challengeUrl).toBeNull();
  });

  it("returns 'frictionless' when 3DS is on and payment is approved", () => {
    const info = analyze3DS({
      id: "1",
      status: "approved",
      transaction_amount: 100,
      currency_id: "ARS",
      three_d_secure_mode: "optional",
    } as never);
    expect(info.status).toBe("frictionless");
  });

  it("returns 'challenge_required' with URL when status_detail = pending_challenge", () => {
    const info = analyze3DS({
      id: "1",
      status: "pending",
      status_detail: "pending_challenge",
      transaction_amount: 100,
      currency_id: "ARS",
      three_d_secure_mode: "mandatory",
      three_ds_info: {
        external_resource_url: "https://3ds-issuer.example/challenge/abc",
      },
    } as never);
    expect(info.status).toBe("challenge_required");
    expect(info.challengeUrl).toBe("https://3ds-issuer.example/challenge/abc");
  });

  it("returns 'rejected' when status=rejected and status_detail mentions 3ds", () => {
    const info = analyze3DS({
      id: "1",
      status: "rejected",
      status_detail: "cc_rejected_3ds_failed",
      transaction_amount: 100,
      currency_id: "ARS",
      three_d_secure_mode: "mandatory",
    } as never);
    expect(info.status).toBe("rejected");
  });

  it("returns 'unknown' for ambiguous states", () => {
    const info = analyze3DS({
      id: "1",
      status: "in_process",
      transaction_amount: 100,
      currency_id: "ARS",
      three_d_secure_mode: "optional",
    } as never);
    expect(info.status).toBe("unknown");
  });
});
