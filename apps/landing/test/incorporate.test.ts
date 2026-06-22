/**
 * Unit tests for /api/auto-incorporate's pure logic.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  Body,
  canonicalCuit,
  envVarsFor,
  generateAgentTs,
  generateChecklist,
  generateEnvExample,
  generatePackageJson,
  generateReadme,
  normalizeCuit,
  REQUIRED_PIEZAS,
  resolvePiezas,
  slugFor,
  validate,
} from "../src/lib/incorporate";
import { authorizeIncorporate } from "../src/lib/incorporate-auth";

const baseInput = {
  denominacion: "ACME-AI SAS",
  tipo: "SAS" as const,
  capitalSocial: 200_000,
  objeto: "Desarrollo y comercialización de software propio para empresas argentinas.",
  piezas: [...REQUIRED_PIEZAS],
};

describe("Body schema", () => {
  it("accepts a clean SAS input", () => {
    const r = Body.safeParse(baseInput);
    expect(r.success).toBe(true);
  });
  it("rejects empty denominacion", () => {
    const r = Body.safeParse({ ...baseInput, denominacion: "AC" });
    expect(r.success).toBe(false);
  });
  it("rejects negative capital", () => {
    const r = Body.safeParse({ ...baseInput, capitalSocial: -100 });
    expect(r.success).toBe(false);
  });
  it("rejects unknown tipo", () => {
    const r = Body.safeParse({ ...baseInput, tipo: "FAKE" });
    expect(r.success).toBe(false);
  });
  it("rejects too-short objeto", () => {
    const r = Body.safeParse({ ...baseInput, objeto: "muy corto" });
    expect(r.success).toBe(false);
  });
  it("accepts SOCIEDAD-IA tipo", () => {
    const r = Body.safeParse({ ...baseInput, tipo: "SOCIEDAD-IA", capitalSocial: 1 });
    expect(r.success).toBe(true);
  });
});

describe("validate()", () => {
  it("passes a clean SAS", () => {
    const r = validate(Body.parse(baseInput));
    expect(r.valid).toBe(true);
    expect(r.findings).toHaveLength(0);
  });

  it("flags reserved word in denominación", () => {
    const r = validate(
      Body.parse({ ...baseInput, denominacion: "ACME Nacional SAS" }),
    );
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "denominacion_reserved_word")).toBe(true);
  });

  it("flags capital below SAS minimum", () => {
    const r = validate(Body.parse({ ...baseInput, capitalSocial: 50_000 }));
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "capital_below_minimum")).toBe(true);
  });

  it("warns (but does not fail) on SOCIEDAD-IA", () => {
    const r = validate(
      Body.parse({ ...baseInput, tipo: "SOCIEDAD-IA", capitalSocial: 1 }),
    );
    expect(r.valid).toBe(true);
    expect(r.findings.some((f) => f.code === "sociedad_ia_pending_law")).toBe(true);
    expect(r.findings.some((f) => f.severity === "error")).toBe(false);
  });

  it("rejects malformed CUIT in representante", () => {
    const r = validate(
      Body.parse({
        ...baseInput,
        representante: { nombre: "Foo", cuit: "not-a-cuit" },
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.findings.some((f) => f.code === "cuit_representante_invalid")).toBe(true);
  });

  it("accepts valid CUIT in representante", () => {
    const r = validate(
      Body.parse({
        ...baseInput,
        representante: { nombre: "Foo", cuit: "20-12345678-9" },
      }),
    );
    expect(r.valid).toBe(true);
  });
});

// Build special characters from code points so the test is robust to source
// encoding (literal invisible bytes are unreliable across editors/pipes).
const ZWSP = String.fromCharCode(0x200b); // zero-width space
const RTL = String.fromCharCode(0x202e); // right-to-left override (bidi)
const EN_DASH = String.fromCharCode(0x2013); // U+2013, inside the stripped dash range
const FW = String.fromCharCode(0xff12) + String.fromCharCode(0xff10); // fullwidth "20"

describe("normalizeCuit()", () => {
  it("strips the conventional separators (space, dot, hyphen family)", () => {
    expect(normalizeCuit("20-12345678-9")).toBe("20123456789");
    expect(normalizeCuit("20.12345678-9")).toBe("20123456789");
    expect(normalizeCuit("20 1234 5678 9")).toBe("20123456789");
    expect(normalizeCuit(`20${EN_DASH}12345678${EN_DASH}9`)).toBe("20123456789");
  });
  it("handles empty / null", () => {
    expect(normalizeCuit("")).toBe("");
    expect(normalizeCuit(null as unknown as string)).toBe("");
    expect(normalizeCuit(undefined as unknown as string)).toBe("");
  });
  it("does NOT silently delete non-separator contamination (it survives, to be rejected)", () => {
    // A zero-width / bidi / homoglyph char must NOT vanish — it stays so the
    // strict 11-ASCII-digit check downstream rejects the input rather than
    // cleaning a hostile string into a valid-looking CUIT.
    expect(normalizeCuit(`2012345678${ZWSP}9`)).toContain(ZWSP); // ZWSP survives
    expect(normalizeCuit("20123456789X")).toBe("20123456789X"); // letter survives
  });
});

describe("canonicalCuit() — strict identity key", () => {
  it("returns the 11 ASCII digits for a clean input", () => {
    expect(canonicalCuit("20-12345678-9")).toBe("20123456789");
    expect(canonicalCuit("  20123456789  ")).toBe("20123456789");
  });
  it("rejects non-11-digit, unicode-digit, and contaminated inputs (null)", () => {
    expect(canonicalCuit("123")).toBeNull(); // too short
    expect(canonicalCuit("201234567890")).toBeNull(); // too long
    expect(canonicalCuit("2012345678X")).toBeNull(); // letter
    expect(canonicalCuit(`2012345678${ZWSP}9`)).toBeNull(); // zero-width contamination
    expect(canonicalCuit(`${FW}123456789`)).toBeNull(); // fullwidth digits
    expect(canonicalCuit("")).toBeNull();
  });
  it("two visually-similar inputs cannot collapse onto one principal", () => {
    // clean digits canonicalize; a bidi/zero-width variant is rejected, so it
    // can never share an identity with the clean form.
    expect(canonicalCuit("20123456786")).toBe("20123456786");
    expect(canonicalCuit(`201234567${RTL}86`)).toBeNull(); // RTL override injected
  });
});

describe("slugFor()", () => {
  it("lowercases + dedupes dashes + trims length", () => {
    expect(slugFor("ACME-AI SAS")).toBe("acme-ai-sas");
    expect(slugFor("Café & Restaurante La Esquina")).toBe("caf-restaurante-la-esquina");
    expect(slugFor("a".repeat(100))).toBe("a".repeat(40));
  });
  it("falls back to default", () => {
    expect(slugFor("")).toBe("sociedad-ia");
    expect(slugFor("@@@")).toBe("sociedad-ia");
  });
});

describe("resolvePiezas()", () => {
  it("always includes required piezas", () => {
    const r = resolvePiezas(["whatsapp"]);
    for (const req of REQUIRED_PIEZAS) {
      expect(r).toContain(req);
    }
    expect(r).toContain("whatsapp");
  });
  it("dedupes", () => {
    const r = resolvePiezas(["identity", "identity", "identity"]);
    expect(r.filter((p) => p === "identity")).toHaveLength(1);
  });
});

describe("envVarsFor()", () => {
  it("always includes ANTHROPIC_API_KEY + AUDIT_HMAC_SECRET", () => {
    const v = envVarsFor(["identity"]).map((x) => x.name);
    expect(v).toContain("ANTHROPIC_API_KEY");
    expect(v).toContain("AUDIT_HMAC_SECRET");
  });
  it("includes AFIP_CERT_PEM when identity is present", () => {
    const v = envVarsFor(["identity"]).map((x) => x.name);
    expect(v).toContain("AFIP_CERT_PEM");
  });
  it("includes MERCADOPAGO_ACCESS_TOKEN when mercadopago is present", () => {
    const v = envVarsFor(["mercadopago"]).map((x) => x.name);
    expect(v).toContain("MERCADOPAGO_ACCESS_TOKEN");
  });
  it("includes WHATSAPP_ACCESS_TOKEN when whatsapp is present", () => {
    const v = envVarsFor(["whatsapp"]).map((x) => x.name);
    expect(v).toContain("WHATSAPP_ACCESS_TOKEN");
  });
  it("does not include WhatsApp env vars when whatsapp is absent", () => {
    const v = envVarsFor(["identity"]).map((x) => x.name);
    expect(v).not.toContain("WHATSAPP_ACCESS_TOKEN");
  });
  it("includes governance env vars (SOCIETY_ID + SOCIETY_GATE_TOKEN + AR_AGENTS_API_BASE)", () => {
    const v = envVarsFor(["identity"]).map((x) => x.name);
    expect(v).toContain("SOCIETY_ID");
    expect(v).toContain("SOCIETY_GATE_TOKEN");
    expect(v).toContain("AR_AGENTS_API_BASE");
  });
});

describe("generatePackageJson()", () => {
  it("produces valid JSON with selected ar-agents deps", () => {
    const json = generatePackageJson(Body.parse(baseInput), ["identity", "banking"]);
    const parsed = JSON.parse(json);
    expect(parsed.name).toBe("acme-ai-sas");
    expect(parsed.private).toBe(true);
    expect(parsed.dependencies["@ar-agents/identity"]).toBeDefined();
    expect(parsed.dependencies["@ar-agents/banking"]).toBeDefined();
    expect(parsed.dependencies["next"]).toBeDefined();
  });
  it("sorts dependencies alphabetically", () => {
    const json = generatePackageJson(Body.parse(baseInput), [
      "identity",
      "banking",
      "facturacion",
    ]);
    const parsed = JSON.parse(json);
    const keys = Object.keys(parsed.dependencies);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
  it("includes @ar-agents/core (central governance) in deps", () => {
    const parsed = JSON.parse(generatePackageJson(Body.parse(baseInput), ["identity"]));
    expect(parsed.dependencies["@ar-agents/core"]).toBeDefined();
  });
});

describe("generateAgentTs()", () => {
  it("produces TypeScript with the right tool function names", () => {
    const ts = generateAgentTs(Body.parse(baseInput), [
      "identity",
      "banking",
      "facturacion",
      "mercadopago",
    ]);
    expect(ts).toContain('import { identityTools } from "@ar-agents/identity"');
    expect(ts).toContain('import { bankingTools } from "@ar-agents/banking"');
    expect(ts).toContain('import { mercadoPagoTools } from "@ar-agents/mercadopago"');
    expect(ts).toContain("identityTools({ afip })");
    expect(ts).toContain("(mp ? mercadoPagoTools(mp) : {})");
  });
  it("uses meliTools for mercadolibre (not mercadolibreTools)", () => {
    const ts = generateAgentTs(Body.parse(baseInput), ["identity", "mercadolibre"]);
    expect(ts).toContain("meliTools");
    expect(ts).not.toContain("mercadolibreTools");
  });
  it("skips infra packages (ap2, agentic-commerce-bridge, mcp)", () => {
    const ts = generateAgentTs(Body.parse(baseInput), ["identity", "ap2", "mcp"]);
    expect(ts).not.toContain("@ar-agents/ap2");
    expect(ts).not.toContain("@ar-agents/mcp");
  });
  it("references lib/clients.ts for client construction", () => {
    const ts = generateAgentTs(Body.parse(baseInput), ["identity"]);
    expect(ts).toContain("from \"./clients\"");
    expect(ts).toContain("getMpClient");
    expect(ts).toContain("getAfipPadronAdapter");
  });
  it("wraps tools with the central enforceRiskPolicy gate + governance hooks", () => {
    const ts = generateAgentTs(Body.parse(baseInput), ["identity"]);
    expect(ts).toContain('import { enforceRiskPolicy } from "@ar-agents/core"');
    expect(ts).toContain('import { approve, isHalted } from "./governance"');
    expect(ts).toContain("enforceRiskPolicy(");
    expect(ts).toContain("{ approve, isHalted }");
  });
});

describe("generateEnvExample()", () => {
  it("produces a .env-style file with comments", () => {
    const text = generateEnvExample(envVarsFor(["identity"]));
    expect(text).toContain("AFIP_CERT_PEM=");
    expect(text).toContain("# X.509 cert");
    expect(text.split("\n").filter((l) => l.startsWith("#")).length).toBeGreaterThan(3);
  });
});

describe("generateReadme()", () => {
  it("includes denominación + tipo + RFC-001 link", () => {
    const md = generateReadme(Body.parse(baseInput));
    expect(md).toContain("ACME-AI SAS");
    expect(md).toContain("**SAS**");
    expect(md).toContain("rfcs/001");
  });
  it("differentiates SOCIEDAD-IA copy", () => {
    const md = generateReadme(
      Body.parse({ ...baseInput, tipo: "SOCIEDAD-IA", capitalSocial: 1 }),
    );
    expect(md).toContain("pendiente sanción");
  });
});

describe("generateChecklist()", () => {
  it("returns 8 ordered steps", () => {
    const steps = generateChecklist(Body.parse(baseInput));
    expect(steps).toHaveLength(8);
    // Step 1 references the slug (acme-ai-sas), not the denominación.
    expect(steps[0]).toContain("acme-ai-sas");
    expect(steps[0]).toContain("npx degit");
  });
  it("differentiates SOCIEDAD-IA legal step", () => {
    const steps = generateChecklist(
      Body.parse({ ...baseInput, tipo: "SOCIEDAD-IA", capitalSocial: 1 }),
    );
    expect(steps.some((s) => s.includes("aún no fue sancionado"))).toBe(true);
  });
});

describe("authorizeIncorporate()", () => {
  const ENV = "INCORPORATE_API_KEY";
  const prev = process.env[ENV];
  afterEach(() => {
    if (prev === undefined) delete process.env[ENV];
    else process.env[ENV] = prev;
  });
  const post = (headers: Record<string, string> = {}) =>
    new Request("https://ar-agents.ar/api/auto-incorporate", { method: "POST", headers });

  it("fails closed with 500 when the secret is unset", async () => {
    delete process.env[ENV];
    expect(await authorizeIncorporate(post({ "x-api-key": "anything" }))).toEqual({
      ok: false,
      status: 500,
      error: "auth_not_configured",
    });
  });

  it("401s when no credential is presented", async () => {
    process.env[ENV] = "s3cret";
    expect(await authorizeIncorporate(post())).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  it("401s on a wrong x-api-key", async () => {
    process.env[ENV] = "s3cret";
    expect(await authorizeIncorporate(post({ "x-api-key": "nope" }))).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
  });

  it("accepts the correct x-api-key and emits an approver attestation", async () => {
    process.env[ENV] = "s3cret";
    const r = await authorizeIncorporate(post({ "x-api-key": "s3cret" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.approver.method).toBe("shared-key");
      expect(r.approver.principalKind).toBe("credential-fingerprint");
      expect(r.approver.principal).toMatch(/^key:[0-9a-f]{16}$/);
    }
  });

  it("accepts the correct Authorization: Bearer token", async () => {
    process.env[ENV] = "s3cret";
    const r = await authorizeIncorporate(post({ authorization: "Bearer s3cret" }));
    expect(r.ok).toBe(true);
  });
});
