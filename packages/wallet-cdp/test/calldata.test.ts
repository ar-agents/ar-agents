import { describe, expect, it } from "vitest";
import {
  ERC20_TRANSFER_SELECTOR,
  decodeErc20TransferCalldata,
  encodeErc20TransferCalldata,
} from "../src/calldata";

// A real (checksummed, per EIP-55) recipient address, deterministic for the
// test fixture. Any valid address works here -- the point of the test below
// is the SLOT LAYOUT (selector / recipient / amount), not this specific value.
const RECIPIENT = "0xa744AA7F8A4F07De2da1643D5be2371EA9b3fe15";

/**
 * Build the expected calldata via plain string padding -- deliberately NOT
 * using the package's own ABI-encoding path, so this is an independent check
 * of the exact byte layout, not a tautology against `encodeErc20TransferCalldata`.
 */
function expectedCalldata(to: string, amountAtomic: bigint): string {
  const selector = ERC20_TRANSFER_SELECTOR.slice(2); // "a9059cbb"
  const recipientSlot = to.slice(2).toLowerCase().padStart(64, "0");
  const amountSlot = amountAtomic.toString(16).padStart(64, "0");
  return `0x${selector}${recipientSlot}${amountSlot}`;
}

describe("encodeErc20TransferCalldata", () => {
  it("encodes selector + recipient slot + amount slot exactly (independently derived)", () => {
    const amountAtomic = 1_000_000n; // 1.0 USDC (6 decimals)
    const data = encodeErc20TransferCalldata(RECIPIENT, amountAtomic);
    const expected = expectedCalldata(RECIPIENT, amountAtomic);

    expect(data.toLowerCase()).toBe(expected.toLowerCase());
    expect(data.length).toBe(138); // "0x" + 8 (selector) + 64 (recipient) + 64 (amount)

    // The selector: the first 4 bytes.
    expect(data.slice(0, 10).toLowerCase()).toBe(ERC20_TRANSFER_SELECTOR);
    // The recipient slot: the NEXT 32 bytes, right-aligned (12 zero bytes +
    // the 20-byte address).
    expect(data.slice(10, 74).toLowerCase()).toBe(
      "000000000000000000000000" + RECIPIENT.slice(2).toLowerCase(),
    );
    // The amount slot: the LAST 32 bytes, right-aligned uint256 (1_000_000 == 0xf4240).
    expect(data.slice(74, 138).toLowerCase()).toBe(amountAtomic.toString(16).padStart(64, "0"));
  });

  it("round-trips through decodeErc20TransferCalldata", () => {
    const amountAtomic = 42_500_000n;
    const data = encodeErc20TransferCalldata(RECIPIENT, amountAtomic);
    const decoded = decodeErc20TransferCalldata(data);
    expect(decoded.to.toLowerCase()).toBe(RECIPIENT.toLowerCase());
    expect(decoded.amountAtomic).toBe(amountAtomic);
  });

  it("rejects an invalid recipient address", () => {
    expect(() => encodeErc20TransferCalldata("not-an-address", 1n)).toThrow(/valid EVM address/);
  });

  it("rejects a recipient with a bad EIP-55 checksum (catches address typos)", () => {
    // Same address as RECIPIENT but with one letter's case flipped.
    const typo = RECIPIENT.replace("a744", "A744");
    expect(() => encodeErc20TransferCalldata(typo, 1n)).toThrow(/valid EVM address/);
  });

  it("rejects a negative amount", () => {
    expect(() => encodeErc20TransferCalldata(RECIPIENT, -1n)).toThrow(/must be >= 0/);
  });

  it("rejects an amount above uint256 max", () => {
    const tooBig = 2n ** 256n;
    expect(() => encodeErc20TransferCalldata(RECIPIENT, tooBig)).toThrow(/exceeds uint256 max/);
  });

  it("decodeErc20TransferCalldata rejects a non-transfer selector", () => {
    // approve(address,uint256) selector 0x095ea7b3, arbitrary payload after it
    const approveCalldata = ("0x095ea7b3" + "0".repeat(128)) as `0x${string}`;
    expect(() => decodeErc20TransferCalldata(approveCalldata)).toThrow();
  });
});
