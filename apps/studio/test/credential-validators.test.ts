import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  validateAfipCert,
  validateMercadoPago,
  validateModelKey,
  validateTreasuryOfframp,
  validateWhatsApp,
} from "../src/lib/credential-validators";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Real, throwaway self-signed X.509 cert + key pairs, generated fresh per
// test run via the system `openssl` binary (never a fixture file, so there
// is no risk of accidental real ARCA material in the repo). Skipped instead
// of failing when `openssl` is unavailable (CI images vary).
let opensslAvailable = true;
try {
  execFileSync("openssl", ["version"], { stdio: "ignore" });
} catch {
  opensslAvailable = false;
}

function generateSelfSignedPair(cn: string): { certPem: string; keyPem: string } {
  const dir = mkdtempSync(join(tmpdir(), "afip-cert-test-"));
  try {
    const keyPath = join(dir, "key.pem");
    const certPath = join(dir, "cert.pem");
    execFileSync("openssl", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "365",
      "-nodes",
      "-subj",
      `/CN=${cn}`,
    ]);
    return { certPem: readFileSync(certPath, "utf8"), keyPem: readFileSync(keyPath, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("validateMercadoPago", () => {
  it("rejects an obviously malformed token before making any network call", async () => {
    const result = await validateMercadoPago("short");
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verified: true on a 200 from /users/me", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: 1 }, 200));
    const result = await validateMercadoPago("APP_USR-1234567890");
    expect(result).toEqual({ ok: true, verified: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.mercadopago.com/users/me");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer APP_USR-1234567890",
    });
  });

  it("a 401 is a clear rejection, not a network error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    const result = await validateMercadoPago("APP_USR-1234567890");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("APP_USR-1234567890");
  });

  it("a network error never leaks the token in the returned message", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down: token APP_USR-SECRET was sent"));
    const result = await validateMercadoPago("APP_USR-SECRET");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("APP_USR-SECRET");
  });
});

describe("validateWhatsApp", () => {
  it("rejects a non-numeric phoneNumberId before any network call", async () => {
    const result = await validateWhatsApp("EAA1234567890", "not-a-number");
    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verified: true on a 200 from the Graph API", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ id: "123" }, 200));
    const result = await validateWhatsApp("EAA1234567890", "1234567890");
    expect(result).toEqual({ ok: true, verified: true });
    const [url] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://graph.facebook.com/v21.0/1234567890");
  });

  it("a 404 is a clear rejection (unknown phone number id)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 404));
    const result = await validateWhatsApp("EAA1234567890", "1234567890");
    expect(result.ok).toBe(false);
  });
});

describe("validateModelKey", () => {
  it("verified: true on a 200 from Anthropic's /v1/models", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }, 200));
    const result = await validateModelKey("sk-ant-1234567890");
    expect(result).toEqual({ ok: true, verified: true });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://api.anthropic.com/v1/models");
    expect((init as RequestInit).headers).toMatchObject({ "x-api-key": "sk-ant-1234567890" });
  });

  it("a 401 is a clear rejection", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
    const result = await validateModelKey("sk-ant-1234567890");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("sk-ant-1234567890");
  });
});

describe("validateAfipCert", () => {
  it("rejects an invalid CUIT before parsing the cert", () => {
    const result = validateAfipCert({ certPem: "x", keyPem: "y", cuit: "not-a-cuit" });
    expect(result.ok).toBe(false);
  });

  it("rejects a cert that is not valid PEM", () => {
    const result = validateAfipCert({
      certPem: "not a real pem",
      keyPem: "also not a real pem",
      cuit: "20-12345678-6",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/certificado/i);
  });

  it("never includes the PEM contents in a failure message", () => {
    const secretLookingKey = "-----BEGIN PRIVATE KEY-----\nMIIT0PSECRET\n-----END PRIVATE KEY-----";
    const result = validateAfipCert({
      certPem: "garbage",
      keyPem: secretLookingKey,
      cuit: "20-12345678-6",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).not.toContain("MIIT0PSECRET");
  });

  it.skipIf(!opensslAvailable)(
    "accepts a real self-signed cert whose key matches it, marked verified: false (local-only)",
    () => {
      const { certPem, keyPem } = generateSelfSignedPair("sociedad-test-1");
      const result = validateAfipCert({ certPem, keyPem, cuit: "20-12345678-6" });
      expect(result).toEqual({ ok: true, verified: false, note: "validada localmente" });
    },
  );

  it.skipIf(!opensslAvailable)(
    "rejects a syntactically valid cert + key pair that do not match each other",
    () => {
      const { certPem } = generateSelfSignedPair("sociedad-test-a");
      const { keyPem } = generateSelfSignedPair("sociedad-test-b");
      const result = validateAfipCert({ certPem, keyPem, cuit: "20-12345678-6" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message).toMatch(/no corresponde/i);
    },
  );
});

describe("validateTreasuryOfframp", () => {
  it("requires all three Manteca fields", () => {
    expect(validateTreasuryOfframp({ apiKey: "", userId: "u", bankAccountId: "b" }).ok).toBe(false);
    expect(validateTreasuryOfframp({ apiKey: "k", userId: "", bankAccountId: "b" }).ok).toBe(false);
    expect(validateTreasuryOfframp({ apiKey: "k", userId: "u", bankAccountId: "" }).ok).toBe(false);
  });

  it("passes (unverified) when all three are present, no network call made", () => {
    const result = validateTreasuryOfframp({ apiKey: "k", userId: "u", bankAccountId: "b" });
    expect(result).toEqual({ ok: true, verified: false, note: "sin verificar" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
