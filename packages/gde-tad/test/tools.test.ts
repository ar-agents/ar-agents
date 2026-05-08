import { describe, expect, it } from "vitest";
import { gdeTadTools } from "../src/tools";
import {
  MockDomicilioAdapter,
  MockTramitesAdapter,
  mockCriticalIntimacionArca,
  mockInfoCircularBcra,
  mockNotification,
  mockTramite,
} from "../src/testing";

const exec = async <T>(t: { execute: (input: T) => Promise<unknown> }, input: T) =>
  t.execute(input);

describe("gdeTadTools()", () => {
  it("exposes 4 tools by default", () => {
    const tools = gdeTadTools();
    expect(Object.keys(tools).sort()).toEqual([
      "get_critical_notifications",
      "list_domicilio_inbox",
      "list_mis_tramites",
      "validate_igj_inscription",
    ]);
  });

  it("list_domicilio_inbox returns the seeded notifications", async () => {
    const domicilio = new MockDomicilioAdapter().seedNotifications("20111111119", [
      mockCriticalIntimacionArca(),
      mockInfoCircularBcra(),
    ]);
    const tools = gdeTadTools({ domicilio });
    const r = (await exec(tools.list_domicilio_inbox, { cuit: "20111111119" })) as {
      available: boolean;
      notifications: Array<{ severity: string }>;
    };
    expect(r.available).toBe(true);
    expect(r.notifications).toHaveLength(2);
  });

  it("get_critical_notifications filters and orders by deadline", async () => {
    const domicilio = new MockDomicilioAdapter().seedNotifications("30000000007", [
      mockNotification({
        organism: "ARCA",
        subject: "Intimación A",
        responseDueBy: new Date(Date.now() + 30 * 86_400_000).toISOString(),
      }),
      mockNotification({
        organism: "ARCA",
        subject: "Intimación B",
        responseDueBy: new Date(Date.now() + 10 * 86_400_000).toISOString(),
      }),
      mockInfoCircularBcra(),
    ]);
    const tools = gdeTadTools({ domicilio });
    const r = (await exec(tools.get_critical_notifications, {
      cuit: "30000000007",
    })) as { available: boolean; critical: Array<{ subject: string }> };
    expect(r.available).toBe(true);
    expect(r.critical).toHaveLength(2);
    expect(r.critical[0]!.subject).toBe("Intimación B");
    expect(r.critical[1]!.subject).toBe("Intimación A");
  });

  it("list_mis_tramites returns seeded trámites", async () => {
    const tramites = new MockTramitesAdapter().seedTramites("20111111119", [
      mockTramite(),
    ]);
    const tools = gdeTadTools({ tramites });
    const r = (await exec(tools.list_mis_tramites, { cuit: "20111111119" })) as {
      tramites: unknown[];
    };
    expect(r.tramites).toHaveLength(1);
  });

  it("validate_igj_inscription rejects bad input", async () => {
    const tools = gdeTadTools();
    const r = (await exec(tools.validate_igj_inscription, {
      denominacion: "AC",
      type: "SAS",
      sede: {
        calle: "Florida",
        numero: "100",
        ciudad: "CABA",
        provincia: "CABA",
        cpa: "C1005AAA",
      },
      capitalSocial: 200_000,
      objeto: "Desarrollo de software propio para clientes corporativos.",
      constituyentes: [{ cuit: "20-12345678-9", aporte: 200_000 }],
    } as unknown as never)) as { valid: boolean };
    expect(r.valid).toBe(false);
  });

  it("returns available:false when no domicilio adapter is wired", async () => {
    const tools = gdeTadTools();
    const r = (await exec(tools.list_domicilio_inbox, { cuit: "20111111119" })) as {
      available: boolean;
    };
    expect(r.available).toBe(false);
  });
});
