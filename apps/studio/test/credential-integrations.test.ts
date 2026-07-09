import { describe, expect, it } from "vitest";
import {
  INTEGRATION_ENV_VARS,
  INTEGRATION_IDS,
  isIntegrationId,
} from "../src/lib/credential-integrations";

describe("INTEGRATION_ENV_VARS", () => {
  it("has an entry for every integration id, each with at least one env var", () => {
    for (const id of INTEGRATION_IDS) {
      expect(INTEGRATION_ENV_VARS[id].length).toBeGreaterThan(0);
    }
  });

  // These are the exact names apps/sociedad-ia-starter/src/lib/clients.ts
  // reads (see that file's `have("...")` calls and .env.example): the
  // wizard must match them exactly, or a saved credential would silently
  // never wire up the deployed agent.
  it("matches the starter's canonical env var names", () => {
    expect(INTEGRATION_ENV_VARS.model_key).toEqual(["ANTHROPIC_API_KEY"]);
    expect(INTEGRATION_ENV_VARS.mercadopago).toEqual(["MERCADOPAGO_ACCESS_TOKEN"]);
    expect(INTEGRATION_ENV_VARS.whatsapp).toEqual(["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]);
    expect(INTEGRATION_ENV_VARS.afip).toEqual(["AFIP_CERT_PEM", "AFIP_KEY_PEM", "AFIP_CUIT", "AFIP_ENV"]);
    expect(INTEGRATION_ENV_VARS.treasury_offramp).toEqual([
      "MANTECA_API_KEY",
      "MANTECA_USER_ID",
      "MANTECA_BANK_ACCOUNT_ID",
    ]);
  });
});

describe("isIntegrationId", () => {
  it("accepts every known id", () => {
    for (const id of INTEGRATION_IDS) expect(isIntegrationId(id)).toBe(true);
  });

  it("rejects unknown strings and non-strings", () => {
    expect(isIntegrationId("not_a_real_one")).toBe(false);
    expect(isIntegrationId(123)).toBe(false);
    expect(isIntegrationId(null)).toBe(false);
    expect(isIntegrationId(undefined)).toBe(false);
  });
});
