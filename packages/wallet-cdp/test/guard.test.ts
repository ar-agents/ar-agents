import { describe, expect, it, vi } from "vitest";
import { isArAgentsError } from "@ar-agents/core";
import { guardedTransferUsdc } from "../src/guard";
import { WalletCdpPolicyDeniedError } from "../src/errors";
import type { CdpAccountLike } from "../src/wallet";

const THRESHOLD = "10000000"; // 10 USDC
const BELOW = "1000000"; // 1 USDC
const ABOVE = "50000000"; // 50 USDC

function mockAccount(): CdpAccountLike & { transfer: ReturnType<typeof vi.fn> } {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
  } as CdpAccountLike & { transfer: ReturnType<typeof vi.fn> };
}

describe("guardedTransferUsdc -- layer 1 (approvals gate) blocks ALONE", () => {
  it("above threshold + approvals gate denies -> the provider is NEVER called", async () => {
    const account = mockAccount();
    const approve = vi.fn().mockResolvedValue(false); // denied / queued (governance.ts convention)

    const result = await guardedTransferUsdc({
      account,
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: ABOVE,
      idempotencyKey: "op-denied",
      thresholdAtomic: THRESHOLD,
      approve,
    });

    expect(result).toEqual({ status: "deferred", toolName: "wallet_transfer_usdc" });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith("wallet_transfer_usdc", {
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: ABOVE,
      idempotencyKey: "op-denied",
    });
    // The proof: the CDP provider's transfer was NEVER invoked.
    expect(account.transfer).not.toHaveBeenCalled();
  });

  it("above threshold + approvals gate approves -> the provider IS called", async () => {
    const account = mockAccount();
    account.transfer.mockResolvedValue({ transactionHash: "0xok" });
    const approve = vi.fn().mockResolvedValue(true);

    const result = await guardedTransferUsdc({
      account,
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: ABOVE,
      idempotencyKey: "op-approved",
      thresholdAtomic: THRESHOLD,
      approve,
    });

    expect(result.status).toBe("executed");
    expect(approve).toHaveBeenCalledTimes(1);
    expect(account.transfer).toHaveBeenCalledTimes(1);
  });

  it("below threshold -> approve() is never consulted at all, provider called directly", async () => {
    const account = mockAccount();
    account.transfer.mockResolvedValue({ transactionHash: "0xok" });
    const approve = vi.fn().mockResolvedValue(false); // would deny if ever asked

    const result = await guardedTransferUsdc({
      account,
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: BELOW,
      idempotencyKey: "op-small",
      thresholdAtomic: THRESHOLD,
      approve,
    });

    expect(result.status).toBe("executed");
    expect(approve).not.toHaveBeenCalled();
    expect(account.transfer).toHaveBeenCalledTimes(1);
  });
});

describe("guardedTransferUsdc -- layer 2 (CDP's own policy) blocks ALONE", () => {
  it("approvals gate approves but CDP's policy denies -> typed policy_denied surfaces, audit-visible", async () => {
    const account = mockAccount();
    account.transfer.mockRejectedValue(
      new Error("The request is forbidden due to violating at least one configured policy."),
    );
    const approve = vi.fn().mockResolvedValue(true); // layer 1 clears

    const call = guardedTransferUsdc({
      account,
      to: "0xBADBADBADBADBADBADBADBADBADBADBADBADBAD",
      amountAtomic: ABOVE,
      idempotencyKey: "op-policy-denied",
      thresholdAtomic: THRESHOLD,
      approve,
    });

    await expect(call).rejects.toBeInstanceOf(WalletCdpPolicyDeniedError);
    try {
      await guardedTransferUsdc({
        account,
        to: "0xBADBADBADBADBADBADBADBADBADBADBADBADBAD",
        amountAtomic: ABOVE,
        idempotencyKey: "op-policy-denied-2",
        thresholdAtomic: THRESHOLD,
        approve,
      });
      expect.unreachable("expected guardedTransferUsdc to throw");
    } catch (err) {
      // "audit-visible": apps/sociedad-ia-starter's withLocalAudit summarizes any
      // ArAgentsError by its typed `code` (isArAgentsError(err) ? err.code : "error").
      expect(isArAgentsError(err)).toBe(true);
      expect((err as WalletCdpPolicyDeniedError).code).toBe("policy_denied");
    }
    expect(approve).toHaveBeenCalledTimes(2); // layer 1 DID clear both times
  });

  it("CDP's policy denies even BELOW threshold, where layer 1 is never consulted -- proves layer 2 is independent", async () => {
    const account = mockAccount();
    account.transfer.mockRejectedValue(
      new Error("The request is forbidden due to violating at least one configured policy."),
    );
    const approve = vi.fn();

    await expect(
      guardedTransferUsdc({
        account,
        to: "0xBADBADBADBADBADBADBADBADBADBADBADBADBAD",
        amountAtomic: BELOW,
        idempotencyKey: "op-small-denied",
        thresholdAtomic: THRESHOLD,
        approve,
      }),
    ).rejects.toBeInstanceOf(WalletCdpPolicyDeniedError);
    expect(approve).not.toHaveBeenCalled();
  });
});

describe("guardedTransferUsdc -- idempotency", () => {
  it("a retried call with the same idempotencyKey does not re-invoke the provider", async () => {
    const account = mockAccount();
    account.transfer.mockResolvedValue({ transactionHash: "0xonce" });
    const approve = vi.fn().mockResolvedValue(true);
    const store = new Map();

    const first = await guardedTransferUsdc({
      account,
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: ABOVE,
      idempotencyKey: "same-key",
      thresholdAtomic: THRESHOLD,
      approve,
      store,
    });
    const second = await guardedTransferUsdc({
      account,
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: ABOVE,
      idempotencyKey: "same-key",
      thresholdAtomic: THRESHOLD,
      approve,
      store,
    });

    expect(second).toEqual(first);
    expect(account.transfer).toHaveBeenCalledTimes(1);
    // Both calls still went through approval (idempotency is at the transfer
    // layer, not a reason to skip re-approving a repeated tool invocation).
    expect(approve).toHaveBeenCalledTimes(2);
  });
});
