import { afterEach, describe, expect, it } from "vitest";
import { AttestationClient, type AttestAdapter } from "@ar-agents/identity-attest";
import {
  attestationConfigured,
  attestationRequired,
  verifyPresentedAttestation,
} from "../src/lib/admin-attestation";

const SECRET = "attest-signing-secret-0123456789abcdef"; // >= 16 chars
const CODE = "424242";
const DECLARED = "20123456786"; // canonical of 20-12345678-6

/** A real-but-local adapter so we can MINT genuinely-signed attestations (the
 *  package signs them; we then verify via the package). No network, no Meta. */
class MockOtpAdapter implements AttestAdapter {
  readonly id = "mock_otp";
  constructor(readonly trustLevel: number = 0.5) {}
  generateSecret(): string {
    return CODE;
  }
  async deliverChallenge(): Promise<void> {
    /* no-op: the code is "delivered" out of band in the test */
  }
  async verify(params: {
    requestId: string;
    storedSecret: string;
    submitted: { code?: string; token?: string; oauthCode?: string };
    subject: { type: string; value: string };
  }): Promise<{ verified: true; claims?: Record<string, unknown> } | { verified: false; reason: string }> {
    return params.submitted.code === params.storedSecret
      ? { verified: true }
      : { verified: false, reason: "bad code" };
  }
}

async function mint(subject: { type: string; value: string }, trustLevel = 0.5) {
  const client = new AttestationClient({
    signingSecret: SECRET,
    adapters: { mock_otp: new MockOtpAdapter(trustLevel) },
  });
  const req = await client.requestVerification({
    method: "mock_otp",
    subject: subject as never,
  });
  return client.submitOtp(req.requestId, CODE);
}

describe("admin-attestation KYC seam (Phase 2 #6)", () => {
  afterEach(() => {
    delete process.env.IDENTITY_ATTEST_SECRET;
    delete process.env.IDENTITY_ATTEST_MIN_TRUST;
    delete process.env.IDENTITY_ATTEST_REQUIRED;
  });

  it("config flags reflect the env (unconfigured by default)", () => {
    expect(attestationConfigured()).toBe(false);
    expect(attestationRequired()).toBe(false);
    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    expect(attestationConfigured()).toBe(true);
    process.env.IDENTITY_ATTEST_REQUIRED = "true";
    expect(attestationRequired()).toBe(true);
  });

  it("treats a too-short secret as unconfigured (won't boot a throwing client)", () => {
    process.env.IDENTITY_ATTEST_SECRET = "short";
    expect(attestationConfigured()).toBe(false);
  });

  it("accepts a valid CUIT-subject attestation matching the declared CUIT", async () => {
    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    const att = await mint({ type: "cuit", value: "20-12345678-6" });
    const r = await verifyPresentedAttestation({ attestation: att, expectedCuit: DECLARED });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.subjectType).toBe("cuit");
    expect(r.summary.subjectMatchesCuit).toBe(true);
    expect(r.summary.trustLevel).toBe(0.5);
    expect(r.summary.method).toBe("mock_otp");
  });

  it("accepts a phone-subject attestation as channel proof (subjectMatchesCuit false)", async () => {
    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    const att = await mint({ type: "phone", value: "+5491112345678" });
    const r = await verifyPresentedAttestation({ attestation: att, expectedCuit: DECLARED });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.summary.subjectMatchesCuit).toBe(false);
    expect(r.summary.subjectType).toBe("phone");
  });

  it("rejects a CUIT-subject attestation for a DIFFERENT cuit (attestacion_otro_cuit)", async () => {
    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    const att = await mint({ type: "cuit", value: "27-11111111-1" });
    const r = await verifyPresentedAttestation({ attestation: att, expectedCuit: DECLARED });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("attestacion_otro_cuit");
  });

  it("rejects a tampered attestation (the signature binds trustLevel)", async () => {
    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    const att = await mint({ type: "cuit", value: "20-12345678-6" }, 0.5);
    const tampered = { ...att, trustLevel: 0.95 }; // bumped without re-signing
    const r = await verifyPresentedAttestation({ attestation: tampered, expectedCuit: DECLARED });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("firma_invalida");
  });

  it("rejects when trust is below the configured minimum", async () => {
    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    process.env.IDENTITY_ATTEST_MIN_TRUST = "0.7";
    const att = await mint({ type: "cuit", value: "20-12345678-6" }, 0.5);
    const r = await verifyPresentedAttestation({ attestation: att, expectedCuit: DECLARED });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("confianza_insuficiente");
  });

  it("rejects an unconfigured seam and a malformed attestation", async () => {
    const r1 = await verifyPresentedAttestation({ attestation: {}, expectedCuit: DECLARED });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe("attestation_no_configurada");

    process.env.IDENTITY_ATTEST_SECRET = SECRET;
    const r2 = await verifyPresentedAttestation({ attestation: { foo: 1 }, expectedCuit: DECLARED });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe("attestacion_malformada");
  });
});
