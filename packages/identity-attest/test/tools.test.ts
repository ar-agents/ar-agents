import { describe, expect, it } from "vitest";
import {
  AttestationClient,
  identityAttestTools,
  type AttestAdapter,
  type IdentityAttestReadContext,
  type TrustLevel,
} from "../src";

const SIGNING_SECRET = "test-secret-min-16-chars-long-please";

class FixedOtpAdapter implements AttestAdapter {
  readonly id = "otp";
  readonly trustLevel = 0.3 as TrustLevel;
  generateSecret(): string {
    return "123456";
  }
  async deliverChallenge(): Promise<void> {}
  async verify(p: {
    submitted: { code?: string };
  }): Promise<{ verified: true } | { verified: false; reason: string }> {
    return p.submitted.code === "123456"
      ? { verified: true }
      : { verified: false, reason: "wrong" };
  }
}

async function setupVerified(externalReference?: string) {
  const client = new AttestationClient({
    signingSecret: SIGNING_SECRET,
    adapters: { otp: new FixedOtpAdapter() },
  });
  const req = await client.requestVerification({
    method: "otp",
    subject: { type: "phone", value: "+5491100000000" },
    ...(externalReference ? { externalReference } : {}),
  });
  await client.submitOtp(req.requestId, "123456");
  return { client, requestId: req.requestId };
}

const ctx = { toolCallId: "t", messages: [] } as never;

describe("identityAttestTools — read authorization (DeepSec MEDIUM)", () => {
  it("returns full attestation when no authorizeRead is configured (back-compat)", async () => {
    const { client, requestId } = await setupVerified();
    const tools = identityAttestTools(client);
    const r = (await tools.get_attestation!.execute!({ request_id: requestId }, ctx)) as {
      found: boolean;
      subject?: unknown;
      signature?: string;
    };
    expect(r.found).toBe(true);
    expect(r.subject).toBeDefined();
    expect(r.signature).toBeTruthy();
  });

  it("get_attestation denies when authorizeRead returns false (no data leaked)", async () => {
    const { client, requestId } = await setupVerified();
    const tools = identityAttestTools(client, { authorizeRead: () => false });
    const r = (await tools.get_attestation!.execute!({ request_id: requestId }, ctx)) as {
      error?: string;
      subject?: unknown;
      signature?: string;
      claims?: unknown;
    };
    expect(r.error).toBe("not_authorized");
    expect(r.subject).toBeUndefined();
    expect(r.signature).toBeUndefined();
    expect(r.claims).toBeUndefined();
  });

  it("check_verification_status denies when authorizeRead returns false", async () => {
    const { client, requestId } = await setupVerified();
    const tools = identityAttestTools(client, { authorizeRead: () => false });
    const r = (await tools.check_verification_status!.execute!(
      { request_id: requestId },
      ctx,
    )) as { error?: string; subject?: unknown; attestation?: unknown };
    expect(r.error).toBe("not_authorized");
    expect(r.subject).toBeUndefined();
    expect(r.attestation).toBeUndefined();
  });

  it("authorizeRead receives the record's binding info (externalReference + subject)", async () => {
    const { client, requestId } = await setupVerified("order-42");
    const seen: IdentityAttestReadContext[] = [];
    const tools = identityAttestTools(client, {
      authorizeRead: (c) => {
        seen.push(c);
        return c.externalReference === "order-42";
      },
    });
    const r = (await tools.get_attestation!.execute!({ request_id: requestId }, ctx)) as {
      found?: boolean;
    };
    expect(r.found).toBe(true); // externalReference matched → allowed
    expect(seen[0]!.tool).toBe("get_attestation");
    expect(seen[0]!.requestId).toBe(requestId);
    expect(seen[0]!.externalReference).toBe("order-42");
    expect(seen[0]!.subject).toEqual({ type: "phone", value: "+5491100000000" });
  });

  it("supports async authorizeRead", async () => {
    const { client, requestId } = await setupVerified();
    const tools = identityAttestTools(client, {
      authorizeRead: async () => false,
    });
    const r = (await tools.get_attestation!.execute!({ request_id: requestId }, ctx)) as {
      error?: string;
    };
    expect(r.error).toBe("not_authorized");
  });

  it("get_attestation returns { found: false } for unknown ids without invoking authorizeRead", async () => {
    const { client } = await setupVerified();
    let called = false;
    const tools = identityAttestTools(client, {
      authorizeRead: () => {
        called = true;
        return true;
      },
    });
    const r = (await tools.get_attestation!.execute!({ request_id: "nope" }, ctx)) as {
      found: boolean;
    };
    expect(r.found).toBe(false);
    expect(called).toBe(false);
  });
});
