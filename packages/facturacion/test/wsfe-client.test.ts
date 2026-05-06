import { describe, expect, it } from "vitest";
import { WsfeClient } from "../src/wsfe-client";
import { WsfeNotConfiguredError } from "../src/errors";

describe("WsfeClient — construction", () => {
  it("throws WsfeNotConfiguredError when cert/key paths and PEMs are both missing", () => {
    expect(() => new WsfeClient({ cuit: "20417581015", env: "prod" } as any)).toThrow(
      WsfeNotConfiguredError,
    );
  });

  it("throws WsfeNotConfiguredError when cuit is missing", () => {
    expect(
      () =>
        new WsfeClient({
          certPem: "fake",
          keyPem: "fake",
          env: "prod",
        } as any),
    ).toThrow(WsfeNotConfiguredError);
  });

  it("constructs successfully with cert paths + cuit + env", () => {
    const client = new WsfeClient({
      certPath: "/tmp/cert.pem",
      keyPath: "/tmp/key.pem",
      cuit: "20417581015",
      env: "homo",
    });
    expect(client).toBeInstanceOf(WsfeClient);
  });

  it("constructs successfully with PEM strings + cuit + env", () => {
    const client = new WsfeClient({
      certPem: "-----BEGIN CERTIFICATE-----\nfake\n-----END CERTIFICATE-----",
      keyPem:
        "-----BEGIN PRIVATE KEY-----\nfake\n-----END PRIVATE KEY-----",
      cuit: "20-41758101-5",
      env: "prod",
    });
    expect(client).toBeInstanceOf(WsfeClient);
  });
});
