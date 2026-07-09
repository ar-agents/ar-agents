import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "../src/app/page";

beforeEach(() => {
  delete process.env.SOCIEDAD_IA_DENOMINACION;
  delete process.env.STUDIO_URL;
});

afterEach(() => {
  delete process.env.SOCIEDAD_IA_DENOMINACION;
  delete process.env.STUDIO_URL;
});

describe("Home (ROADMAP.md M3-3: minimal branded page, not a developer diagnostic)", () => {
  it("shows the real denominacion when SOCIEDAD_IA_DENOMINACION is set", () => {
    process.env.SOCIEDAD_IA_DENOMINACION = "Kiosco Automatizado SAS";
    const html = renderToStaticMarkup(Home());
    expect(html).toContain("Kiosco Automatizado SAS");
    expect(html).not.toContain("ACME-AI");
  });

  it("falls back to a generic label, never the ACME-AI placeholder, when unset", () => {
    const html = renderToStaticMarkup(Home());
    expect(html).toContain("Sociedad automatizada");
    expect(html).not.toContain("ACME-AI");
  });

  it("states the one-line es-AR description with the denominacion and studio", () => {
    process.env.SOCIEDAD_IA_DENOMINACION = "Kiosco Automatizado SAS";
    const html = renderToStaticMarkup(Home());
    expect(html).toContain("El agente autónomo de Kiosco Automatizado SAS. Operada desde ar-agents studio.");
  });

  it("links to the default studio URL when STUDIO_URL is unset", () => {
    const html = renderToStaticMarkup(Home());
    expect(html).toContain('href="https://studio-plum-three-47.vercel.app"');
  });

  it("links to a configured STUDIO_URL when set", () => {
    process.env.STUDIO_URL = "https://studio.example.test";
    const html = renderToStaticMarkup(Home());
    expect(html).toContain('href="https://studio.example.test"');
  });

  it("links to ar-agents.ar as the discreet powered-by line", () => {
    const html = renderToStaticMarkup(Home());
    expect(html).toContain('href="https://ar-agents.ar"');
    expect(html).toContain("powered by");
  });

  it("never leaks the developer diagnostic: no client wiring, no endpoint list, no env diagnostics", () => {
    const html = renderToStaticMarkup(Home());
    expect(html).not.toContain("Estado de clientes");
    expect(html).not.toContain("missing-env");
    expect(html).not.toContain("wired");
    expect(html).not.toContain("Endpoints");
    expect(html).not.toContain("POST /api/agent");
    expect(html).not.toContain("Próximos pasos");
    expect(html).not.toContain(".env.local");
    expect(html).not.toContain("clientes externos");
  });
});
