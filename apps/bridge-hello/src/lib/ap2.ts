// AP2 demo wiring for bridge-hello.
//
// Holds the demo merchant + agent keys (regenerated per-process; in prod
// you'd persist these via your secret manager) and exposes high-level
// helpers used by the API routes.

import {
  generateAp2KeyPair,
  signCheckoutJwt,
  computeCheckoutHash,
  issueClosedCheckoutMandate,
  issueOpenCheckoutMandate,
  parseSdJwt,
  decodeJwsUnverified,
  resolveDisclosures,
  computeSdHash,
  verifyClosedCheckoutMandate,
  verifyDsdJwtChain,
  importPublicJwk,
  type Ap2KeyPair,
} from "@ar-agents/ap2";

// Lazily-initialized demo keys. Generated once per Node process — fine for
// dev / demos, NOT for production (would lose continuity across restarts).
let _demoKeys: Promise<{
  merchant: Ap2KeyPair;
  agent: Ap2KeyPair;
  rootIssuer: Ap2KeyPair;
}> | null = null;

export function getDemoKeys() {
  if (!_demoKeys) {
    _demoKeys = (async () => {
      const merchant = await generateAp2KeyPair("ES256");
      const agent = await generateAp2KeyPair("ES256");
      const rootIssuer = await generateAp2KeyPair("ES256");
      return { merchant, agent, rootIssuer };
    })();
  }
  return _demoKeys;
}

// ---------------------------------------------------------------------------
// Issue a sample Direct-flow Closed Checkout Mandate.
// ---------------------------------------------------------------------------

export interface DemoCheckoutInput {
  merchant_id?: string;
  order_id?: string;
  total_price?: number;
  currency?: string;
  product?: { id: string; title: string; price: number };
}

export async function issueDemoMandate(input: DemoCheckoutInput = {}) {
  const { merchant, agent } = await getDemoKeys();
  const product = input.product ?? {
    id: "yerba_amanda",
    title: "Yerba mate Amanda 1kg",
    price: 4500,
  };
  const checkoutPayload = {
    order_id: input.order_id ?? `ord_${Date.now()}`,
    merchant: {
      id: input.merchant_id ?? "merchant_bridge_hello",
      name: "Bridge Hello Demo",
      website: "https://example.invalid",
    },
    line_items: [
      {
        id: "li_1",
        product: {
          id: product.id,
          title: product.title,
          price: product.price,
          currency: input.currency ?? "ARS",
        },
        quantity: 1,
      },
    ],
    total_price: input.total_price ?? product.price,
    currency: input.currency ?? "ARS",
  };
  const checkoutJwt = await signCheckoutJwt(checkoutPayload, merchant.privateKey);
  const checkoutHash = await computeCheckoutHash(checkoutJwt);
  const closedMandate = {
    vct: "mandate.checkout.1" as const,
    checkout_jwt: checkoutJwt,
    checkout_hash: checkoutHash,
    iat: Math.floor(Date.now() / 1000),
  };
  const presentation = await issueClosedCheckoutMandate({
    mandate: closedMandate,
    signingCtx: { privateKey: agent.privateKey, alg: "ES256" },
  });
  return {
    presentation,
    closedMandate,
    checkoutPayload,
    keys: {
      merchant_public_jwk: merchant.publicJwk,
      agent_public_jwk: agent.publicJwk,
    },
  };
}

// ---------------------------------------------------------------------------
// Verify a presented mandate. Returns a structured trace suitable for the UI.
// ---------------------------------------------------------------------------

export interface VerifyTrace {
  ok: boolean;
  /** Step-by-step trail of what was checked. */
  steps: Array<{
    label: string;
    ok: boolean;
    detail?: string;
  }>;
  /** Decoded header of the issuer JWS (always set when parsing succeeds). */
  header?: unknown;
  /** Resolved issuer payload (with disclosures merged in). */
  resolvedPayload?: unknown;
  /** sd_hash of the SD-JWT presentation (when verification succeeded). */
  sdHash?: string;
  /** Decoded inner checkout payload, when applicable. */
  innerCheckout?: unknown;
  /** Reason, when failed. */
  reason?: string;
}

export async function verifyMandate(presentation: string): Promise<VerifyTrace> {
  const { merchant, agent } = await getDemoKeys();
  const steps: VerifyTrace["steps"] = [];

  // Step 1: parse SD-JWT
  let parts;
  try {
    parts = parseSdJwt(presentation);
    steps.push({
      label: "Parse SD-JWT presentation",
      ok: true,
      detail: `disclosures: ${parts.disclosures.length}, kb-jwt: ${parts.kbJwt ? "present" : "absent"}`,
    });
  } catch (err) {
    steps.push({
      label: "Parse SD-JWT presentation",
      ok: false,
      detail: (err as Error).message,
    });
    return { ok: false, steps, reason: (err as Error).message };
  }

  // Step 2: decode the issuer JWS header (without verifying yet)
  let header: unknown;
  let payload: unknown;
  try {
    const decoded = decodeJwsUnverified(parts.issuerJwt);
    header = decoded.protectedHeader;
    payload = decoded.payload;
    steps.push({
      label: "Decode issuer JWS header",
      ok: true,
      detail: `alg: ${decoded.protectedHeader.alg}, typ: ${decoded.protectedHeader.typ ?? "(none)"}`,
    });
  } catch (err) {
    steps.push({
      label: "Decode issuer JWS header",
      ok: false,
      detail: (err as Error).message,
    });
    return { ok: false, steps, reason: (err as Error).message };
  }

  // Step 3: resolve disclosures
  let resolved: Record<string, unknown>;
  try {
    resolved = await resolveDisclosures(
      payload as Record<string, unknown>,
      parts.disclosures,
    );
    steps.push({
      label: "Resolve selective disclosures",
      ok: true,
      detail: `resolved keys: ${Object.keys(resolved).join(", ") || "(none)"}`,
    });
  } catch (err) {
    steps.push({
      label: "Resolve selective disclosures",
      ok: false,
      detail: (err as Error).message,
    });
    return { ok: false, steps, reason: (err as Error).message, header };
  }

  // Step 4: compute sd_hash
  const sdHash = await computeSdHash({
    issuerJwt: parts.issuerJwt,
    disclosures: parts.disclosures,
  });
  steps.push({
    label: "Compute sd_hash (base64url(sha-256))",
    ok: true,
    detail: sdHash,
  });

  // Step 5: full verification (against demo keys)
  const vct = (resolved as { vct?: string }).vct;
  if (vct === "mandate.checkout.1") {
    const r = await verifyClosedCheckoutMandate(presentation, {
      issuerKey: agent.publicJwk,
      checkoutJwtKey: merchant.publicJwk,
    });
    if (r.ok) {
      steps.push({
        label: "Verify closed checkout mandate (signatures + checkout_hash)",
        ok: true,
        detail: `agent + merchant signatures valid, checkout_hash matches`,
      });
      steps.push({
        label: "Inner checkout_jwt verified",
        ok: true,
        detail: `order_id: ${r.mandate.checkout.order_id}, merchant: ${r.mandate.checkout.merchant.id}`,
      });
      return {
        ok: true,
        steps,
        header,
        resolvedPayload: resolved,
        sdHash: r.sdHash,
        innerCheckout: r.mandate.checkout,
      };
    }
    steps.push({
      label: "Verify closed checkout mandate",
      ok: false,
      detail: r.reason,
    });
    return {
      ok: false,
      steps,
      header,
      resolvedPayload: resolved,
      sdHash,
      reason: r.reason,
    };
  }

  if (presentation.includes("~~")) {
    // Try to verify as a multi-hop chain.
    const { rootIssuer } = await getDemoKeys();
    const r = await verifyDsdJwtChain(presentation, {
      rootIssuerKey: rootIssuer.publicJwk,
      expectedAudience: "merchant_bridge_hello",
      expectedNonce: "demo-nonce",
    });
    if (r.ok) {
      steps.push({
        label: "Verify dSD-JWT chain (multi-hop)",
        ok: true,
        detail: `${r.hops.length} hops, ${r.openMandates.length} open mandates, terminal sd_hash: ${r.terminalSdHash}`,
      });
      return {
        ok: true,
        steps,
        header,
        resolvedPayload: resolved,
        sdHash: r.terminalSdHash,
      };
    }
    steps.push({
      label: "Verify dSD-JWT chain",
      ok: false,
      detail: r.reason,
    });
    return {
      ok: false,
      steps,
      header,
      resolvedPayload: resolved,
      sdHash,
      reason: r.reason,
    };
  }

  steps.push({
    label: "Identify mandate type",
    ok: false,
    detail: `Unknown vct: ${vct ?? "(missing)"}. This demo verifier only accepts mandate.checkout.1 single-hop or dSD-JWT chains.`,
  });
  return {
    ok: false,
    steps,
    header,
    resolvedPayload: resolved,
    sdHash,
    reason: "Unknown vct or unsupported mandate type for this demo",
  };
}
