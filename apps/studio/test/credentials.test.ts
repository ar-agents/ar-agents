import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
vi.mock("@vercel/kv", () => ({
  kv: {
    set: async (k: string, v: unknown) => {
      hoisted.store.set(k, v);
      return "OK";
    },
    get: async (k: string) => hoisted.store.get(k) ?? null,
  },
}));

import {
  getAllCredentialMeta,
  getCredentialMeta,
  maskedHint,
  setCredentialMeta,
  type CredentialMeta,
} from "../src/lib/credentials";
import { INTEGRATION_IDS } from "../src/lib/credential-integrations";

beforeEach(() => {
  hoisted.store.clear();
  process.env.KV_REST_API_URL = "https://stub.upstash.io";
  process.env.KV_REST_API_TOKEN = "stub";
});

afterEach(() => {
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
});

describe("maskedHint", () => {
  it("returns the last 4 characters for a secret longer than 4 chars", () => {
    expect(maskedHint("APP_USR-1234567890")).toBe("7890");
  });

  it("returns null for a secret at or under 4 chars (nothing safe to show)", () => {
    expect(maskedHint("abcd")).toBeNull();
    expect(maskedHint("ab")).toBeNull();
    expect(maskedHint("")).toBeNull();
  });

  it("never returns anything longer than 4 characters", () => {
    const hint = maskedHint("a-very-long-secret-value-indeed");
    expect(hint).not.toBeNull();
    expect(hint!.length).toBeLessThanOrEqual(4);
  });
});

describe("credential metadata store", () => {
  it("round-trips one integration's metadata, never the secret itself", async () => {
    const accountId = "acct-1";
    const meta: CredentialMeta = {
      integration: "mercadopago",
      configured: true,
      verified: true,
      maskedHint: "7890",
      updatedAt: new Date().toISOString(),
    };
    await setCredentialMeta(accountId, "mercadopago", meta);
    const got = await getCredentialMeta(accountId, "mercadopago");
    expect(got).toEqual(meta);

    // Nothing resembling a secret value ever lands in the KV store: only the
    // masked hint (short, non-reversible) is present.
    const raw = hoisted.store.get(`studio:credentials:${accountId}:mercadopago`) as CredentialMeta;
    expect(JSON.stringify(raw)).not.toContain("APP_USR");
    expect(raw.maskedHint).toBe("7890");
  });

  it("getCredentialMeta returns null for an unconfigured integration", async () => {
    expect(await getCredentialMeta("acct-2", "whatsapp")).toBeNull();
  });

  it("isolates metadata per account", async () => {
    await setCredentialMeta("acct-a", "afip", {
      integration: "afip",
      configured: true,
      verified: false,
      maskedHint: "6543",
      updatedAt: new Date().toISOString(),
    });
    expect(await getCredentialMeta("acct-b", "afip")).toBeNull();
  });

  it("getAllCredentialMeta returns one entry per requested integration, null when unset", async () => {
    await setCredentialMeta("acct-3", "model_key", {
      integration: "model_key",
      configured: true,
      verified: false,
      maskedHint: null,
      modelChoice: "platform",
      updatedAt: new Date().toISOString(),
    });
    const all = await getAllCredentialMeta("acct-3", INTEGRATION_IDS);
    expect(Object.keys(all)).toEqual([...INTEGRATION_IDS]);
    expect(all.model_key?.modelChoice).toBe("platform");
    expect(all.mercadopago).toBeNull();
    expect(all.whatsapp).toBeNull();
    expect(all.afip).toBeNull();
    expect(all.treasury_offramp).toBeNull();
  });
});
