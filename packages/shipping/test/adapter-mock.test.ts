import { describe, expect, it } from "vitest";
import { MockShippingAdapter } from "../src/adapter";
import type { Address, PackageInfo } from "../src/types";

const origin: Address = {
  name: "Naza",
  street: "Calle Falsa",
  number: "468",
  city: "Monte Grande",
  state: "B",
  postalCode: "1842",
  country: "AR",
};
const dest: Address = {
  name: "Buyer",
  street: "Av. Corrientes",
  number: "1234",
  city: "CABA",
  state: "C",
  postalCode: "1043",
  country: "AR",
};
const pkg: PackageInfo = {
  weightKg: 1.5,
  lengthCm: 30,
  widthCm: 20,
  heightCm: 10,
  declaredValueArs: 5000,
};

describe("MockShippingAdapter", () => {
  it("cotizar returns deterministic cost based on weight + service", async () => {
    const a = new MockShippingAdapter("andreani");
    const std = await a.cotizar({ origin, destination: dest, packages: [pkg], service: "standard" });
    expect(std.costArs).toBe(2500 + Math.round(1.5 * 700));
    expect(std.estimatedDaysMin).toBe(2);
    expect(std.estimatedDaysMax).toBe(5);

    const exp = await a.cotizar({ origin, destination: dest, packages: [pkg], service: "express" });
    expect(exp.costArs).toBeGreaterThan(std.costArs);
  });

  it("crear returns a tracking number + label URL", async () => {
    const a = new MockShippingAdapter("andreani");
    const created = await a.crear({
      origin,
      destination: dest,
      packages: [pkg],
      externalReference: "order-123",
    });
    expect(created.trackingNumber).toMatch(/^ANDREANI/);
    expect(created.labelUrl).toContain(created.trackingNumber);
    expect(created.externalReference).toBe("order-123");
  });

  it("trackear returns deterministic status based on last digit", async () => {
    const a = new MockShippingAdapter("andreani");
    const t0 = await a.trackear("MOCK000");
    expect(t0.currentStatus).toBe("label_created");
    const t8 = await a.trackear("MOCK008");
    expect(t8.currentStatus).toBe("delivered");
    expect(t8.deliveredAt).toBeTruthy();
    const t5 = await a.trackear("MOCK005");
    expect(t5.currentStatus).toBe("out_for_delivery");
  });

  it("cancelar succeeds for in-transit, fails for delivered", async () => {
    const a = new MockShippingAdapter("andreani");
    const c0 = await a.cancelar("MOCK000"); // label_created → cancelable
    expect(c0.canceled).toBe(true);
    const c8 = await a.cancelar("MOCK008"); // delivered → not cancelable
    expect(c8.canceled).toBe(false);
    expect(c8.reason).toMatch(/no se puede cancelar/i);
  });

  it("listarSucursales returns N branches with distance", async () => {
    const a = new MockShippingAdapter("oca");
    const branches = await a.listarSucursales({ postalCode: "1043", limit: 5 });
    expect(branches).toHaveLength(5);
    expect(branches[0]!.carrier).toBe("oca");
    expect(branches[0]!.distanceKm).toBe(1.5);
  });
});
