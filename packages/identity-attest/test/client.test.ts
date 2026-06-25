import { describe, expect, it, beforeEach } from "vitest";
import {
  AttestationClient,
  EmailMagicLinkAdapter,
  InMemoryAttestationStore,
  InvalidOtpCodeError,
  SubjectMismatchError,
  TooManyAttemptsError,
  VerificationExpiredError,
  VerificationRequestNotFoundError,
  WhatsAppOtpAdapter,
  type AttestAdapter,
  type AttestationStore,
  type EmailSender,
  type TrustLevel,
  type VerificationSubject,
  type WhatsAppLikeClient,
} from "../src";

const SIGNING_SECRET = "test-secret-min-16-chars-long-please";

// In-memory mock WhatsApp client that records sends.
function createMockWa(): WhatsAppLikeClient & { sends: Array<{ to: string; text: string }> } {
  const sends: Array<{ to: string; text: string }> = [];
  return {
    sends,
    async sendText({ to, text }) {
      sends.push({ to, text });
      return { messageId: "mock-msg" };
    },
  };
}

// In-memory mock email sender
function createMockEmail(): EmailSender & { emails: Array<{ to: string; subject: string; html: string }> } {
  const emails: Array<{ to: string; subject: string; html: string }> = [];
  const fn = (async ({ to, subject, html }) => {
    emails.push({ to, subject, html });
  }) as EmailSender & { emails: typeof emails };
  fn.emails = emails;
  return fn;
}

describe("AttestationClient construction", () => {
  it("throws when signingSecret is missing or short", () => {
    expect(
      () =>
        new AttestationClient({
          signingSecret: "short",
          adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: createMockWa() }) },
        }),
    ).toThrow(/signingSecret/);
  });

  it("throws when no adapters registered", () => {
    expect(
      () => new AttestationClient({ signingSecret: SIGNING_SECRET, adapters: {} }),
    ).toThrow(/adapter/i);
  });

  it("lists registered adapters with trust levels", () => {
    const wa = createMockWa();
    const email = createMockEmail();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: {
        whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }),
        email_magic_link: new EmailMagicLinkAdapter({
          sender: email,
          callbackBaseUrl: "https://app.test/cb",
        }),
      },
    });
    const adapters = client.listAdapters();
    expect(adapters).toEqual(
      expect.arrayContaining([
        { id: "whatsapp_otp", trustLevel: 0.3 },
        { id: "email_magic_link", trustLevel: 0.5 },
      ]),
    );
  });
});

describe("WhatsApp OTP flow (end-to-end)", () => {
  let wa: ReturnType<typeof createMockWa>;
  let client: AttestationClient;
  let store: InMemoryAttestationStore;

  beforeEach(() => {
    wa = createMockWa();
    store = new InMemoryAttestationStore();
    client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa, businessName: "TestApp" }) },
      store,
    });
  });

  it("creates a request, sends OTP via WhatsApp, then verifies on correct code", async () => {
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });

    expect(request.requestId).toBeTruthy();
    expect(request.status).toBe("pending");
    expect(request.method).toBe("whatsapp_otp");
    expect(request.trustLevel).toBe(0.3);
    expect(request.challenge).toBeNull();
    expect(request.verificationUrl).toBeNull();

    // WA was called with the OTP code in the message body
    expect(wa.sends).toHaveLength(1);
    expect(wa.sends[0]!.to).toBe("5491112345678");
    expect(wa.sends[0]!.text).toMatch(/TestApp/);
    const codeMatch = wa.sends[0]!.text.match(/(\d{6})/);
    expect(codeMatch).toBeTruthy();
    const code = codeMatch![1]!;

    // User submits the code
    const attestation = await client.submitOtp(request.requestId, code);
    expect(attestation.requestId).toBe(request.requestId);
    expect(attestation.verifier).toBe("whatsapp_otp");
    expect(attestation.trustLevel).toBe(0.3);
    expect(attestation.subject).toEqual({ type: "phone", value: "5491112345678" });
    expect(attestation.signature).toMatch(/^[a-f0-9]{64}$/);
  });

  it("throws InvalidOtpCodeError on wrong code, decrements attempts", async () => {
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    await expect(client.submitOtp(request.requestId, "000000")).rejects.toBeInstanceOf(
      InvalidOtpCodeError,
    );
    // Status still pending (attempts > 0)
    const status = await client.getRequestStatus(request.requestId);
    expect(status.status).toBe("pending");
  });

  it("throws TooManyAttemptsError after 3 failed tries", async () => {
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    await expect(client.submitOtp(request.requestId, "000000")).rejects.toBeInstanceOf(
      InvalidOtpCodeError,
    );
    await expect(client.submitOtp(request.requestId, "000000")).rejects.toBeInstanceOf(
      InvalidOtpCodeError,
    );
    await expect(client.submitOtp(request.requestId, "000000")).rejects.toBeInstanceOf(
      TooManyAttemptsError,
    );
    const status = await client.getRequestStatus(request.requestId);
    expect(status.status).toBe("failed");
  });

  it("returns the same attestation when submitOtp is called twice (idempotent on success)", async () => {
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    const code = wa.sends[0]!.text.match(/(\d{6})/)![1]!;
    const att1 = await client.submitOtp(request.requestId, code);
    const att2 = await client.submitOtp(request.requestId, code);
    expect(att1.signature).toBe(att2.signature);
    expect(att1.verifiedAt).toBe(att2.verifiedAt);
  });
});

describe("OTP attempt counter — concurrency hardening (DeepSec MEDIUM)", () => {
  class CountingAdapter implements AttestAdapter {
    readonly id = "counting";
    readonly trustLevel = 0.3 as TrustLevel;
    verifyCalls = 0;
    generateSecret(): string {
      return "123456";
    }
    async deliverChallenge(): Promise<void> {}
    async verify(p: {
      submitted: { code?: string };
    }): Promise<{ verified: true } | { verified: false; reason: string }> {
      this.verifyCalls++;
      return p.submitted.code === "123456"
        ? { verified: true }
        : { verified: false, reason: "wrong" };
    }
  }

  it("never runs more than maxAttempts verifications under a concurrent burst", async () => {
    const adapter = new CountingAdapter();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { counting: adapter },
      maxAttempts: 3,
    });
    const req = await client.requestVerification({
      method: "counting",
      subject: { type: "phone", value: "+5491100000000" },
    });
    // 20 simultaneous WRONG guesses. The pre-fix read-modify-write let all 20
    // read the same counter and each verify; the atomic claim caps it.
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => client.submitOtp(req.requestId, "000000")),
    );
    expect(adapter.verifyCalls).toBeLessThanOrEqual(3);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    const status = await client.getRequestStatus(req.requestId);
    expect(status.status).toBe("failed");
  });

  it("a correct guess within budget still succeeds under concurrency", async () => {
    const adapter = new CountingAdapter();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { counting: adapter },
      maxAttempts: 3,
    });
    const req = await client.requestVerification({
      method: "counting",
      subject: { type: "phone", value: "+5491100000001" },
    });
    const results = await Promise.allSettled([
      client.submitOtp(req.requestId, "000000"),
      client.submitOtp(req.requestId, "123456"), // correct
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("CONSUMES the attempt when the adapter throws (no refund — bounds total verify calls)", async () => {
    // A thrown verify() is attacker-influenceable, so it must NOT be free:
    // every submission, throw or not, costs one attempt. This caps total
    // adapter.verify() invocations (the cost/DoS + brute-force vector).
    class ThrowingAdapter implements AttestAdapter {
      readonly id = "throwing";
      readonly trustLevel = 0.3 as TrustLevel;
      verifyCalls = 0;
      generateSecret(): string {
        return "123456";
      }
      async deliverChallenge(): Promise<void> {}
      async verify(): Promise<{ verified: true } | { verified: false; reason: string }> {
        this.verifyCalls++;
        throw new Error("IdP down");
      }
    }
    const adapter = new ThrowingAdapter();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { throwing: adapter },
      maxAttempts: 2,
    });
    const req = await client.requestVerification({
      method: "throwing",
      subject: { type: "phone", value: "+5491100000002" },
    });
    await expect(client.submitOtp(req.requestId, "x")).rejects.toThrow(/IdP down/);
    await expect(client.submitOtp(req.requestId, "x")).rejects.toThrow(/IdP down/);
    // Budget exhausted by the two throws — no unlimited retries.
    await expect(client.submitOtp(req.requestId, "x")).rejects.toBeInstanceOf(
      TooManyAttemptsError,
    );
    expect(adapter.verifyCalls).toBe(2); // capped at maxAttempts, NOT unbounded
  });

  it("caps attempts under concurrency even when the store lacks atomic decrement (in-process lock)", async () => {
    const inner = new InMemoryAttestationStore();
    // Expose only the required methods → no decrementAttempts → forces the
    // read-modify-write fallback, which the client serializes per-request with
    // an in-process lock. Without that lock, 20 concurrent guesses race to 20
    // verify() calls (the bypass); with it, the cap holds.
    const nonAtomic: AttestationStore = {
      saveRequest: inner.saveRequest.bind(inner),
      updateRequest: inner.updateRequest.bind(inner),
      getRequest: inner.getRequest.bind(inner),
      saveAttestation: inner.saveAttestation.bind(inner),
      getAttestation: inner.getAttestation.bind(inner),
      listAttestationsForSubject: inner.listAttestationsForSubject.bind(inner),
    };
    const adapter = new CountingAdapter();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { counting: adapter },
      store: nonAtomic,
      maxAttempts: 3,
    });
    const req = await client.requestVerification({
      method: "counting",
      subject: { type: "phone", value: "+5491100000003" },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => client.submitOtp(req.requestId, "000000")),
    );
    expect(adapter.verifyCalls).toBeLessThanOrEqual(3);
    expect(results.every((r) => r.status === "rejected")).toBe(true);
    expect((await client.getRequestStatus(req.requestId)).status).toBe("failed");
  });
});

describe("subject binding (verifiedSubject) — DeepSec deferred HIGH", () => {
  class StubAdapter implements AttestAdapter {
    readonly id = "stub";
    readonly trustLevel = 0.5 as TrustLevel;
    constructor(private readonly vs?: VerificationSubject) {}
    generateSecret(): string {
      return "x";
    }
    async deliverChallenge(): Promise<void> {}
    async verify(): Promise<
      | { verified: true; verifiedSubject?: VerificationSubject }
      | { verified: false; reason: string }
    > {
      return this.vs ? { verified: true, verifiedSubject: this.vs } : { verified: true };
    }
  }

  it("rejects (fail closed) when the proven subject differs from the requested subject", async () => {
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { stub: new StubAdapter({ type: "email", value: "attacker@evil.com" }) },
    });
    const req = await client.requestVerification({
      method: "stub",
      subject: { type: "email", value: "victim@good.com" },
    });
    await expect(client.submitOtp(req.requestId, "anything")).rejects.toBeInstanceOf(
      SubjectMismatchError,
    );
    expect(await client.getAttestation(req.requestId)).toBeNull(); // no attestation minted
    expect((await client.getRequestStatus(req.requestId)).status).toBe("failed");
  });

  it("issues when the proven subject matches (case/whitespace-insensitive for email)", async () => {
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { stub: new StubAdapter({ type: "email", value: " USER@Good.com " }) },
    });
    const req = await client.requestVerification({
      method: "stub",
      subject: { type: "email", value: "user@good.com" },
    });
    const att = await client.submitOtp(req.requestId, "x");
    expect(att.subject).toEqual({ type: "email", value: "user@good.com" });
  });

  it("issues normally when the adapter OMITS verifiedSubject (channel-bound adapters)", async () => {
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { stub: new StubAdapter() },
    });
    const req = await client.requestVerification({
      method: "stub",
      subject: { type: "phone", value: "+5491111111111" },
    });
    const att = await client.submitOtp(req.requestId, "x");
    expect(att.requestId).toBe(req.requestId);
  });
});

describe("Email magic-link flow (end-to-end)", () => {
  let emailSender: ReturnType<typeof createMockEmail>;
  let client: AttestationClient;

  beforeEach(() => {
    emailSender = createMockEmail();
    client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: {
        email_magic_link: new EmailMagicLinkAdapter({
          sender: emailSender,
          callbackBaseUrl: "https://app.test/api/identity-attest/callback",
          businessName: "LautaroSaaS",
        }),
      },
    });
  });

  it("creates request with verification URL containing request_id + token", async () => {
    const request = await client.requestVerification({
      method: "email_magic_link",
      subject: { type: "email", value: "lautaro@test.com" },
    });
    expect(request.verificationUrl).toMatch(/^https:\/\/app\.test\/api\/identity-attest\/callback/);
    expect(request.verificationUrl).toContain(`request_id=${request.requestId}`);
    expect(request.verificationUrl).toContain("token=");
    expect(emailSender.emails).toHaveLength(1);
    expect(emailSender.emails[0]!.subject).toMatch(/LautaroSaaS/);
  });

  it("verifies when correct token is submitted (callback flow)", async () => {
    const request = await client.requestVerification({
      method: "email_magic_link",
      subject: { type: "email", value: "lautaro@test.com" },
    });
    const url = new URL(request.verificationUrl!);
    const token = url.searchParams.get("token")!;
    const attestation = await client.submitMagicLinkToken(request.requestId, token);
    expect(attestation.verifier).toBe("email_magic_link");
    expect(attestation.trustLevel).toBe(0.5);
  });
});

describe("Attestation signature verification", () => {
  it("validates a freshly-issued attestation", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
    });
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    const code = wa.sends[0]!.text.match(/(\d{6})/)![1]!;
    const attestation = await client.submitOtp(request.requestId, code);
    await expect(client.verifyAttestationSignature(attestation)).resolves.toBeUndefined();
  });

  it("rejects an attestation with tampered subject", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
    });
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    const code = wa.sends[0]!.text.match(/(\d{6})/)![1]!;
    const attestation = await client.submitOtp(request.requestId, code);
    const tampered = { ...attestation, subject: { type: "phone" as const, value: "5499999999999" } };
    await expect(client.verifyAttestationSignature(tampered)).rejects.toThrow(/signature/i);
  });

  it("rejects an attestation with tampered claims or externalReference (now covered by the HMAC)", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
    });
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
      externalReference: "order-1",
    });
    const code = wa.sends[0]!.text.match(/(\d{6})/)![1]!;
    const attestation = await client.submitOtp(request.requestId, code);

    // These fields were NOT in the old delimiter HMAC, so tampering used to be
    // undetectable. They must now break the signature.
    await expect(
      client.verifyAttestationSignature({
        ...attestation,
        claims: { ...(attestation.claims ?? {}), role: "admin" },
      }),
    ).rejects.toThrow(/signature/i);
    await expect(
      client.verifyAttestationSignature({ ...attestation, externalReference: "order-999" }),
    ).rejects.toThrow(/signature/i);
  });
});

describe("Subject lookup (findLatestAttestationForSubject)", () => {
  it("returns the most recent valid attestation for a subject", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
    });

    const r1 = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    const code1 = wa.sends[wa.sends.length - 1]!.text.match(/(\d{6})/)![1]!;
    await client.submitOtp(r1.requestId, code1);

    const r2 = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    const code2 = wa.sends[wa.sends.length - 1]!.text.match(/(\d{6})/)![1]!;
    await new Promise((r) => setTimeout(r, 10)); // ensure different timestamps
    await client.submitOtp(r2.requestId, code2);

    const found = await client.findLatestAttestationForSubject("phone", "5491112345678");
    expect(found?.requestId).toBe(r2.requestId);
  });

  it("filters by minimum trust level", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
    });
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    const code = wa.sends[0]!.text.match(/(\d{6})/)![1]!;
    await client.submitOtp(request.requestId, code);

    const matchesHighTrust = await client.findLatestAttestationForSubject("phone", "5491112345678", 0.7);
    expect(matchesHighTrust).toBeNull();
    const matchesLowTrust = await client.findLatestAttestationForSubject("phone", "5491112345678", 0.2);
    expect(matchesLowTrust).not.toBeNull();
  });
});

describe("Request expiry + not-found", () => {
  it("throws VerificationRequestNotFoundError on unknown id", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
    });
    await expect(client.getRequestStatus("nonexistent")).rejects.toBeInstanceOf(
      VerificationRequestNotFoundError,
    );
    await expect(client.submitOtp("nonexistent", "123456")).rejects.toBeInstanceOf(
      VerificationRequestNotFoundError,
    );
  });

  it("auto-expires a pending request past expiresAt", async () => {
    const wa = createMockWa();
    const client = new AttestationClient({
      signingSecret: SIGNING_SECRET,
      adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
      ttlMinutes: 0.001, // ~60ms
    });
    const request = await client.requestVerification({
      method: "whatsapp_otp",
      subject: { type: "phone", value: "5491112345678" },
    });
    await new Promise((r) => setTimeout(r, 100));
    const status = await client.getRequestStatus(request.requestId);
    expect(status.status).toBe("expired");
    const code = wa.sends[0]!.text.match(/(\d{6})/)![1]!;
    await expect(client.submitOtp(request.requestId, code)).rejects.toBeInstanceOf(
      VerificationExpiredError,
    );
  });
});
