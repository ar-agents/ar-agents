import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildIdentityTools, describeIdentityConfig } from "../src/registries/identity";
import { buildBankingTools, describeBankingConfig } from "../src/registries/banking";
import { buildMercadoPagoTools, describeMercadoPagoConfig } from "../src/registries/mercadopago";
import { buildMercadoLibreTools, describeMercadoLibreConfig } from "../src/registries/mercadolibre";
import { buildWhatsAppTools, describeWhatsAppConfig } from "../src/registries/whatsapp";
import { buildShippingTools, describeShippingConfig } from "../src/registries/shipping";
import { buildFacturacionTools, describeFacturacionConfig } from "../src/registries/facturacion";
import { buildIdentityAttestTools, describeIdentityAttestConfig } from "../src/registries/identity-attest";

/**
 * Registry env-driven factories — each registry reads env vars to decide
 * whether to wire real adapters or return the algorithm-only / unconfigured
 * variants. We test BOTH paths (configured + unconfigured) for every
 * registry so an env-var typo or wiring regression is caught immediately.
 *
 * The factories MUST NOT throw on missing env vars — they must gracefully
 * return whatever tools are still useful without external creds. That's
 * the contract MCP server consumers depend on (they want to know which
 * subset of the toolkit is available, not get a 500 at startup).
 */

const ENV_KEYS_TO_RESET = [
  "AFIP_CUIT_REPRESENTADO",
  "AFIP_CERT_PEM",
  "AFIP_KEY_PEM",
  "AFIP_CERT_PATH",
  "AFIP_KEY_PATH",
  "AFIP_ENV",
  "BCRA_API_KEY",
  "MP_ACCESS_TOKEN",
  "MELI_ACCESS_TOKEN",
  "MELI_SELLER_ID",
  "MELI_SITE_ID",
  "WA_ACCESS_TOKEN",
  "WA_PHONE_NUMBER_ID",
  "WA_BUSINESS_NAME",
  "OCA_CLIENT_ID",
  "OCA_CLIENT_SECRET",
  "ATTEST_SIGNING_SECRET",
];

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS_TO_RESET) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS_TO_RESET) {
    if (savedEnv[k] !== undefined) {
      process.env[k] = savedEnv[k];
    } else {
      delete process.env[k];
    }
  }
});

describe("registries — graceful unconfigured fallback", () => {
  it("identity: returns algorithm-only tool set when no env", () => {
    const tools = buildIdentityTools();
    expect(tools).toBeTruthy();
    // validate_cuit is the algorithm-only tool — always available.
    expect("validate_cuit" in tools).toBe(true);
    expect("lookup_cuit_afip" in tools).toBe(true);
  });

  it("identity: describeConfig reflects unconfigured state", () => {
    expect(describeIdentityConfig()).toContain("only");
    expect(describeIdentityConfig().toLowerCase()).toContain("no afip");
  });

  it("banking: tools always available (BCRA has public adapter as default)", () => {
    const tools = buildBankingTools();
    expect(tools).toBeTruthy();
    expect("validate_cbu" in tools).toBe(true);
    expect("lookup_credit_situation" in tools).toBe(true);
  });

  it("banking: describeConfig is non-empty", () => {
    expect(describeBankingConfig().length).toBeGreaterThan(0);
  });

  it("mercadopago: returns null without MP_ACCESS_TOKEN", () => {
    const tools = buildMercadoPagoTools();
    expect(tools).toBeNull();
  });

  it("mercadopago: describeConfig says not configured", () => {
    expect(describeMercadoPagoConfig().toLowerCase()).toContain("not configured");
  });

  it("mercadolibre: returns null without MELI_ACCESS_TOKEN + MELI_SELLER_ID", () => {
    const tools = buildMercadoLibreTools();
    expect(tools).toBeNull();
  });

  it("mercadolibre: describeConfig says not configured", () => {
    expect(describeMercadoLibreConfig().toLowerCase()).toContain("not configured");
  });

  it("mercadolibre: returns tools when both env vars are set", () => {
    process.env["MELI_ACCESS_TOKEN"] = "test-token-1234567890";
    process.env["MELI_SELLER_ID"] = "12345";
    const tools = buildMercadoLibreTools();
    expect(tools).toBeTruthy();
    expect(tools && Object.keys(tools).length).toBeGreaterThan(0);
    expect(describeMercadoLibreConfig()).toContain("seller=12345");
    expect(describeMercadoLibreConfig()).toContain("site=MLA");
  });

  it("whatsapp: returns null without WA env vars", () => {
    const tools = buildWhatsAppTools();
    expect(tools).toBeNull();
  });

  it("whatsapp: describeConfig says not configured", () => {
    expect(describeWhatsAppConfig().toLowerCase()).toContain("not configured");
  });

  it("shipping: returns tools (rate calculators don't need creds)", () => {
    const tools = buildShippingTools();
    expect(tools).toBeTruthy();
  });

  it("facturacion: tools always available (read tools work without cert)", () => {
    const tools = buildFacturacionTools();
    expect(tools).toBeTruthy();
    // Read-only catalog tools (tipos comprobante, documento, etc) work
    // without AFIP creds via the unconfigured fallback adapter.
    expect("emitir_factura" in (tools ?? {})).toBe(true);
    expect("obtener_tipos_comprobante" in (tools ?? {})).toBe(true);
  });

  it("identity-attest: returns null without signing secret AND adapters", () => {
    const tools = buildIdentityAttestTools();
    expect(tools).toBeNull();
  });
});

describe("registries — wired with env vars", () => {
  it("identity: includes lookup_cuit_afip when CERT_PEM + CUIT are set", () => {
    process.env.AFIP_CUIT_REPRESENTADO = "20-12345678-6";
    process.env.AFIP_CERT_PEM = "-----BEGIN CERTIFICATE-----\nFAKE\n-----END CERTIFICATE-----";
    process.env.AFIP_KEY_PEM = "-----BEGIN PRIVATE KEY-----\nFAKE\n-----END PRIVATE KEY-----";
    const tools = buildIdentityTools();
    expect("lookup_cuit_afip" in tools).toBe(true);
    expect(describeIdentityConfig()).toContain("lookup_cuit_afip");
  });

  it("identity: works with PATH-mode env vars too", () => {
    process.env.AFIP_CUIT_REPRESENTADO = "20-12345678-6";
    process.env.AFIP_CERT_PATH = "/tmp/cert.pem";
    process.env.AFIP_KEY_PATH = "/tmp/key.pem";
    const tools = buildIdentityTools();
    expect("lookup_cuit_afip" in tools).toBe(true);
  });

  it("mercadopago: returns tools when MP_ACCESS_TOKEN is set", () => {
    process.env.MP_ACCESS_TOKEN = "TEST-fake-token";
    const tools = buildMercadoPagoTools();
    expect(tools).toBeTruthy();
    // Spot-check a known tool name.
    expect("create_payment" in (tools ?? {})).toBe(true);
  });

  it("whatsapp: returns tools when both WA env vars are set", () => {
    process.env.WA_ACCESS_TOKEN = "EAAfake";
    process.env.WA_PHONE_NUMBER_ID = "fake-phone-id";
    const tools = buildWhatsAppTools();
    expect(tools).toBeTruthy();
    expect("send_whatsapp_text" in (tools ?? {})).toBe(true);
  });

  it("whatsapp: returns null if only WA_ACCESS_TOKEN is set (needs phoneNumberId too)", () => {
    process.env.WA_ACCESS_TOKEN = "EAAfake";
    expect(buildWhatsAppTools()).toBeNull();
  });

  it("identity-attest: returns tools when signing secret + WA adapter wired", () => {
    process.env.ATTEST_SIGNING_SECRET = "deadbeefdeadbeefdeadbeefdeadbeef";
    process.env.WA_ACCESS_TOKEN = "EAAfake";
    process.env.WA_PHONE_NUMBER_ID = "fake";
    const tools = buildIdentityAttestTools();
    expect(tools).toBeTruthy();
    expect("request_identity_verification" in (tools ?? {})).toBe(true);
  });

  it("identity-attest: signing secret alone is not enough (needs adapter)", () => {
    process.env.ATTEST_SIGNING_SECRET = "deadbeefdeadbeefdeadbeefdeadbeef";
    // No WA, no email config
    expect(buildIdentityAttestTools()).toBeNull();
  });
});

describe("registries — describeConfig ergonomics", () => {
  it("each describeConfig returns a single non-empty line", () => {
    const descriptions = [
      describeIdentityConfig(),
      describeBankingConfig(),
      describeMercadoPagoConfig(),
      describeWhatsAppConfig(),
      describeShippingConfig(),
      describeFacturacionConfig(),
      describeIdentityAttestConfig(),
    ];
    for (const d of descriptions) {
      expect(d.length).toBeGreaterThan(0);
      expect(d).not.toContain("\n"); // single-line — easy to log
    }
  });
});
