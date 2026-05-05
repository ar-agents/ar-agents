import { describe, expect, it } from "vitest";
import { fakeMp } from "./setup";
import {
  MercadoPagoClient,
  MercadoPagoBackUrlInvalidError,
  MercadoPagoAuthorizeForbiddenError,
} from "../src";

const client = new MercadoPagoClient({ accessToken: "TEST-fake-token" });

describe("MercadoPagoClient", () => {
  describe("createPreapproval", () => {
    it("creates a preapproval and returns the typed record", async () => {
      const result = await client.createPreapproval({
        reason: "Plan básico",
        payerEmail: "buyer@test.com",
        amount: 100,
        currency: "ARS",
        frequency: 1,
        frequencyType: "months",
        backUrl: "https://example.com/done",
      });

      expect(result.id).toMatch(/^fake_/);
      expect(result.status).toBe("pending");
      expect(result.payer_email).toBe("buyer@test.com");
      expect(result.init_point).toMatch(/^https:\/\/www\.mercadopago\.com\.ar\/subscriptions\/checkout/);
      expect(result.auto_recurring).toEqual({
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 100,
        currency_id: "ARS",
      });
    });

    it("throws BackUrlInvalidError when back_url is not HTTPS", async () => {
      await expect(
        client.createPreapproval({
          reason: "Plan",
          payerEmail: "buyer@test.com",
          amount: 100,
          currency: "ARS",
          frequency: 1,
          frequencyType: "months",
          backUrl: "http://localhost:3000/done",
        }),
      ).rejects.toBeInstanceOf(MercadoPagoBackUrlInvalidError);
    });

    it("persists external_reference when provided", async () => {
      const result = await client.createPreapproval({
        reason: "Plan",
        payerEmail: "buyer@test.com",
        amount: 100,
        currency: "ARS",
        frequency: 1,
        frequencyType: "months",
        backUrl: "https://example.com/done",
        externalReference: "internal-id-42",
      });
      expect(result.external_reference).toBe("internal-id-42");
    });
  });

  describe("getPreapproval", () => {
    it("returns the preapproval after creation", async () => {
      const created = await client.createPreapproval({
        reason: "Plan",
        payerEmail: "buyer@test.com",
        amount: 100,
        currency: "ARS",
        frequency: 1,
        frequencyType: "months",
        backUrl: "https://example.com/done",
      });
      const fetched = await client.getPreapproval(created.id);
      expect(fetched.id).toBe(created.id);
      expect(fetched.status).toBe("pending");
    });
  });

  describe("cancelPreapproval", () => {
    it("transitions status to cancelled", async () => {
      const created = await client.createPreapproval({
        reason: "Plan",
        payerEmail: "buyer@test.com",
        amount: 100,
        currency: "ARS",
        frequency: 1,
        frequencyType: "months",
        backUrl: "https://example.com/done",
      });
      const cancelled = await client.cancelPreapproval(created.id);
      expect(cancelled.status).toBe("cancelled");

      const verified = await client.getPreapproval(created.id);
      expect(verified.status).toBe("cancelled");
      // Sanity that fakeMp store mirrors what client sees
      expect(fakeMp.preapprovals.get(created.id)?.status).toBe("cancelled");
    });
  });

  describe("authorize via PUT is forbidden by MP", () => {
    it("throws MercadoPagoAuthorizeForbiddenError when caller tries to force authorized via resumePreapproval on a pending sub", async () => {
      const created = await client.createPreapproval({
        reason: "Plan",
        payerEmail: "buyer@test.com",
        amount: 100,
        currency: "ARS",
        frequency: 1,
        frequencyType: "months",
        backUrl: "https://example.com/done",
      });
      // resumePreapproval sends PUT { status: 'authorized' }; MP rejects.
      await expect(
        client.resumePreapproval(created.id),
      ).rejects.toBeInstanceOf(MercadoPagoAuthorizeForbiddenError);
    });
  });

  describe("constructor validation", () => {
    it("throws when accessToken is missing", () => {
      expect(
        () =>
          new MercadoPagoClient({
            accessToken: "",
          }),
      ).toThrow(/accessToken/);
    });
  });
});
