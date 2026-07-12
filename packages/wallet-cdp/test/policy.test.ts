import { describe, expect, it } from "vitest";
import { buildErc20SpendPolicyRules, sanitizePolicyDescription } from "../src/policy";

// Deterministic, EIP-55-checksummed fixture addresses (not a real deployed
// contract -- what matters for these tests is the RULE SHAPE, not the value).
const USDC_BASE_SEPOLIA = "0xa7E5ba253636E82Cb6d7E6B4EF3522a87CD2DCcC";
const RECIPIENT_A = "0xa744AA7F8A4F07De2da1643D5be2371EA9b3fe15";
const RECIPIENT_B = "0xD7281fd9a8f23bb1d12f7aF887770449Dbd3D010";

describe("buildErc20SpendPolicyRules", () => {
  it("builds the exact accept rule: evmAddress(contract) + evmData(erc20 transfer to/value)", () => {
    const rules = buildErc20SpendPolicyRules({
      usdcContractAddress: USDC_BASE_SEPOLIA,
      maxPerTxAtomic: "5000000",
      recipientAllowlist: [RECIPIENT_A, RECIPIENT_B],
    });

    expect(rules).toEqual([
      {
        action: "accept",
        operation: "sendEvmTransaction",
        criteria: [
          { type: "evmAddress", addresses: [USDC_BASE_SEPOLIA], operator: "in" },
          {
            type: "evmData",
            abi: "erc20",
            conditions: [
              {
                function: "transfer",
                params: [
                  { name: "to", operator: "in", values: [RECIPIENT_A, RECIPIENT_B] },
                  { name: "value", operator: "<=", value: "5000000" },
                ],
              },
            ],
          },
        ],
      },
      {
        action: "reject",
        operation: "sendEvmTransaction",
        criteria: [{ type: "ethValue", ethValue: "0", operator: ">" }],
      },
    ]);
  });

  it("omits the recipient `to` condition (amount-only) when no allowlist is given", () => {
    const rules = buildErc20SpendPolicyRules({
      usdcContractAddress: USDC_BASE_SEPOLIA,
      maxPerTxAtomic: "1000000",
    });
    const acceptRule = rules[0]!;
    const evmData = acceptRule.criteria.find((c) => c.type === "evmData");
    expect(evmData).toBeDefined();
    if (evmData?.type === "evmData") {
      expect(evmData.conditions[0]?.params).toEqual([{ name: "value", operator: "<=", value: "1000000" }]);
    }
  });

  it("omits the native-ETH reject rule when denyNativeEth is false", () => {
    const rules = buildErc20SpendPolicyRules({
      usdcContractAddress: USDC_BASE_SEPOLIA,
      maxPerTxAtomic: "1000000",
      denyNativeEth: false,
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]!.action).toBe("accept");
  });

  it("rejects a malformed contract address", () => {
    expect(() =>
      buildErc20SpendPolicyRules({ usdcContractAddress: "not-an-address", maxPerTxAtomic: "1000000" }),
    ).toThrow(/valid EVM address/);
  });

  it("rejects a non-integer maxPerTxAtomic", () => {
    expect(() =>
      buildErc20SpendPolicyRules({ usdcContractAddress: USDC_BASE_SEPOLIA, maxPerTxAtomic: "1.5" }),
    ).toThrow(/non-negative integer/);
  });

  it("rejects a malformed recipient in the allowlist", () => {
    expect(() =>
      buildErc20SpendPolicyRules({
        usdcContractAddress: USDC_BASE_SEPOLIA,
        maxPerTxAtomic: "1000000",
        recipientAllowlist: ["bad-address"],
      }),
    ).toThrow(/valid EVM address/);
  });
});

describe("sanitizePolicyDescription", () => {
  it("passes through a description already within the legal charset", () => {
    expect(sanitizePolicyDescription("society abc123 cap 1.5")).toBe("society abc123 cap 1.5");
  });

  it("strips characters outside ^[A-Za-z0-9 ,.]{1,50}$", () => {
    expect(sanitizePolicyDescription("society_abc-123: spend@cap!")).toBe("societyabc123 spendcap");
  });

  it("truncates to 50 characters", () => {
    const long = "a".repeat(80);
    const result = sanitizePolicyDescription(long);
    expect(result.length).toBe(50);
  });

  it("falls back to a default when everything is stripped", () => {
    const result = sanitizePolicyDescription("@@@___");
    expect(result).toBe("ar agents wallet spend policy");
    // the fallback itself must satisfy the same charset CDP requires
    expect(result).toMatch(/^[A-Za-z0-9 ,.]{1,50}$/);
  });
});
