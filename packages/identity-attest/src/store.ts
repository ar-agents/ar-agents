import type { Attestation, VerificationRequest } from "./types";

/**
 * Persistence interface for verification requests + issued attestations.
 * The lib uses this to:
 * 1. Track in-flight verification requests (to validate OTP codes, expire, etc.)
 * 2. Store issued attestations so the agent can re-fetch later
 *
 * Implement against your DB of choice (Postgres, Redis, etc.). Default
 * `InMemoryAttestationStore` is fine for dev / single-process; use a real
 * persistent store for production / serverless.
 */
export interface AttestationStore {
  /** Save a newly-created verification request. */
  saveRequest(request: VerificationRequest, internal: InternalRequestState): Promise<void>;

  /** Update an existing request's status / attempts. */
  updateRequest(requestId: string, patch: Partial<InternalRequestState> & Partial<VerificationRequest>): Promise<void>;

  /** Read a request + its internal state. Returns null if not found. */
  getRequest(requestId: string): Promise<{ request: VerificationRequest; internal: InternalRequestState } | null>;

  /**
   * Atomically decrement `attemptsRemaining` by 1 and return the new value
   * (which MAY be negative if called with no budget left). Returns null if the
   * request doesn't exist. MUST be atomic across concurrent callers — a
   * compare-and-swap or a conditional `UPDATE ... SET attemptsRemaining =
   * attemptsRemaining - 1 RETURNING attemptsRemaining`. This is the OTP
   * brute-force guard: the client claims an attempt via this BEFORE verifying,
   * so a concurrent burst of guesses can never exceed `maxAttempts`.
   *
   * Optional: when a store omits it, the client falls back to a (non-atomic)
   * read-modify-write — fine for single-process, but real distributed stores
   * SHOULD implement this.
   */
  decrementAttempts?(requestId: string): Promise<number | null>;

  /**
   * Atomically increment `attemptsRemaining` by 1 (refund). Only called when an
   * adapter raises an infrastructure error (not a wrong guess), so a transient
   * external-IdP failure doesn't burn a legitimate user's attempt. Optional;
   * falls back to read-modify-write when omitted.
   */
  incrementAttempts?(requestId: string): Promise<void>;

  /** Save the issued attestation when verification completes. */
  saveAttestation(attestation: Attestation): Promise<void>;

  /** Read an attestation by request ID (the lookup key). Returns null if not found. */
  getAttestation(requestId: string): Promise<Attestation | null>;

  /**
   * Optional: list attestations for a subject value (e.g., "all attestations
   * for phone +5491112345678"). Used by `findAttestation` tool.
   */
  listAttestationsForSubject?(
    subjectType: string,
    subjectValue: string,
  ): Promise<Attestation[]>;
}

/**
 * Per-request state the lib needs to track but doesn't expose to the agent.
 * - `secret`: the OTP code or magic-link token. NEVER returned to the agent.
 * - `attemptsRemaining`: OTP retry counter. Default 3.
 * - `claims`: claims captured during a callback (magic-link metadata).
 */
export interface InternalRequestState {
  secret: string;
  attemptsRemaining: number;
  claims?: Record<string, unknown> | null;
}

/**
 * In-memory store. Resets on process restart. Fine for tests and dev; use
 * a persistent store (Redis adapter, Postgres adapter) for production.
 */
export class InMemoryAttestationStore implements AttestationStore {
  private requests = new Map<string, { request: VerificationRequest; internal: InternalRequestState }>();
  private attestations = new Map<string, Attestation>();
  private subjectIndex = new Map<string, Set<string>>(); // "type:value" → requestIds

  async saveRequest(request: VerificationRequest, internal: InternalRequestState): Promise<void> {
    this.requests.set(request.requestId, { request, internal });
  }

  async updateRequest(
    requestId: string,
    patch: Partial<InternalRequestState> & Partial<VerificationRequest>,
  ): Promise<void> {
    const existing = this.requests.get(requestId);
    if (!existing) return;
    const { request, internal } = existing;
    const updatedRequest: VerificationRequest = {
      ...request,
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {}),
    };
    const updatedInternal: InternalRequestState = {
      ...internal,
      ...(patch.secret !== undefined ? { secret: patch.secret } : {}),
      ...(patch.attemptsRemaining !== undefined ? { attemptsRemaining: patch.attemptsRemaining } : {}),
      ...(patch.claims !== undefined ? { claims: patch.claims } : {}),
    };
    this.requests.set(requestId, { request: updatedRequest, internal: updatedInternal });
  }

  async getRequest(requestId: string) {
    return this.requests.get(requestId) ?? null;
  }

  // Atomic within a single Node process: the read + mutate run synchronously
  // (no intervening await), so concurrently-dispatched calls serialize — there
  // is no read-modify-write window for callers to race through.
  async decrementAttempts(requestId: string): Promise<number | null> {
    const existing = this.requests.get(requestId);
    if (!existing) return null;
    const next = existing.internal.attemptsRemaining - 1;
    existing.internal.attemptsRemaining = next;
    return next;
  }

  async incrementAttempts(requestId: string): Promise<void> {
    const existing = this.requests.get(requestId);
    if (!existing) return;
    existing.internal.attemptsRemaining += 1;
  }

  async saveAttestation(attestation: Attestation): Promise<void> {
    this.attestations.set(attestation.requestId, attestation);
    const key = `${attestation.subject.type}:${attestation.subject.value}`;
    const set = this.subjectIndex.get(key) ?? new Set<string>();
    set.add(attestation.requestId);
    this.subjectIndex.set(key, set);
  }

  async getAttestation(requestId: string): Promise<Attestation | null> {
    return this.attestations.get(requestId) ?? null;
  }

  async listAttestationsForSubject(subjectType: string, subjectValue: string): Promise<Attestation[]> {
    const key = `${subjectType}:${subjectValue}`;
    const ids = this.subjectIndex.get(key);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.attestations.get(id))
      .filter((a): a is Attestation => a !== undefined);
  }
}
