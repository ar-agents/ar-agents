import { describe, expect, it } from "vitest";
import { computeSeverity } from "../src/severity";

describe("computeSeverity", () => {
  it("flags ARCA intimación as critical regardless of deadline", () => {
    expect(
      computeSeverity({
        organism: "ARCA",
        subject: "Intimación por deber formal",
        responseDueBy: null,
      }),
    ).toBe("critical");
  });

  it("flags IGJ baja de inscripción as critical", () => {
    expect(
      computeSeverity({
        organism: "IGJ",
        subject: "Baja de inscripción provisional",
        responseDueBy: "2027-01-15",
      }),
    ).toBe("critical");
  });

  it("treats acuse de recibo as info even from ARCA when no deadline", () => {
    expect(
      computeSeverity({
        organism: "ARCA",
        subject: "Acuse de recibo de su presentación",
        responseDueBy: null,
      }),
    ).toBe("info");
  });

  it("escalates ARCA-without-deadline to important", () => {
    expect(
      computeSeverity({
        organism: "ARCA",
        subject: "Resolución sobre su trámite",
        responseDueBy: null,
      }),
    ).toBe("important");
  });

  it("escalates ARCA-with-deadline to critical", () => {
    expect(
      computeSeverity({
        organism: "ARCA",
        subject: "Resolución sobre su trámite",
        responseDueBy: "2027-02-01",
      }),
    ).toBe("critical");
  });

  it("ignores invalid responseDueBy strings", () => {
    expect(
      computeSeverity({
        organism: "ANSES",
        subject: "Notificación general",
        responseDueBy: "not-a-date",
      }),
    ).toBe("info");
  });

  it("escalates BCRA with deadline to important", () => {
    expect(
      computeSeverity({
        organism: "BCRA",
        subject: "Vencimiento próximo",
        responseDueBy: "2027-02-01",
      }),
    ).toBe("important");
  });

  it("returns info for unknown organism with no deadline", () => {
    expect(
      computeSeverity({
        organism: "Some-Random-Body",
        subject: "Hello",
        responseDueBy: null,
      }),
    ).toBe("info");
  });

  it("escalates clausura keyword to critical", () => {
    expect(
      computeSeverity({
        organism: "Aduana",
        subject: "Clausura preventiva del establecimiento",
        responseDueBy: null,
      }),
    ).toBe("critical");
  });

  it("escalates multa keyword to critical", () => {
    expect(
      computeSeverity({
        organism: "Trabajo",
        subject: "Aplicación de multa por infracción",
        responseDueBy: null,
      }),
    ).toBe("critical");
  });
});
