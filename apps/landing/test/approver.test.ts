/**
 * T5: the approver identity-attestation, and the proof that it is BOUND into
 * the signed audit entry (tamper-evident). This is the art. 102 record: the
 * log proves not just what was constituted but which credential approved it
 * and which human was named as administrator.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { authorizeIncorporate } from "../src/lib/incorporate-auth";
import {
  appendAudit,
  type ApproverAttestation,
  type AuditEntry,
  readAudit,
  verifyEntry,
} from "../src/lib/audit";

const KEY = "test-incorporate-key-aaaaaaaaaaaaaaaaaaaa";
const SECRET = "test-secret-32-chars-aaaaaaaaaaaaaaaaaaaa";

function reqWith(headers: Record<string, string> = {}): Request {
  return new Request("https://ar-agents.ar/api/auto-incorporate", {
    method: "POST",
    headers,
  });
}

// The gate (500 / 401 / correct credential) and the basic attestation shape
// live in incorporate.test.ts's authorizeIncorporate() block. Here we cover the
// two security properties specific to the attestation: the principal is a
// fingerprint that never exposes the secret, and it is stable per credential.
describe("approver attestation (security properties)", () => {
  afterEach(() => {
    delete process.env.INCORPORATE_API_KEY;
  });

  it("the principal is a fingerprint, never the secret itself", async () => {
    process.env.INCORPORATE_API_KEY = KEY;
    const r = await authorizeIncorporate(reqWith({ authorization: `Bearer ${KEY}` }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.approver.principal).toMatch(/^key:[0-9a-f]{16}$/);
      expect(r.approver.principal).not.toContain(KEY);
    }
  });

  it("the fingerprint is stable across calls (same credential → same principal)", async () => {
    process.env.INCORPORATE_API_KEY = KEY;
    const a = await authorizeIncorporate(reqWith({ authorization: `Bearer ${KEY}` }));
    const b = await authorizeIncorporate(reqWith({ authorization: `Bearer ${KEY}` }));
    expect(a.ok && b.ok && a.approver.principal === b.approver.principal).toBe(true);
  });
});

describe("approver attestation is bound into the signed audit entry", () => {
  beforeEach(() => {
    process.env.AUDIT_HMAC_SECRET = SECRET;
    delete process.env.KV_REST_API_URL; // exercise the in-memory store
    delete process.env.KV_REST_API_TOKEN;
  });
  afterEach(() => {
    delete process.env.AUDIT_HMAC_SECRET;
  });

  const approver: ApproverAttestation = {
    method: "shared-key",
    principal: "key:0123456789abcdef",
    principalKind: "credential-fingerprint",
    declaredBy: "Juan Pérez",
  };

  it("an entry carrying an approver verifies clean", async () => {
    const sid = "approver-bind-1";
    await appendAudit(sid, {
      tool: "auto_incorporate",
      governance: "audit-logged",
      approver,
      input: { denominacion: "Falsa SAS" },
    });
    const [entry] = await readAudit(sid);
    expect(entry!.approver).toEqual(approver);
    expect(await verifyEntry(entry!)).toBe(true);
  });

  it("forging the named administrator breaks verification", async () => {
    const sid = "approver-bind-2";
    await appendAudit(sid, {
      tool: "auto_incorporate",
      governance: "audit-logged",
      approver,
      input: { denominacion: "Falsa SAS" },
    });
    const [entry] = await readAudit(sid);
    const forged: AuditEntry = {
      ...entry!,
      approver: { ...approver, declaredBy: "Mallory" },
    };
    expect(await verifyEntry(forged)).toBe(false);
  });

  it("forging the credential fingerprint breaks verification", async () => {
    const sid = "approver-bind-3";
    await appendAudit(sid, {
      tool: "auto_incorporate",
      governance: "audit-logged",
      approver,
      input: { denominacion: "Falsa SAS" },
    });
    const [entry] = await readAudit(sid);
    const forged: AuditEntry = {
      ...entry!,
      approver: { ...approver, principal: "key:ffffffffffffffff" },
    };
    expect(await verifyEntry(forged)).toBe(false);
  });
});
