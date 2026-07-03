import { describe, expect, it, vi } from "vitest";
import {
  canonicalIdentityStatement,
  canonicalize,
  eip191MessageHash,
  encodeIsValidSignatureCall,
  identityDocHash,
  recoverEvmAddress,
  verifyErc1271,
  verifyEd25519Statement,
  verifyKeyBinding,
  type IdentityDoc,
} from "../src/key-binding";

/**
 * Golden vectors for the EVM + Ed25519 key-binding verifier.
 *
 * The signatures below were produced by INDEPENDENT oracles, not by this
 * package, so a bug in our recover/verify path cannot pass unnoticed:
 *   - EVM (EIP-191 personal_sign)  → ethers v6 `Wallet.signMessage`.
 *   - Ed25519                      → Node Web Crypto `subtle.sign("Ed25519")`.
 *   - ERC-1271 calldata            → ethers v6 `Interface.encodeFunctionData`.
 *
 * The EVM key is Hardhat account #1 (public knowledge, never funds). If the
 * recover math or the canonical statement bytes ever drift, these break.
 */

// ── EVM EOA vector ───────────────────────────────────────────────────────────
const EVM_ADDRESS = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const EVM_DOC_HASH =
  "88ea6c70e40b98803b44cabdc9850454cf93219f7f207f18e3d4a74a57665d45";
const EVM_STATEMENT =
  "ar-agents RFC-002 identity binding v1\n" +
  `address: ${EVM_ADDRESS}\n` +
  "chainId: 8453\n" +
  `agents.json sha256: ${EVM_DOC_HASH}\n` +
  "issuedAt: 2026-07-03T00:00:00Z";
const EVM_SIGNATURE =
  "0x073a465c391a218d230dde955612e323681acefd379e62634e7f282963a0bca63c207e35daa257b54a1a513476cd30a9bd8a63cbf5aaef6917a83c8b7f9519751c";
const EVM_EIP191_HASH =
  "5edd814910b7ae1ccd7c256cfc7e2abbd5dfdc9d3027b079ed448a6a0fab1701";

function evmDoc(): IdentityDoc {
  return {
    $schema: "https://ar-agents.ar/schemas/agents.v1.json",
    spec: "https://ar-agents.ar/rfcs/002",
    agent: {
      name: "Demo EVM Agent",
      operator: "Juan Perez",
      homepage: "https://demo.example",
      jurisdiction: "none-native",
    },
    identity: {
      scheme: "evm-secp256k1",
      chainId: 8453,
      address: EVM_ADDRESS,
      accountType: "eoa",
    },
    evidence: { onchain: `https://basescan.org/address/${EVM_ADDRESS}` },
    binding: {
      scheme: "eip-191",
      statement: EVM_STATEMENT,
      signature: EVM_SIGNATURE,
      docHash: EVM_DOC_HASH,
    },
    issuedAt: "2026-07-03T00:00:00Z",
  };
}

// ── Ed25519 vector ───────────────────────────────────────────────────────────
const ED_PUBKEY =
  "91b0b16ae489b6f9d31138d42aa4f9ed8602efe84a4d2d322bd3607e99b1a489";
const ED_DOC_HASH =
  "608ac11f9a49b315b40835c3ed971ccb00a289bb88f2ce7cc66bc628ab2099bf";
const ED_STATEMENT =
  "ar-agents RFC-002 identity binding v1\n" +
  `publicKey: ${ED_PUBKEY}\n` +
  "alg: ed25519\n" +
  `agents.json sha256: ${ED_DOC_HASH}\n` +
  "issuedAt: 2026-07-03T00:00:00Z";
const ED_SIGNATURE =
  "0adcc4d43867239bde8f21927f495ed5e85bf67e642c7c806472fc8f99f9e33ac1ab175339071a40f67b91e2415236690ff707d4080cf0bff2f6c4a9b409f406";

function edDoc(): IdentityDoc {
  return {
    $schema: "https://ar-agents.ar/schemas/agents.v1.json",
    spec: "https://ar-agents.ar/rfcs/002",
    agent: {
      name: "Demo Ed25519 Agent",
      operator: "Juan Perez",
      homepage: "https://ed.example",
      jurisdiction: "AR",
    },
    identity: { scheme: "ed25519", publicKey: ED_PUBKEY, keyId: "demo-ed-2026" },
    evidence: { auditLog: "https://ed.example/.well-known/sociedad-ia/keys" },
    binding: { scheme: "ed25519", signature: ED_SIGNATURE, docHash: ED_DOC_HASH },
    issuedAt: "2026-07-03T00:00:00Z",
  };
}

// ─────────────────────────────────────────────────────────────────────────────

describe("canonicalize", () => {
  it("sorts keys and ignores insertion order", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });

  it("is stable for nested structures + arrays (arrays keep order)", () => {
    expect(canonicalize({ x: [3, 1, 2], y: { c: 1, a: 2 } })).toBe(
      '{"x":[3,1,2],"y":{"a":2,"c":1}}',
    );
  });

  it("throws on pathological nesting (DoS guard)", () => {
    let deep: unknown = 1;
    for (let i = 0; i < 100; i++) deep = { n: deep };
    expect(() => canonicalize(deep)).toThrow(/nesting depth/);
  });
});

describe("identityDocHash — hashes the body with binding nulled", () => {
  it("matches the golden EVM doc hash regardless of the binding present", async () => {
    expect(await identityDocHash(evmDoc())).toBe(EVM_DOC_HASH);
  });

  it("matches the golden Ed25519 doc hash", async () => {
    expect(await identityDocHash(edDoc())).toBe(ED_DOC_HASH);
  });

  it("is independent of whether binding is null or a full object", async () => {
    const withNull = { ...evmDoc(), binding: null };
    expect(await identityDocHash(withNull)).toBe(EVM_DOC_HASH);
  });
});

describe("canonicalIdentityStatement — re-derives the signed bytes", () => {
  it("reproduces the golden EVM statement", () => {
    expect(
      canonicalIdentityStatement(
        evmDoc().identity,
        EVM_DOC_HASH,
        "2026-07-03T00:00:00Z",
      ),
    ).toBe(EVM_STATEMENT);
  });

  it("reproduces the golden Ed25519 statement", () => {
    expect(
      canonicalIdentityStatement(
        edDoc().identity,
        ED_DOC_HASH,
        "2026-07-03T00:00:00Z",
      ),
    ).toBe(ED_STATEMENT);
  });
});

describe("eip191MessageHash — against the ethers oracle", () => {
  it("computes the EIP-191 personal_sign digest of the statement", () => {
    const hex = Buffer.from(eip191MessageHash(EVM_STATEMENT)).toString("hex");
    expect(hex).toBe(EVM_EIP191_HASH);
  });
});

describe("recoverEvmAddress — ecrecover against the ethers signature", () => {
  it("recovers the exact signer address", () => {
    expect(recoverEvmAddress(EVM_STATEMENT, EVM_SIGNATURE)).toBe(
      EVM_ADDRESS.toLowerCase(),
    );
  });

  it("recovers a DIFFERENT address for a tampered statement", () => {
    const recovered = recoverEvmAddress(EVM_STATEMENT + " ", EVM_SIGNATURE);
    expect(recovered).not.toBe(EVM_ADDRESS.toLowerCase());
  });

  it("returns null for a malformed (too short) signature", () => {
    expect(recoverEvmAddress(EVM_STATEMENT, "0xdeadbeef")).toBeNull();
  });

  it("returns null for a non-hex signature", () => {
    expect(recoverEvmAddress(EVM_STATEMENT, "not-a-signature")).toBeNull();
  });

  it("accepts v as a raw recovery bit {0,1} as well as {27,28}", () => {
    const raw = EVM_SIGNATURE.slice(0, -2) + "01"; // v: 28 → 1
    expect(recoverEvmAddress(EVM_STATEMENT, raw)).toBe(
      EVM_ADDRESS.toLowerCase(),
    );
  });
});

describe("verifyEd25519Statement — against the Web Crypto signature", () => {
  it("verifies a valid signature", () => {
    expect(verifyEd25519Statement(ED_STATEMENT, ED_SIGNATURE, ED_PUBKEY)).toBe(
      true,
    );
  });

  it("rejects a tampered statement", () => {
    expect(
      verifyEd25519Statement(ED_STATEMENT + "x", ED_SIGNATURE, ED_PUBKEY),
    ).toBe(false);
  });

  it("rejects the wrong public key", () => {
    const wrong = "00".repeat(32);
    expect(verifyEd25519Statement(ED_STATEMENT, ED_SIGNATURE, wrong)).toBe(
      false,
    );
  });

  it("returns false (not throw) on a malformed key", () => {
    expect(verifyEd25519Statement(ED_STATEMENT, ED_SIGNATURE, "zzzz")).toBe(
      false,
    );
  });
});

describe("verifyKeyBinding — EVM EOA happy path", () => {
  it("verifies the golden EVM doc end to end", async () => {
    const r = await verifyKeyBinding(evmDoc());
    expect(r.verified).toBe(true);
    expect(r.scheme).toBe("evm-secp256k1");
    expect(r.subject).toEqual({
      kind: "evm-address",
      value: EVM_ADDRESS.toLowerCase(),
    });
    expect(r.checks).toMatchObject({
      docHashMatches: true,
      signatureValid: true,
      addressMatches: true,
    });
    expect(r.recoveredAddress).toBe(EVM_ADDRESS.toLowerCase());
    expect(r.recomputedDocHash).toBe(EVM_DOC_HASH);
    expect(r.reason).toBeNull();
  });
});

describe("verifyKeyBinding — Ed25519 happy path", () => {
  it("verifies the golden Ed25519 doc end to end", async () => {
    const r = await verifyKeyBinding(edDoc());
    expect(r.verified).toBe(true);
    expect(r.scheme).toBe("ed25519");
    expect(r.subject).toEqual({ kind: "ed25519-pubkey", value: ED_PUBKEY });
    expect(r.reason).toBeNull();
  });
});

describe("verifyKeyBinding — tamper + attack rejection", () => {
  it("rejects a doc whose BODY was mutated after signing (EVM)", async () => {
    const doc = evmDoc();
    (doc.agent as { name: string }).name = "Evil Corp";
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    // Body changed → recomputed hash != what was signed → recovered != claimed.
    expect(r.checks.addressMatches).toBe(false);
    expect(r.recomputedDocHash).not.toBe(EVM_DOC_HASH);
  });

  it("rejects a doc whose BODY was mutated after signing (Ed25519)", async () => {
    const doc = edDoc();
    (doc.agent as { name: string }).name = "Evil Corp";
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    expect(r.checks.signatureValid).toBe(false);
  });

  it("rejects an address swapped to an attacker's (signature not theirs)", async () => {
    const doc = evmDoc();
    doc.identity.address = "0x1111111111111111111111111111111111111111";
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    expect(r.checks.addressMatches).toBe(false);
  });

  it("rejects a missing binding", async () => {
    const doc = evmDoc();
    doc.binding = null;
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/binding/i);
  });

  it("rejects a missing issuedAt (statement would not be reproducible)", async () => {
    const doc = evmDoc();
    (doc as { issuedAt?: string }).issuedAt = "";
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/issuedAt/i);
  });

  it("rejects a malformed signature", async () => {
    const doc = evmDoc();
    doc.binding!.signature = "0x1234";
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/malformed|recover/i);
  });
});

describe("verifyKeyBinding — binding.docHash is advisory, not trusted", () => {
  it("still verifies when binding.docHash is wrong but the body is intact", async () => {
    // The signature is checked over the RE-DERIVED statement (recomputed hash),
    // so a lying binding.docHash cannot break a genuine binding — it only fails
    // the informational docHashMatches check.
    const doc = evmDoc();
    doc.binding!.docHash = "deadbeef".repeat(8);
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(true);
    expect(r.checks.docHashMatches).toBe(false);
    expect(r.checks.addressMatches).toBe(true);
  });
});

describe("encodeIsValidSignatureCall — against the ethers ABI oracle", () => {
  const GOLDEN_CALLDATA =
    "0x1626ba7e5edd814910b7ae1ccd7c256cfc7e2abbd5dfdc9d3027b079ed448a6a0fab170100000000000000000000000000000000000000000000000000000000000000400000000000000000000000000000000000000000000000000000000000000041073a465c391a218d230dde955612e323681acefd379e62634e7f282963a0bca63c207e35daa257b54a1a513476cd30a9bd8a63cbf5aaef6917a83c8b7f9519751c00000000000000000000000000000000000000000000000000000000000000";

  it("encodes isValidSignature(bytes32,bytes) byte-for-byte like ethers", () => {
    const hash = Buffer.from(EVM_EIP191_HASH, "hex");
    const sig = Buffer.from(EVM_SIGNATURE.slice(2), "hex");
    expect(encodeIsValidSignatureCall(hash, sig)).toBe(GOLDEN_CALLDATA);
  });
});

describe("verifyErc1271 — smart-contract account path (mocked RPC)", () => {
  const magic =
    "0x1626ba7e00000000000000000000000000000000000000000000000000000000";

  it("returns true when the contract returns the magic value", async () => {
    const rpcCall = vi.fn().mockResolvedValue(magic);
    const ok = await verifyErc1271(
      EVM_ADDRESS,
      EVM_STATEMENT,
      EVM_SIGNATURE,
      rpcCall,
    );
    expect(ok).toBe(true);
    // The RPC was asked to call the account with isValidSignature calldata.
    expect(rpcCall).toHaveBeenCalledOnce();
    const arg = rpcCall.mock.calls[0]![0] as { to: string; data: string };
    expect(arg.to).toBe(EVM_ADDRESS);
    expect(arg.data.startsWith("0x1626ba7e")).toBe(true);
  });

  it("returns false when the contract returns a non-magic value", async () => {
    const rpcCall = vi.fn().mockResolvedValue("0x" + "ff".repeat(32));
    expect(
      await verifyErc1271(EVM_ADDRESS, EVM_STATEMENT, EVM_SIGNATURE, rpcCall),
    ).toBe(false);
  });

  it("returns false (never throws) when the RPC call rejects", async () => {
    const rpcCall = vi.fn().mockRejectedValue(new Error("rpc down"));
    expect(
      await verifyErc1271(EVM_ADDRESS, EVM_STATEMENT, EVM_SIGNATURE, rpcCall),
    ).toBe(false);
  });
});

describe("verifyKeyBinding — ERC-1271 wiring", () => {
  function erc1271Doc(): IdentityDoc {
    const doc = evmDoc();
    doc.identity.accountType = "erc1271";
    return doc;
  }

  it("verifies when the injected rpcCall approves", async () => {
    const magic =
      "0x1626ba7e00000000000000000000000000000000000000000000000000000000";
    const r = await verifyKeyBinding(erc1271Doc(), {
      rpcCall: async () => magic,
    });
    expect(r.verified).toBe(true);
    expect(r.checks.contractApproved).toBe(true);
    expect(r.subject).toEqual({
      kind: "evm-address",
      value: EVM_ADDRESS.toLowerCase(),
    });
  });

  it("fails closed when no rpcCall is provided for an erc1271 account", async () => {
    const r = await verifyKeyBinding(erc1271Doc());
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/rpcCall|erc1271/i);
  });

  it("rejects when the contract disapproves", async () => {
    const r = await verifyKeyBinding(erc1271Doc(), {
      rpcCall: async () => "0x" + "00".repeat(32),
    });
    expect(r.verified).toBe(false);
    expect(r.checks.contractApproved).toBe(false);
  });
});

describe("verifyKeyBinding — unknown scheme", () => {
  it("rejects an unsupported scheme", async () => {
    const doc = evmDoc();
    (doc.identity as { scheme: string }).scheme = "rsa-pss";
    const r = await verifyKeyBinding(doc);
    expect(r.verified).toBe(false);
    expect(r.reason).toMatch(/unsupported/i);
  });
});
