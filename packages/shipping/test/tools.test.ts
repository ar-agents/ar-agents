import { describe, expect, it } from "vitest";
import { MockShippingAdapter } from "../src/adapter";
import { shippingTools } from "../src/tools";
import type { Address, PackageInfo } from "../src/types";

const origin: Address = {
  name: "Naza",
  street: "Cabo Corrientes",
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

describe("shippingTools", () => {
  it("exposes 6 tools", () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
    });
    expect(Object.keys(tools).sort()).toEqual([
      "cancelar_envio",
      "cotizar_envio",
      "cotizar_envio_todos",
      "crear_envio",
      "listar_sucursales",
      "trackear_envio",
    ]);
  });

  it("cotizar_envio returns ok+quote when carrier configured", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.cotizar_envio!.execute!(
      { origin, destination: dest, packages: [pkg] },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; carrier: string; costArs: number };
    expect(result.ok).toBe(true);
    expect(result.carrier).toBe("andreani");
    expect(result.costArs).toBeGreaterThan(0);
  });

  it("cotizar_envio_todos parallelizes across all configured carriers", async () => {
    const tools = shippingTools({
      adapters: {
        andreani: new MockShippingAdapter("andreani"),
        oca: new MockShippingAdapter("oca"),
        correo_argentino: new MockShippingAdapter("correo_argentino"),
      },
    });
    const result = (await tools.cotizar_envio_todos!.execute!(
      { origin, destination: dest, packages: [pkg] },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; quotes: Array<{ carrier: string; costArs: number }>; cheapest: { carrier: string } };
    expect(result.ok).toBe(true);
    expect(result.quotes).toHaveLength(3);
    // Sorted by cost
    expect(result.quotes[0]!.costArs).toBeLessThanOrEqual(result.quotes[1]!.costArs);
    expect(result.cheapest).toBeTruthy();
  });

  it("cotizar_envio_todos returns available=false when no carriers configured", async () => {
    const tools = shippingTools({});
    const result = (await tools.cotizar_envio_todos!.execute!(
      { origin, destination: dest, packages: [pkg] },
      { toolCallId: "t1", messages: [] } as never,
    )) as { available: boolean; error: string };
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/No hay carriers/);
  });

  it("cotizar_envio rejects invalid CPA in destination", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.cotizar_envio!.execute!(
      {
        origin,
        destination: { ...dest, postalCode: "ZZZZZZZ" },
        packages: [pkg],
      },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CPA válido/);
  });

  it("trackear_envio returns events array", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.trackear_envio!.execute!(
      { tracking_number: "MOCK008" },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; currentStatus: string; events: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.currentStatus).toBe("delivered");
    expect(result.events.length).toBeGreaterThan(0);
  });

  it("crear_envio returns ok + trackingNumber", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.crear_envio!.execute!(
      {
        origin,
        destination: dest,
        packages: [pkg],
        external_reference: "order-456",
      },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; trackingNumber: string };
    expect(result.ok).toBe(true);
    expect(result.trackingNumber).toMatch(/^ANDREANI/);
  });

  it("cancelar_envio returns ok=false with reason for delivered shipments", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.cancelar_envio!.execute!(
      { tracking_number: "MOCK008" },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; reason?: string };
    expect(result.ok).toBe(false);
    expect(result.reason).toBeTruthy();
  });

  it("listar_sucursales returns array", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.listar_sucursales!.execute!(
      { postal_code: "1043", limit: 3 },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; branches: unknown[] };
    expect(result.ok).toBe(true);
    expect(result.branches).toHaveLength(3);
  });

  it("listar_sucursales rejects invalid CPA", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
      defaultCarrier: "andreani",
    });
    const result = (await tools.listar_sucursales!.execute!(
      { postal_code: "0000" },
      { toolCallId: "t1", messages: [] } as never,
    )) as { ok: boolean; error: string };
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/CPA válido/);
  });

  it("returns 'not configured' when carrier requested isn't wired", async () => {
    const tools = shippingTools({
      adapters: { andreani: new MockShippingAdapter("andreani") },
    });
    const result = (await tools.cotizar_envio!.execute!(
      { carrier: "oca", origin, destination: dest, packages: [pkg] },
      { toolCallId: "t1", messages: [] } as never,
    )) as { available: boolean; error: string };
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/no está configurado/);
  });
});
