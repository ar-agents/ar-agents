import { describe, expect, it } from "vitest";
import {
  UnconfiguredDomicilioAdapter,
  UnconfiguredTramitesAdapter,
} from "../src/adapters";
import {
  MockDomicilioAdapter,
  MockTramitesAdapter,
  mockCriticalIntimacionArca,
  mockInfoCircularBcra,
  mockTramite,
  mockTramiteResuelto,
} from "../src/testing";

describe("UnconfiguredDomicilioAdapter", () => {
  it("returns available:false with a setup hint", async () => {
    const a = new UnconfiguredDomicilioAdapter();
    const r = await a.list("20-12345678-9");
    expect(r.available).toBe(false);
    expect(r.cuit).toBe("20123456789");
    expect(r.error).toContain("Domicilio Electrónico adapter no está configurado");
    expect(r.notifications).toEqual([]);
  });
});

describe("UnconfiguredTramitesAdapter", () => {
  it("returns available:false with a setup hint", async () => {
    const a = new UnconfiguredTramitesAdapter();
    const r = await a.list("20-12345678-9");
    expect(r.available).toBe(false);
    expect(r.tramites).toEqual([]);
  });
});

describe("MockDomicilioAdapter", () => {
  it("seeds + lists notifications, normalizes CUIT", async () => {
    const adapter = new MockDomicilioAdapter().seedNotifications(
      "30-12345678-9",
      [mockCriticalIntimacionArca(), mockInfoCircularBcra()],
    );
    const r = await adapter.list("30-12345678-9");
    expect(r.cuit).toBe("30123456789");
    expect(r.available).toBe(true);
    expect(r.notifications).toHaveLength(2);
    expect(r.notifications[0]!.severity).toBe("critical");
  });

  it("logs every list call in .calls", async () => {
    const adapter = new MockDomicilioAdapter();
    await adapter.list("20-12345678-9");
    await adapter.list("30-99999999-1");
    expect(adapter.calls).toEqual(["20123456789", "30999999991"]);
  });

  it("returns empty notifications for unseeded CUIT", async () => {
    const adapter = new MockDomicilioAdapter();
    const r = await adapter.list("20-99999999-1");
    expect(r.available).toBe(true);
    expect(r.notifications).toHaveLength(0);
  });

  it("clear() resets store and call log", async () => {
    const adapter = new MockDomicilioAdapter().seedNotifications("20111111119", [
      mockCriticalIntimacionArca(),
    ]);
    await adapter.list("20111111119");
    expect(adapter.calls).toHaveLength(1);
    adapter.clear();
    expect(adapter.calls).toHaveLength(0);
    const r = await adapter.list("20111111119");
    expect(r.notifications).toHaveLength(0);
  });
});

describe("MockTramitesAdapter", () => {
  it("seeds and lists trámites", async () => {
    const adapter = new MockTramitesAdapter().seedTramites("30123456789", [
      mockTramite(),
      mockTramiteResuelto(),
    ]);
    const r = await adapter.list("30-12345678-9");
    expect(r.cuit).toBe("30123456789");
    expect(r.tramites).toHaveLength(2);
    expect(r.tramites[1]!.status).toBe("resuelto-favorable");
  });

  it("returns empty for unseeded CUIT", async () => {
    const adapter = new MockTramitesAdapter();
    const r = await adapter.list("20999999999");
    expect(r.available).toBe(true);
    expect(r.tramites).toHaveLength(0);
  });
});
