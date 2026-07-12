import { describe, expect, it, vi } from "vitest";
import { isArAgentsError } from "@ar-agents/core";
import {
  applySpendPolicy,
  createCdpClient,
  createSocietyWallet,
  transferUsdc,
  withTransferIdempotency,
  type CdpAccountLike,
  type CdpClientLike,
} from "../src/wallet";
import { WalletCdpPolicyDeniedError, WalletCdpUpstreamError } from "../src/errors";

// Deterministic, EIP-55-checksummed fixture address (see test/policy.test.ts).
const USDC = "0xa7E5ba253636E82Cb6d7E6B4EF3522a87CD2DCcC";

function mockAccount(overrides: Partial<CdpAccountLike> = {}): CdpAccountLike & { transfer: ReturnType<typeof vi.fn> } {
  return {
    address: "0x000000000000000000000000000000000000AA",
    transfer: vi.fn(),
    ...overrides,
  } as CdpAccountLike & { transfer: ReturnType<typeof vi.fn> };
}

function mockCdpClient(account: CdpAccountLike): CdpClientLike & {
  evm: { getOrCreateAccount: ReturnType<typeof vi.fn>; updateAccount: ReturnType<typeof vi.fn> };
  policies: { createPolicy: ReturnType<typeof vi.fn> };
} {
  return {
    evm: {
      getOrCreateAccount: vi.fn().mockResolvedValue(account),
      updateAccount: vi.fn().mockResolvedValue(undefined),
    },
    policies: {
      createPolicy: vi.fn().mockResolvedValue({ id: "policy-123" }),
    },
  };
}

describe("createCdpClient", () => {
  it("throws ArAgentsUnconfiguredError, naming only the missing env vars, when CDP creds are absent", async () => {
    await expect(createCdpClient({})).rejects.toMatchObject({
      code: "unconfigured",
      context: { missing: ["CDP_API_KEY_ID", "CDP_API_KEY_SECRET", "CDP_WALLET_SECRET"] },
    });
  });

  it("never includes a secret VALUE in the thrown error", async () => {
    try {
      await createCdpClient({ CDP_API_KEY_ID: "id-only" });
      throw new Error("expected createCdpClient to throw");
    } catch (err) {
      const asString = JSON.stringify(err instanceof Error ? { message: err.message, ...err } : err);
      expect(asString).not.toContain("id-only");
    }
  });
});

describe("createSocietyWallet", () => {
  it("derives a deterministic, sanitized account name from the society id", async () => {
    const account = mockAccount();
    const cdp = mockCdpClient(account);
    await createSocietyWallet(cdp, "AR Agents Operaciones SAS!");
    expect(cdp.evm.getOrCreateAccount).toHaveBeenCalledWith({ name: "society-ar-agents-operaciones-sas" });
  });

  it("rejects a society id with no alphanumeric content", async () => {
    const cdp = mockCdpClient(mockAccount());
    await expect(createSocietyWallet(cdp, "___")).rejects.toThrow(/alphanumeric/);
  });
});

describe("applySpendPolicy", () => {
  it("creates the policy with the built rules and attaches it to the account", async () => {
    const account = mockAccount();
    const cdp = mockCdpClient(account);
    const result = await applySpendPolicy(cdp, account, {
      usdcContractAddress: USDC,
      maxPerTxAtomic: "1000000",
      recipientAllowlist: ["0x1234567890123456789012345678901234567890"],
    });

    expect(cdp.policies.createPolicy).toHaveBeenCalledTimes(1);
    const call = cdp.policies.createPolicy.mock.calls[0]![0];
    expect(call.policy.scope).toBe("account");
    expect(call.policy.description).toMatch(/^[A-Za-z0-9 ,.]{1,50}$/);
    expect(call.policy.rules).toEqual(result.rules);

    expect(cdp.evm.updateAccount).toHaveBeenCalledWith({
      address: account.address,
      update: { accountPolicy: "policy-123" },
    });
    expect(result.policyId).toBe("policy-123");
  });
});

describe("transferUsdc", () => {
  it("requires an idempotencyKey", async () => {
    const account = mockAccount();
    await expect(
      transferUsdc(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "" }),
    ).rejects.toThrow(/idempotencyKey/);
    expect(account.transfer).not.toHaveBeenCalled();
  });

  it("returns a receipt on success, defaulting to base-sepolia", async () => {
    const account = mockAccount();
    account.transfer.mockResolvedValue({ transactionHash: "0xdeadbeef" });
    const receipt = await transferUsdc(account, {
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: "1000000",
      idempotencyKey: "op-1",
    });
    expect(account.transfer).toHaveBeenCalledWith({
      to: "0x1234567890123456789012345678901234567890",
      amount: "1000000",
      token: "usdc",
      network: "base-sepolia",
    });
    expect(receipt).toEqual({
      to: "0x1234567890123456789012345678901234567890",
      amountAtomic: "1000000",
      idempotencyKey: "op-1",
      transactionHash: "0xdeadbeef",
    });
  });

  it("classifies a policy-engine rejection as WalletCdpPolicyDeniedError (not retryable)", async () => {
    const account = mockAccount();
    account.transfer.mockRejectedValue(
      new Error("The request is forbidden due to violating at least one configured policy."),
    );
    await expect(
      transferUsdc(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "op-2" }),
    ).rejects.toBeInstanceOf(WalletCdpPolicyDeniedError);
    try {
      await transferUsdc(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "op-2b" });
    } catch (err) {
      expect(isArAgentsError(err)).toBe(true);
      expect((err as WalletCdpPolicyDeniedError).code).toBe("policy_denied");
      expect((err as WalletCdpPolicyDeniedError).retryable).toBe(false);
    }
  });

  it("classifies any other failure as WalletCdpUpstreamError (retryable)", async () => {
    const account = mockAccount();
    account.transfer.mockRejectedValue(new Error("ECONNRESET"));
    await expect(
      transferUsdc(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "op-3" }),
    ).rejects.toBeInstanceOf(WalletCdpUpstreamError);
    try {
      await transferUsdc(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "op-3b" });
    } catch (err) {
      expect((err as WalletCdpUpstreamError).code).toBe("upstream_error");
      expect((err as WalletCdpUpstreamError).retryable).toBe(true);
    }
  });
});

describe("withTransferIdempotency", () => {
  it("returns the cached receipt on a retried call with the same key, without re-transferring", async () => {
    const account = mockAccount();
    account.transfer.mockResolvedValue({ transactionHash: "0x1" });
    const guarded = withTransferIdempotency(transferUsdc);

    const first = await guarded(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "dup" });
    const second = await guarded(account, { to: "0xabc", amountAtomic: "999", idempotencyKey: "dup" });

    expect(second).toEqual(first);
    expect(account.transfer).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight transfer across concurrent calls with the same key", async () => {
    const account = mockAccount();
    let resolveTransfer!: (v: unknown) => void;
    account.transfer.mockReturnValue(new Promise((resolve) => (resolveTransfer = resolve)));
    const guarded = withTransferIdempotency(transferUsdc);

    const p1 = guarded(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "concurrent" });
    const p2 = guarded(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "concurrent" });
    resolveTransfer({ transactionHash: "0x2" });

    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1).toEqual(r2);
    expect(account.transfer).toHaveBeenCalledTimes(1);
  });

  it("does NOT cache a failed transfer -- a retry after a failure calls the provider again", async () => {
    const account = mockAccount();
    account.transfer.mockRejectedValueOnce(new Error("ECONNRESET")).mockResolvedValueOnce({ transactionHash: "0x3" });
    const guarded = withTransferIdempotency(transferUsdc);

    await expect(guarded(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "retry-after-fail" })).rejects.toThrow();
    const receipt = await guarded(account, { to: "0xabc", amountAtomic: "1", idempotencyKey: "retry-after-fail" });
    expect(receipt.transactionHash).toBe("0x3");
    expect(account.transfer).toHaveBeenCalledTimes(2);
  });
});
