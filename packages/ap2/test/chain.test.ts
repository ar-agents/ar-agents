// Multi-hop dSD-JWT chain tests.
//
// Builds 2-hop and 3-hop chains by manually composing root + KB-SD-JWT hops
// (via the public crypto + sd-jwt primitives), then exercises
// `verifyDsdJwtChain` for happy-path + every documented failure mode.

import { describe, it, expect } from "vitest";
import {
  CHAIN_SEPARATOR,
  parseDsdJwtChain,
  serializeDsdJwtChain,
  verifyDsdJwtChain,
  generateAp2KeyPair,
  signCheckoutJwt,
  computeCheckoutHash,
  buildIssuerPayload,
  signCompactJws,
  computeSdHash,
  serializeSdJwt,
  encodeDisclosure,
  digestOfDisclosure,
  generateSalt,
  type Ap2KeyPair,
  type ClosedCheckoutMandate,
  type OpenCheckoutMandate,
} from "../src";

// ---------------------------------------------------------------------------
// Helpers — build hops manually using the primitives.
// ---------------------------------------------------------------------------

interface HopBuildResult {
  presentation: string;
  sdHash: string;
}

/** Build a root hop carrying an open-mandate-shaped delegate_payload. */
async function buildRootHop(
  signer: Ap2KeyPair,
  delegateItem: OpenCheckoutMandate | { cnf: { jwk: unknown } },
  options: { iat?: number; exp?: number } = {},
): Promise<HopBuildResult> {
  const salt = generateSalt();
  const enc = encodeDisclosure({ salt, value: delegateItem });
  const digest = await digestOfDisclosure(enc);
  const issuerPayload: Record<string, unknown> = {
    delegate_payload: [{ "...": digest }],
    _sd_alg: "sha-256",
    ...(options.iat !== undefined ? { iat: options.iat } : {}),
    ...(options.exp !== undefined ? { exp: options.exp } : {}),
  };
  const issuerJwt = await signCompactJws(issuerPayload, signer.privateKey, {
    alg: "ES256",
    typ: "example+sd-jwt",
  });
  const presentation = serializeSdJwt({
    issuerJwt,
    disclosures: [enc],
    kbJwt: undefined,
  });
  const sdHash = await computeSdHash({ issuerJwt, disclosures: [enc] });
  return { presentation, sdHash };
}

/**
 * Build a KB-SD-JWT hop. Signs with the holder's key; carries the supplied
 * delegate_payload item (a closed mandate at terminal, or an intermediate
 * cnf binding).
 */
async function buildKbHop(args: {
  signer: Ap2KeyPair;
  prevSdHash: string;
  delegateItem: unknown;
  audience: string;
  nonce: string;
  isTerminal: boolean;
  iat?: number;
}): Promise<HopBuildResult> {
  const salt = generateSalt();
  const enc = encodeDisclosure({ salt, value: args.delegateItem });
  const digest = await digestOfDisclosure(enc);
  const issuerPayload: Record<string, unknown> = {
    delegate_payload: [{ "...": digest }],
    _sd_alg: "sha-256",
    sd_hash: args.prevSdHash,
    aud: args.audience,
    nonce: args.nonce,
    iat: args.iat ?? Math.floor(Date.now() / 1000),
  };
  const typ = args.isTerminal ? "kb+sd-jwt" : "kb+sd-jwt+kb";
  const issuerJwt = await signCompactJws(issuerPayload, args.signer.privateKey, {
    alg: "ES256",
    typ,
  });
  const presentation = serializeSdJwt({
    issuerJwt,
    disclosures: [enc],
    kbJwt: undefined,
  });
  const sdHash = await computeSdHash({ issuerJwt, disclosures: [enc] });
  return { presentation, sdHash };
}

async function buildSampleClosedCheckout(
  merchant: Ap2KeyPair,
): Promise<ClosedCheckoutMandate> {
  const checkoutJwt = await signCheckoutJwt(
    {
      order_id: "ord_chain",
      merchant: { id: "merchant_chain", name: "Chain Merchant" },
      line_items: [
        {
          id: "li_1",
          product: { id: "p1", title: "Item", price: 1, currency: "USD" },
          quantity: 1,
        },
      ],
      total_price: 1,
      currency: "USD",
    },
    merchant.privateKey,
  );
  const checkoutHash = await computeCheckoutHash(checkoutJwt);
  return {
    vct: "mandate.checkout.1",
    checkout_jwt: checkoutJwt,
    checkout_hash: checkoutHash,
  };
}

// ---------------------------------------------------------------------------
// parseDsdJwtChain + serializeDsdJwtChain
// ---------------------------------------------------------------------------

describe("parseDsdJwtChain", () => {
  it("treats a single-hop string as a 1-hop chain (degenerate case)", async () => {
    const merchant = await generateAp2KeyPair("ES256");
    const closed = await buildSampleClosedCheckout(merchant);
    const root = await buildRootHop(merchant, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "merchant_chain" }] },
      ],
      cnf: { jwk: merchant.publicJwk },
    });
    const chain = parseDsdJwtChain(root.presentation);
    expect(chain.hops.length).toBe(1);
    expect(chain.presentation).toBe(root.presentation);
    expect(closed.checkout_hash).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("parses a 2-hop chain", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "m" }] },
      ],
      cnf: { jwk: agent.publicJwk },
    });
    const merchant = await generateAp2KeyPair("ES256");
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: rootHop.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "n1",
      isTerminal: true,
    });

    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;
    const chain = parseDsdJwtChain(presentation);
    expect(chain.hops.length).toBe(2);
  });

  it("throws on empty chunks (e.g. `~~~~`)", () => {
    expect(() => parseDsdJwtChain("a~b~~~~c~d")).toThrow();
  });
});

describe("serializeDsdJwtChain", () => {
  it("round-trips through parse → serialize → parse", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "merchant_chain" }] },
      ],
      cnf: { jwk: agent.publicJwk },
    });
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: rootHop.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "n1",
      isTerminal: true,
    });

    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;
    const reSerialized = serializeDsdJwtChain(parseDsdJwtChain(presentation));
    expect(reSerialized).toBe(presentation);
  });
});

// ---------------------------------------------------------------------------
// verifyDsdJwtChain — happy path
// ---------------------------------------------------------------------------

describe("verifyDsdJwtChain — 2-hop happy path (Trusted Agent Provider model)", () => {
  it("verifies a root + terminal chain end-to-end", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const openMandate: OpenCheckoutMandate = {
      vct: "mandate.checkout.open.1",
      constraints: [
        {
          type: "checkout.allowed_merchants",
          allowed: [{ id: "merchant_chain" }],
        },
        {
          type: "checkout.line_items",
          items: [
            {
              id: "c1",
              acceptable_items: [{ id: "p1" }],
              quantity: 1,
            },
          ],
        },
      ],
      cnf: { jwk: agent.publicJwk },
    };
    const rootHop = await buildRootHop(root, openMandate);

    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: rootHop.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "merchant-issued-nonce",
      isTerminal: true,
    });

    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;
    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "merchant-issued-nonce",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.hops.length).toBe(2);
    expect(result.hops[0]?.isIntermediate).toBe(false); // root
    expect(result.hops[1]?.isTerminal).toBe(true);
    expect(result.openMandates.length).toBe(1);
    expect(result.openMandates[0]?.vct).toBe("mandate.checkout.open.1");
    expect(result.closedMandate?.vct).toBe("mandate.checkout.1");
    expect(result.terminalSdHash).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("verifyDsdJwtChain — 3-hop happy path (with intermediate forwarder)", () => {
  it("verifies root → intermediate → terminal", async () => {
    const root = await generateAp2KeyPair("ES256");
    const intermediateHolder = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    // Root hop: open mandate signed by root, cnf binds intermediate.
    const openMandate: OpenCheckoutMandate = {
      vct: "mandate.checkout.open.1",
      constraints: [
        {
          type: "checkout.allowed_merchants",
          allowed: [{ id: "merchant_chain" }],
        },
        {
          type: "checkout.line_items",
          items: [{ id: "c1", acceptable_items: [{ id: "p1" }], quantity: 1 }],
        },
      ],
      cnf: { jwk: intermediateHolder.publicJwk },
    };
    const rootHop = await buildRootHop(root, openMandate);

    // Intermediate hop: signed by intermediateHolder, delegates to agent.
    const intermediateBinding = { cnf: { jwk: agent.publicJwk } };
    const intermediate = await buildKbHop({
      signer: intermediateHolder,
      prevSdHash: rootHop.sdHash,
      delegateItem: intermediateBinding,
      audience: "next-hop", // not the merchant — this is internal hop
      nonce: "intermediate-nonce",
      isTerminal: false, // typ = kb+sd-jwt+kb
    });

    // Terminal hop: signed by agent, carries closed mandate.
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: intermediate.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "merchant-nonce",
      isTerminal: true,
    });

    const presentation = [
      rootHop.presentation,
      intermediate.presentation,
      terminal.presentation,
    ].join(CHAIN_SEPARATOR);

    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "merchant-nonce",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.hops.length).toBe(3);
    expect(result.hops[0]?.isIntermediate).toBe(false); // root
    expect(result.hops[1]?.isIntermediate).toBe(true); // intermediate
    expect(result.hops[2]?.isTerminal).toBe(true);
    expect(result.openMandates.length).toBe(1); // only root carries open mandate
  });
});

// ---------------------------------------------------------------------------
// verifyDsdJwtChain — failure modes
// ---------------------------------------------------------------------------

describe("verifyDsdJwtChain — failure modes", () => {
  it("fails when terminal hop nonce doesn't match", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "m" }] },
      ],
      cnf: { jwk: agent.publicJwk },
    });
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: rootHop.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "wrong-nonce",
      isTerminal: true,
    });
    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;

    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "expected-nonce",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_credential");
    expect(result.reason).toContain("nonce");
  });

  it("fails when audience mismatch", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "m" }] },
      ],
      cnf: { jwk: agent.publicJwk },
    });
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: rootHop.sdHash,
      delegateItem: closed,
      audience: "wrong-audience",
      nonce: "n1",
      isTerminal: true,
    });
    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;

    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "n1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_credential");
    expect(result.reason).toContain("aud");
  });

  it("fails when sd_hash chain is broken", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "m" }] },
      ],
      cnf: { jwk: agent.publicJwk },
    });
    const closed = await buildSampleClosedCheckout(merchant);
    // BROKEN: sd_hash claims a different value than rootHop's actual sd_hash.
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: "WRONG_SD_HASH",
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "n1",
      isTerminal: true,
    });
    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;

    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "n1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_credential");
    expect(result.reason).toContain("sd_hash");
  });

  it("fails when terminal hop signed by wrong key (not bound to root.cnf)", async () => {
    const root = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const wrongAgent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "m" }] },
      ],
      cnf: { jwk: agent.publicJwk }, // root binds `agent`...
    });
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: wrongAgent, // ...but `wrongAgent` signs the terminal hop
      prevSdHash: rootHop.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "n1",
      isTerminal: true,
    });
    const presentation = `${rootHop.presentation}${CHAIN_SEPARATOR}${terminal.presentation}`;

    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "n1",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_credential");
    expect(result.reason).toMatch(/signature|hop 1/);
  });

  it("fails when intermediate hop has wrong typ", async () => {
    const root = await generateAp2KeyPair("ES256");
    const intermediate = await generateAp2KeyPair("ES256");
    const agent = await generateAp2KeyPair("ES256");
    const merchant = await generateAp2KeyPair("ES256");

    const rootHop = await buildRootHop(root, {
      vct: "mandate.checkout.open.1",
      constraints: [
        { type: "checkout.allowed_merchants", allowed: [{ id: "m" }] },
      ],
      cnf: { jwk: intermediate.publicJwk },
    });

    // Intermediate hop with TERMINAL typ — should be rejected.
    const intermediateBindingHop = await buildKbHop({
      signer: intermediate,
      prevSdHash: rootHop.sdHash,
      delegateItem: { cnf: { jwk: agent.publicJwk } },
      audience: "next-hop",
      nonce: "n-int",
      isTerminal: true, // WRONG: should be intermediate
    });
    const closed = await buildSampleClosedCheckout(merchant);
    const terminal = await buildKbHop({
      signer: agent,
      prevSdHash: intermediateBindingHop.sdHash,
      delegateItem: closed,
      audience: "merchant_chain",
      nonce: "n-final",
      isTerminal: true,
    });
    const presentation = [
      rootHop.presentation,
      intermediateBindingHop.presentation,
      terminal.presentation,
    ].join(CHAIN_SEPARATOR);

    const result = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: root.publicJwk,
      expectedAudience: "merchant_chain",
      expectedNonce: "n-final",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("invalid_credential");
    expect(result.reason).toContain("typ");
  });
});
