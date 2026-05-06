import { afterEach, describe, expect, it } from "vitest";
import { MercadoPagoClient } from "../src/client";

/**
 * Browser-context guard regression test (security-critical).
 *
 * The constructor refuses to instantiate when `globalThis.window` is
 * defined, preventing the access token from being bundled into a
 * client-side JS bundle. If a refactor inverts the condition or the
 * `globalThis as { window?: unknown }` cast silently breaks, the next
 * deploy could leak the token. These tests lock the behavior in place.
 */

describe("MercadoPagoClient — browser-context guard", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("constructs normally in a server context (no window)", () => {
    expect(
      () => new MercadoPagoClient({ accessToken: "TEST-deadbeef" }),
    ).not.toThrow();
  });

  it("THROWS when window is defined (browser context)", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => new MercadoPagoClient({ accessToken: "TEST-deadbeef" })).toThrow(
      /browser context/i,
    );
  });

  it("error message mentions JavaScript bundle / token leak risk", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(() => new MercadoPagoClient({ accessToken: "TEST-deadbeef" })).toThrow(
      /JavaScript bundle|exposed/i,
    );
  });

  it("__allowBrowser: true escape hatch lets it through (for jsdom tests)", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(
      () =>
        new MercadoPagoClient({
          accessToken: "TEST-deadbeef",
          __allowBrowser: true,
        }),
    ).not.toThrow();
  });

  it("__allowBrowser: false (or any falsy) does NOT bypass the guard", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(
      () =>
        new MercadoPagoClient({
          accessToken: "TEST-deadbeef",
          __allowBrowser: false,
        }),
    ).toThrow(/browser context/i);
  });
});
