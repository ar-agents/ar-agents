import { describe, expect, it } from "vitest";

/**
 * lib/auditor-sub: the shared shapes + key derivation for the El Auditor
 * subscribe/activate loop. These constants are a storage contract (KV keys and
 * capability-token kinds already written in production), so a drift here would
 * orphan live pending rows and session tokens. Pin them.
 */

import {
  pendingKey,
  PENDING_KEY_PREFIX,
  PENDING_TTL_SECONDS,
  AUDITOR_SESSION_KIND,
  AUDITOR_SESSION_PREFIX,
  type PendingSubscription,
} from "../src/lib/auditor-sub";

describe("auditor-sub shared contract", () => {
  it("pendingKey namespaces the preapproval id under the auditor:pending: prefix", () => {
    expect(pendingKey("pre_abc123")).toBe("auditor:pending:pre_abc123");
    expect(pendingKey("pre_abc123").startsWith(PENDING_KEY_PREFIX)).toBe(true);
  });

  it("pendingKey is a pure prefix (no normalization that could split reader/writer)", () => {
    // The webhook writes and activate reads with the RAW MP id; any trimming or
    // casing here would silently orphan pending rows.
    expect(pendingKey(" Pre_X ")).toBe("auditor:pending: Pre_X ");
    expect(pendingKey("")).toBe("auditor:pending:");
  });

  it("pending rows expire after 3 days (MP authorization happens in minutes)", () => {
    expect(PENDING_TTL_SECONDS).toBe(3 * 24 * 60 * 60);
  });

  it("session capability kind/prefix are stable (already minted tokens depend on them)", () => {
    expect(AUDITOR_SESSION_KIND).toBe("auditor-session");
    expect(AUDITOR_SESSION_PREFIX).toBe("ast");
  });

  it("PendingSubscription carries the server-authoritative session binding", () => {
    // Compile-time shape check: the sessionId is part of the record so activate
    // never has to trust MP's external_reference. Fictional PII only.
    const row: PendingSubscription = {
      sessionId: "sess-fixture",
      payerEmail: "juan.perez@example.com",
      plan: "mensual",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(row.sessionId).toBe("sess-fixture");
  });
});
