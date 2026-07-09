import { describe, expect, it } from "vitest";
import { metadataForLocale, resolveInitialLocale } from "../src/lib/ui/i18n";

describe("metadataForLocale", () => {
  it("returns the es title and description for es", () => {
    const meta = metadataForLocale("es");
    expect(meta.title).toBe("ar-agents studio");
    expect(meta.description).toBe("Creá una sociedad automatizada conversando, sobre ar-agents.");
  });

  it("returns the en title and description for en", () => {
    const meta = metadataForLocale("en");
    expect(meta.title).toBe("ar-agents studio");
    expect(meta.description).toBe(
      "Chat your way from idea to an operating Argentine automated society, on top of ar-agents.",
    );
  });

  it("never contains an em dash", () => {
    const emDash = String.fromCharCode(0x2014);
    for (const locale of ["es", "en"] as const) {
      const meta = metadataForLocale(locale);
      expect(meta.title).not.toContain(emDash);
      expect(meta.description).not.toContain(emDash);
    }
  });
});

describe("metadataForLocale(resolveInitialLocale(cookieValue)), the layout pipeline", () => {
  it("falls back to es metadata for missing or junk cookie values", () => {
    const esMeta = metadataForLocale("es");
    for (const value of [undefined, null, "", "fr", "EN"]) {
      expect(metadataForLocale(resolveInitialLocale(value))).toEqual(esMeta);
    }
  });

  it("resolves the correct locale metadata for valid cookie values", () => {
    expect(metadataForLocale(resolveInitialLocale("es"))).toEqual(metadataForLocale("es"));
    expect(metadataForLocale(resolveInitialLocale("en"))).toEqual(metadataForLocale("en"));
  });

  it("the description differs between es and en, so an implementation that ignores the cookie is caught", () => {
    const es = metadataForLocale(resolveInitialLocale("es"));
    const en = metadataForLocale(resolveInitialLocale("en"));
    expect(es.description).not.toBe(en.description);
  });
});
