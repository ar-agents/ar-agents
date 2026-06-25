import { hmacSha256Hex, randomUuid, timingSafeEqualHex } from "./crypto";
import type { AttestAdapter } from "./adapters/base";
import {
  IdentityAttestConfigError,
  InvalidAttestationSignatureError,
  InvalidOtpCodeError,
  SubjectMismatchError,
  TooManyAttemptsError,
  VerificationExpiredError,
  VerificationRequestNotFoundError,
} from "./errors";
import { InMemoryAttestationStore, type AttestationStore } from "./store";
import type {
  Attestation,
  VerificationRequest,
  VerificationStatus,
  VerificationSubject,
} from "./types";

/**
 * In-process per-request lock. Serializes `completeVerification` for the same
 * requestId so a store WITHOUT an atomic `decrementAttempts` can't be raced by
 * concurrent submissions within this process. Cross-process safety requires an
 * atomic `store.decrementAttempts`.
 */
const requestLocks = new Map<string, Promise<unknown>>();
function withRequestLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = requestLocks.get(key) ?? Promise.resolve();
  const run = prev.then(fn, fn); // run fn after prev settles (success OR failure)
  const tail = run.then(
    () => {},
    () => {},
  );
  requestLocks.set(key, tail);
  void tail.finally(() => {
    if (requestLocks.get(key) === tail) requestLocks.delete(key);
  });
  return run;
}

/** Type-aware equality for verification subjects (used for subject binding). */
function subjectsMatch(a: VerificationSubject, b: VerificationSubject): boolean {
  if (a.type !== b.type) return false;
  return (
    normalizeSubjectValue(a.type, a.value) ===
    normalizeSubjectValue(b.type, b.value)
  );
}

function normalizeSubjectValue(type: string, value: string): string {
  const v = (value ?? "").trim();
  if (type === "email") return v.toLowerCase();
  if (type === "phone") {
    // Preserve a single leading "+", drop every other non-digit.
    const plus = v.startsWith("+") ? "+" : "";
    return plus + v.replace(/\D/g, "");
  }
  // oauth / dni / cuit / custom: exact match after trim.
  return v;
}

const DEFAULT_TTL_MINUTES = 15;
const DEFAULT_ATTESTATION_VALIDITY_DAYS = 30;
const DEFAULT_MAX_ATTEMPTS = 3;

export interface AttestationClientOptions {
  /**
   * HMAC signing secret. The lib uses it to sign every issued attestation
   * so a recipient can verify the attestation wasn't tampered with after
   * issuance. Generate with `openssl rand -hex 32` and store in env var.
   */
  signingSecret: string;
  /** Map of adapter-id → adapter instance. */
  adapters: Record<string, AttestAdapter>;
  /** Persistence. Default `InMemoryAttestationStore`. */
  store?: AttestationStore;
  /** Verification request TTL in minutes. Default 15. */
  ttlMinutes?: number;
  /** Issued attestation validity in days. Default 30. */
  attestationValidityDays?: number;
  /** Max OTP attempts before request is `failed`. Default 3. */
  maxAttempts?: number;
}

/**
 * The orchestrator. Wraps a set of `AttestAdapter`s + an `AttestationStore`
 * and exposes the high-level API the tools layer (and direct callers) use.
 *
 * # Lifecycle of a verification
 *
 * 1. `requestVerification(method, subject)` → creates a `VerificationRequest`,
 *    asks the adapter to deliver the challenge to the user, stores the
 *    request, returns it (with the verification URL if the adapter is
 *    magic-link-shaped, or just the requestId for OTP flows).
 * 2. User receives the challenge (WhatsApp message / email).
 * 3. For OTP: user replies with the code → agent calls `submitOtp(requestId,
 *    code)`. For magic-link: user clicks the link → callback handler calls
 *    `submitMagicLinkToken(requestId, token)`.
 * 4. Lib verifies via the adapter, signs an `Attestation`, persists it,
 *    returns it.
 * 5. Agent surfaces "verified ✓" to the user. The attestation can be queried
 *    later via `getAttestation(requestId)` or
 *    `findLatestAttestationForSubject(...)`.
 */
export class AttestationClient {
  private readonly signingSecret: string;
  private readonly adapters: Map<string, AttestAdapter>;
  private readonly store: AttestationStore;
  private readonly ttlMs: number;
  private readonly attestationValidityMs: number;
  private readonly maxAttempts: number;

  constructor(options: AttestationClientOptions) {
    if (!options.signingSecret || options.signingSecret.length < 16) {
      throw new IdentityAttestConfigError(
        "signingSecret must be at least 16 chars. Generate with: openssl rand -hex 32",
      );
    }
    if (!options.adapters || Object.keys(options.adapters).length === 0) {
      throw new IdentityAttestConfigError(
        "At least one adapter must be registered (e.g., WhatsAppOtpAdapter or EmailMagicLinkAdapter).",
      );
    }
    this.signingSecret = options.signingSecret;
    this.adapters = new Map(Object.entries(options.adapters));
    this.store = options.store ?? new InMemoryAttestationStore();
    this.ttlMs = (options.ttlMinutes ?? DEFAULT_TTL_MINUTES) * 60_000;
    this.attestationValidityMs =
      (options.attestationValidityDays ?? DEFAULT_ATTESTATION_VALIDITY_DAYS) * 86_400_000;
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  }

  /** List the registered adapter IDs (e.g., ["whatsapp_otp", "email_magic_link"]). */
  listAdapters(): Array<{ id: string; trustLevel: number }> {
    return Array.from(this.adapters.values()).map((a) => ({ id: a.id, trustLevel: a.trustLevel }));
  }

  /**
   * Kick off a verification flow. The adapter delivers the challenge to the
   * user; the agent surfaces the returned request to the user (e.g., "I sent
   * a code to your WhatsApp — please reply with it" for OTP, or "click the
   * link I emailed you" for magic-link).
   */
  async requestVerification(params: {
    method: string;
    subject: VerificationSubject;
    externalReference?: string;
    metadata?: Record<string, unknown>;
  }): Promise<VerificationRequest> {
    const adapter = this.adapters.get(params.method);
    if (!adapter) {
      throw new IdentityAttestConfigError(
        `No adapter registered for method "${params.method}". Available: ${Array.from(this.adapters.keys()).join(", ")}`,
      );
    }
    const requestId = randomUuid();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);
    const secret = adapter.generateSecret();
    const verificationUrl =
      adapter.buildVerificationUrl?.({
        requestId,
        secret,
        callbackBaseUrl: "", // adapter has its own internal callbackBaseUrl
      }) ?? null;

    const request: VerificationRequest = {
      requestId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      method: params.method,
      subject: params.subject,
      trustLevel: adapter.trustLevel,
      status: "pending",
      challenge: null, // never expose the secret to callers
      verificationUrl,
      externalReference: params.externalReference ?? null,
      metadata: params.metadata ?? null,
    };

    await this.store.saveRequest(request, {
      secret,
      attemptsRemaining: this.maxAttempts,
    });

    // Deliver the challenge to the user via the adapter's channel.
    await adapter.deliverChallenge({
      requestId,
      subject: params.subject,
      secret,
      ...(verificationUrl ? { verificationUrl } : {}),
      metadata: params.metadata ?? null,
    });

    return request;
  }

  /** Submit an OTP code (WhatsApp/SMS/Email OTP flows). */
  async submitOtp(requestId: string, code: string): Promise<Attestation> {
    return this.completeVerification(requestId, { code });
  }

  /**
   * Submit a magic-link token (called by the callback handler when the user
   * clicks the link).
   */
  async submitMagicLinkToken(requestId: string, token: string): Promise<Attestation> {
    return this.completeVerification(requestId, { token });
  }

  /**
   * Submit an OAuth authorization code (Auth0 flow callback) — `state`
   * param maps to `requestId`, `code` is the authorization code Auth0
   * returned. The adapter exchanges it for tokens server-side.
   */
  async submitOauthCode(requestId: string, oauthCode: string): Promise<Attestation> {
    return this.completeVerification(requestId, { oauthCode });
  }

  /**
   * Submit a Magic.link DIDToken from the client (sent by frontend after the
   * user completes Magic's hosted login).
   */
  async submitMagicDidToken(requestId: string, didToken: string): Promise<Attestation> {
    return this.completeVerification(requestId, { token: didToken });
  }

  /**
   * Submit a MercadoPago payment_id (the webhook's `data.id` after the
   * micro-charge completes). Used by `MercadoPagoIdentityAdapter`.
   */
  async submitMercadoPagoPaymentId(requestId: string, paymentId: string): Promise<Attestation> {
    return this.completeVerification(requestId, { oauthCode: paymentId });
  }

  /** Read the current state of a verification request. */
  async getRequestStatus(requestId: string): Promise<VerificationRequest> {
    const found = await this.store.getRequest(requestId);
    if (!found) throw new VerificationRequestNotFoundError(requestId);
    // Auto-expire if past expiresAt
    if (
      found.request.status === "pending" &&
      Date.parse(found.request.expiresAt) < Date.now()
    ) {
      await this.store.updateRequest(requestId, { status: "expired" });
      return { ...found.request, status: "expired" };
    }
    return found.request;
  }

  /** Fetch an issued attestation. Returns null if verification didn't complete. */
  async getAttestation(requestId: string): Promise<Attestation | null> {
    return this.store.getAttestation(requestId);
  }

  /**
   * Find the most recent valid attestation for a given subject. Useful for
   * "is this email already verified at trust >= 0.5?" checks before kicking
   * off a new verification.
   */
  async findLatestAttestationForSubject(
    subjectType: string,
    subjectValue: string,
    minTrust = 0,
  ): Promise<Attestation | null> {
    if (!this.store.listAttestationsForSubject) return null;
    const all = await this.store.listAttestationsForSubject(subjectType, subjectValue);
    const valid = all.filter(
      (a) => Date.parse(a.expiresAt) > Date.now() && a.trustLevel >= minTrust,
    );
    valid.sort((a, b) => Date.parse(b.verifiedAt) - Date.parse(a.verifiedAt));
    return valid[0] ?? null;
  }

  /**
   * Verify an attestation's HMAC signature. Throws on mismatch.
   *
   * Async because Web Crypto's HMAC computation is Promise-based. Callers
   * inside agent tool execute() handlers are already async, so this is a
   * zero-cost upgrade.
   */
  async verifyAttestationSignature(attestation: Attestation): Promise<void> {
    const expected = await this.signAttestation(attestation);
    if (!timingSafeEqualHex(expected, attestation.signature)) {
      throw new InvalidAttestationSignatureError();
    }
  }

  // ─── internal ────────────────────────────────────────────────────────────

  private async completeVerification(
    requestId: string,
    submitted: { code?: string; token?: string; oauthCode?: string },
  ): Promise<Attestation> {
    const found = await this.store.getRequest(requestId);
    if (!found) throw new VerificationRequestNotFoundError(requestId);
    const { request, internal } = found;

    // Expiry check
    if (Date.parse(request.expiresAt) < Date.now()) {
      await this.store.updateRequest(requestId, { status: "expired" });
      throw new VerificationExpiredError(requestId);
    }
    if (request.status !== "pending") {
      // Already complete or failed — re-throw the appropriate error
      if (request.status === "expired") throw new VerificationExpiredError(requestId);
      if (request.status === "failed") throw new TooManyAttemptsError(requestId);
      // Already verified — return the existing attestation
      const existing = await this.store.getAttestation(requestId);
      if (existing) return existing;
    }

    const adapter = this.adapters.get(request.method);
    if (!adapter) {
      throw new IdentityAttestConfigError(
        `Adapter "${request.method}" no longer registered (was when request created).`,
      );
    }

    // Run the attempt. Stores with an atomic `decrementAttempts` bound attempts
    // in the store itself. Stores WITHOUT it need an in-process lock so the
    // read-modify-write claim can't be raced within this process (a non-atomic
    // store still cannot bound attempts ACROSS processes — implement
    // `decrementAttempts` for a multi-process guarantee).
    const run = (): Promise<Attestation> =>
      this.runAttempt(requestId, request, internal, adapter, submitted);
    return this.store.decrementAttempts
      ? run()
      : withRequestLock(requestId, run);
  }

  private async runAttempt(
    requestId: string,
    request: VerificationRequest,
    internal: { secret: string },
    adapter: AttestAdapter,
    submitted: { code?: string; token?: string; oauthCode?: string },
  ): Promise<Attestation> {
    // CLAIM an attempt slot BEFORE verifying, so even a fully-concurrent burst
    // can never run more than `maxAttempts` verifications.
    const remaining = await this.consumeAttempt(requestId);
    if (remaining === null) throw new VerificationRequestNotFoundError(requestId);
    if (remaining < 0) {
      // No budget left (exhausted by prior/concurrent submissions).
      await this.store.updateRequest(requestId, {
        attemptsRemaining: 0,
        status: "failed" as VerificationStatus,
      });
      throw new TooManyAttemptsError(requestId);
    }

    // The claimed attempt is consumed UNCONDITIONALLY — a thrown adapter error
    // counts as a used attempt. This bounds the TOTAL number of adapter.verify()
    // calls (including ones that throw) to `maxAttempts`, closing both the OTP
    // brute-force vector AND the cost/DoS vector where an attacker induces
    // verify() to throw to drive unlimited external API calls. We deliberately
    // do NOT refund on throw: "verify threw" is attacker-influenceable, so a
    // refund there reopened the unbounded-attempts hole. (OTP/email adapters
    // verify locally and never throw on a wrong code; for network-backed
    // adapters, size `maxAttempts` with transient-error tolerance in mind.)
    const result = await adapter.verify({
      requestId,
      storedSecret: internal.secret,
      submitted,
      subject: request.subject,
    });

    if (!result.verified) {
      if (remaining <= 0) {
        await this.store.updateRequest(requestId, {
          attemptsRemaining: 0,
          status: "failed" as VerificationStatus,
        });
        throw new TooManyAttemptsError(requestId);
      }
      throw new InvalidOtpCodeError(remaining);
    }

    // Subject binding (defense in depth). If the channel authoritatively proved
    // WHICH subject it controlled (a provider token carries an identity), it
    // MUST equal the requested subject — otherwise a valid token for one
    // identity could mint an attestation for another (the MercadoPago/Magic.link
    // adapters returned the payer/token identity without comparing it). Fail
    // closed and mark failed: this is an attack, not a retry, so do NOT leave it
    // pending or refund. Adapters that bind via the delivery channel (OTP /
    // magic-link sent to subject.value) omit verifiedSubject and skip this.
    if (
      result.verifiedSubject &&
      !subjectsMatch(result.verifiedSubject, request.subject)
    ) {
      await this.store.updateRequest(requestId, {
        status: "failed" as VerificationStatus,
      });
      throw new SubjectMismatchError(requestId);
    }

    // Success — issue attestation
    const verifiedAt = new Date();
    const attExpiresAt = new Date(verifiedAt.getTime() + this.attestationValidityMs);
    const attestation: Attestation = {
      requestId,
      verifier: adapter.id,
      method: request.method,
      trustLevel: adapter.trustLevel,
      subject: request.subject,
      claims: result.claims ?? null,
      verifiedAt: verifiedAt.toISOString(),
      expiresAt: attExpiresAt.toISOString(),
      signature: "", // filled below
      externalReference: request.externalReference,
    };
    attestation.signature = await this.signAttestation(attestation);
    await this.store.saveAttestation(attestation);
    await this.store.updateRequest(requestId, {
      status: "verified" as VerificationStatus,
      claims: result.claims ?? null,
    });
    return attestation;
  }

  /**
   * Claim one verification attempt, returning the new `attemptsRemaining` (may
   * be negative if none were left). Prefers the store's ATOMIC
   * `decrementAttempts`; falls back to a read-modify-write for stores that omit
   * it — that fallback is only race-safe within a single process (the caller
   * wraps it in {@link withRequestLock}); a multi-process deployment MUST
   * implement `decrementAttempts`.
   */
  private async consumeAttempt(requestId: string): Promise<number | null> {
    if (this.store.decrementAttempts) {
      return this.store.decrementAttempts(requestId);
    }
    const found = await this.store.getRequest(requestId);
    if (!found) return null;
    const next = found.internal.attemptsRemaining - 1;
    await this.store.updateRequest(requestId, { attemptsRemaining: next });
    return next;
  }

  private async signAttestation(a: Attestation): Promise<string> {
    // Sign a canonical serialization of EVERY security-relevant field — including
    // `claims` and `externalReference`, which the previous delimiter payload
    // omitted, letting them be tampered without breaking the signature.
    // verifyAttestationSignature reuses this method, so sign + verify stay in sync.
    const payload = canonicalJson({
      requestId: a.requestId,
      verifier: a.verifier,
      method: a.method,
      trustLevel: a.trustLevel,
      subject: { type: a.subject.type, value: a.subject.value },
      claims: a.claims ?? null,
      verifiedAt: a.verifiedAt,
      expiresAt: a.expiresAt,
      externalReference: a.externalReference ?? null,
    });
    return await hmacSha256Hex(this.signingSecret, payload);
  }
}

// Deterministic JSON: object keys sorted recursively so the signed payload is
// stable regardless of key insertion order. (Not for general use — just a stable
// HMAC input for attestations.)
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`)
    .join(",")}}`;
}
