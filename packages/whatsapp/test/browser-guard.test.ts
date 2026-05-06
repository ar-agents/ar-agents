import { afterEach, describe, expect, it } from "vitest";
import { WhatsAppClient } from "../src/client";

describe("WhatsAppClient — browser-context guard", () => {
  afterEach(() => {
    delete (globalThis as { window?: unknown }).window;
  });

  it("constructs normally in a server context (no window)", () => {
    expect(
      () =>
        new WhatsAppClient({
          accessToken: "EAA-test",
          phoneNumberId: "123",
        }),
    ).not.toThrow();
  });

  it("THROWS when window is defined (browser context)", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(
      () =>
        new WhatsAppClient({
          accessToken: "EAA-test",
          phoneNumberId: "123",
        }),
    ).toThrow(/browser context/i);
  });

  it("__allowBrowser: true escape hatch lets it through", () => {
    (globalThis as { window?: unknown }).window = {};
    expect(
      () =>
        new WhatsAppClient({
          accessToken: "EAA-test",
          phoneNumberId: "123",
          __allowBrowser: true,
        }),
    ).not.toThrow();
  });
});
