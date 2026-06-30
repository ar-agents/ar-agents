import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPublicKey, verify as edVerify } from "node:crypto";

/**
 * Sprint 2 · Part B — the certifier-with-teeth (signed, listed, revocable cert).
 *
 * Invariants under test:
 *  - issue produces an Ed25519-signed certificate whose signature verifies
 *    OFFLINE by mirroring arg-verify's `attestation`/`certificate` verb: Ed25519
 *    over canonical006(certificateSignedBody(cert)), sig + publicKey STANDARD
 *    base64, public key resolvable at /.well-known/sociedad-ia/keys.
 *  - issue REFUSES below the C floor (the gate that keeps the registry honest).
 *  - revoke flips status → "revoked", records who/why, and RE-SIGNS so the stored
 *    document's signature still verifies over its (now revoked) body.
 *  - a swapped/altered field breaks the signature (no forgery).
 *  - expiry is recomputed at read (a cert past expiresAt reads "expired") without
 *    invalidating the issued signature.
 *  - attestationRef forwards the SUBJECT's own anchor pointers (trust-minimized).
 *  - list / getLatestForUrl resolve the stored certs.
 *
 * KV is NOT wired in the test env, so the lib's in-memory fallback is exercised;
 * __resetMemForTests keeps cases isolated.
 */

// Throwaway Ed25519 keypair (same fixture the attestation-timestamp test uses).
const PRIV = "MC4CAQAwBQYDK2VwBCIEIGW8zyK1X-q0ILg2EjyzDdZU43pHsva8CfRRZ_ZibcGv";
const PUB_SPKI_B64URL = "MCowBQYDK2VwAyEAjFW5_BXTil8F7Jxhg269rWf7ulhKbo_mVHGf7bBwAoA";

import {
  issueCertificate,
  revokeCertificate,
  getCertificate,
  listCertificates,
  getLatestForUrl,
  certificateSignedBody,
  withRecomputedStatus,
  CERT_KEY_ID,
  type Certificate,
  type CertReportSummary,
} from "../src/lib/certificate";
import { canonical006 } from "../src/lib/ledger";

const PASSING: CertReportSummary = {
  score: 92,
  rating: "A",
  rfcConformance: { "rfc-002-v1": "pass", "rfc-004-draft": "pass" },
};

const BELOW: CertReportSummary = {
  score: 40,
  rating: "D",
  rfcConformance: { "rfc-002-v1": "partial", "rfc-004-draft": "fail" },
};

/** Offline Ed25519 verify, identical to arg-verify's attestation verb. */
function verifyOffline(cert: Certificate): boolean {
  const body = certificateSignedBody(cert);
  const pub = createPublicKey({
    key: Buffer.from(cert.publicKey, "base64"),
    format: "der",
    type: "spki",
  });
  return edVerify(
    null,
    Buffer.from(canonical006(body), "utf8"),
    pub,
    Buffer.from(cert.sig, "base64"),
  );
}

beforeEach(async () => {
  process.env.AUDIT_ED25519_PRIVATE_KEY = PRIV;
  process.env.AUDIT_ED25519_PUBLIC_KEY = PUB_SPKI_B64URL;
  // Ensure KV is treated as unwired → exercise the in-memory fallback.
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  const mod = await import("../src/lib/certificate");
  mod.__resetMemForTests();
});

afterEach(() => {
  delete process.env.AUDIT_ED25519_PRIVATE_KEY;
  delete process.env.AUDIT_ED25519_PUBLIC_KEY;
});

describe("issueCertificate", () => {
  it("issues a signed cert that verifies OFFLINE (Ed25519 over canonical006(body))", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
      operator: "Juan Pérez",
      jurisdiction: "AR",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const cert = res.certificate;

    expect(cert.certId).toMatch(/^cert_[a-f0-9]{32}$/);
    expect(cert.status).toBe("valid");
    expect(cert.alg).toBe("Ed25519");
    expect(cert.keyId).toBe(CERT_KEY_ID);
    expect(cert.sig).toBe(cert.signature);
    expect(cert.certifierReport.score).toBe(92);
    expect(cert.subject.baseUrl).toBe("https://demo.example.com");
    expect(cert.subject.registryId).toBe("demo-sociedad");
    // The dereferenceable public URL.
    expect(res.url).toBe(`https://ar-agents.ar/api/certifier/cert/${cert.certId}`);

    // Offline-verifiable without trusting the server.
    expect(verifyOffline(cert)).toBe(true);
  });

  it("forwards the subject's own anchor pointers in attestationRef (trust-minimized)", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const ref = res.certificate.attestationRef;
    // The SUBJECT's own per-session attestation (slug = registryId), the witness
    // anchor chain, and the raw OTS proof template — NOT just the ar-agents key.
    expect(ref.attestationUrl).toBe(
      "https://ar-agents.ar/api/audit/demo-sociedad/attestation",
    );
    expect(ref.anchorChainUrl).toBe("https://ar-agents.ar/api/audit/anchor");
    expect(ref.anchorOtsUrlTemplate).toContain("/api/audit/anchor/{seq}/ots");
    expect(ref.verify.publicKeyUrl).toBe(
      "https://ar-agents.ar/.well-known/sociedad-ia/keys",
    );
    expect(ref.note.toLowerCase()).toContain("convenience");
  });

  it("REFUSES to issue below the C floor (keeps the registry honest)", async () => {
    const res = await issueCertificate({
      baseUrl: "https://weak.example.com",
      report: BELOW,
      registryId: "weak-sociedad",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("below_min_rating");
  });

  it("refuses to sign when the Ed25519 key is absent (never stores an unsigned cert)", async () => {
    delete process.env.AUDIT_ED25519_PRIVATE_KEY;
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("signing_unavailable");
  });

  it("rejects a tampered body (signature does not verify after alteration)", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const forged: Certificate = {
      ...res.certificate,
      certifierReport: { ...res.certificate.certifierReport, score: 100 },
    };
    expect(verifyOffline(forged)).toBe(false);
  });
});

describe("getCertificate / list / getLatestForUrl", () => {
  it("stores + retrieves a cert; list + by-url index resolve it", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const got = await getCertificate(res.certificate.certId);
    expect(got).not.toBeNull();
    expect(got!.certId).toBe(res.certificate.certId);

    const all = await listCertificates();
    expect(all.map((c) => c.certId)).toContain(res.certificate.certId);

    const latest = await getLatestForUrl("https://demo.example.com");
    expect(latest!.certId).toBe(res.certificate.certId);
  });

  it("returns null for an unknown certId", async () => {
    expect(await getCertificate("cert_deadbeefdeadbeefdeadbeefdeadbeef")).toBeNull();
  });
});

describe("revokeCertificate (the teeth)", () => {
  it("flips status → revoked, records who/why, and RE-SIGNS (sig still verifies)", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const certId = res.certificate.certId;

    // Sanity: the valid cert's sig verifies before revoke.
    expect(verifyOffline(res.certificate)).toBe(true);

    const rev = await revokeCertificate(certId, "operator lapsed conformance", "admin");
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    expect(rev.certificate.status).toBe("revoked");
    expect(rev.certificate.revocation?.by).toBe("admin");
    expect(rev.certificate.revocation?.reason).toBe("operator lapsed conformance");
    // The re-signed body still verifies (a stale "valid" sig can never linger).
    expect(verifyOffline(rev.certificate)).toBe(true);

    // The stored doc reflects revocation on the next read.
    const got = await getCertificate(certId);
    expect(got!.status).toBe("revoked");
    expect(verifyOffline(got!)).toBe(true);
  });

  it("is idempotent-safe: a second revoke reports already_revoked", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
    });
    if (!res.ok) return;
    await revokeCertificate(res.certificate.certId, "x", "owner");
    const again = await revokeCertificate(res.certificate.certId, "y", "owner");
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toBe("already_revoked");
  });

  it("returns not_found for an unknown certId", async () => {
    const r = await revokeCertificate("cert_deadbeefdeadbeefdeadbeefdeadbeef", "x", "owner");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toBe("not_found");
  });
});

describe("expiry (recomputed at read)", () => {
  it("reads as expired past expiresAt without invalidating the issued signature", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
      ttlDays: 1,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const cert = res.certificate;

    // Before expiry: valid.
    expect(withRecomputedStatus(cert, Date.parse(cert.issuedAt)).status).toBe("valid");

    // After expiresAt: expired — but the issued signature still verifies over the
    // ORIGINAL body (expiry is a clock function, not a re-signed assertion).
    const future = Date.parse(cert.expiresAt) + 1000;
    const expired = withRecomputedStatus(cert, future);
    expect(expired.status).toBe("expired");
    expect(verifyOffline(cert)).toBe(true);
  });

  it("a revoked cert stays revoked even past expiry (revocation wins)", async () => {
    const res = await issueCertificate({
      baseUrl: "https://demo.example.com",
      report: PASSING,
      registryId: "demo-sociedad",
      ttlDays: 1,
    });
    if (!res.ok) return;
    const rev = await revokeCertificate(res.certificate.certId, "fraud", "admin");
    if (!rev.ok) return;
    const future = Date.parse(rev.certificate.expiresAt) + 1000;
    expect(withRecomputedStatus(rev.certificate, future).status).toBe("revoked");
  });
});
