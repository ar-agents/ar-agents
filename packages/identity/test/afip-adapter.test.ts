import { describe, expect, it } from "vitest";
import {
  type AfipPadronAdapter,
  type AfipPadronResult,
  UnconfiguredAfipPadronAdapter,
} from "../src";

describe("UnconfiguredAfipPadronAdapter", () => {
  const adapter = new UnconfiguredAfipPadronAdapter();

  it("returns available: false with setup instructions", async () => {
    const result = await adapter.lookup("20-12345678-6");
    expect(result.available).toBe(false);
    expect(result.error).toMatch(/not configured/i);
    expect(result.error).toMatch(/AFIP_CERT_PATH|AFIP_KEY_PATH|cert/i);
    expect(result.data).toBeNull();
    expect(result.cuit).toBe("20-12345678-6");
  });

  it("never throws — always resolves with a structured result", async () => {
    await expect(
      adapter.lookup("garbage-input"),
    ).resolves.toMatchObject({ available: false, data: null });
  });
});

describe("custom AfipPadronAdapter implementation", () => {
  // Minimal custom adapter to verify the interface contract.
  class FakeAfipAdapter implements AfipPadronAdapter {
    constructor(private known: Map<string, AfipPadronResult>) {}
    async lookup(cuit: string): Promise<AfipPadronResult> {
      return (
        this.known.get(cuit) ?? {
          cuit,
          available: false,
          error: "Not in fake adapter",
          data: null,
        }
      );
    }
  }

  it("can be implemented via the AfipPadronAdapter interface", async () => {
    const fake = new FakeAfipAdapter(
      new Map([
        [
          "20-12345678-6",
          {
            cuit: "20-12345678-6",
            available: true,
            error: null,
            data: {
              nombre: "Naza Test",
              condicion: "MONOTRIBUTO",
              monotributoCategoria: "A",
              fechaInscripcion: "2026-04-17",
              domicilioFiscal: "Cabo Corrientes 468",
              actividades: ["Servicios informáticos"],
            },
          },
        ],
      ]),
    );

    const found = await fake.lookup("20-12345678-6");
    expect(found.available).toBe(true);
    expect(found.data?.condicion).toBe("MONOTRIBUTO");
    expect(found.data?.monotributoCategoria).toBe("A");

    const missing = await fake.lookup("99-99999999-9");
    expect(missing.available).toBe(false);
  });
});
