/**
 * Recipe 21 — Cross-jurisdictional commerce w/ AP2 mandate verification.
 *
 * # Pattern
 *
 * A USA-LLC agent (e.g., a Wyoming DAO LLC operating an Etsy-style
 * marketplace) wants to sell to AR consumers via MP, but doesn't have AR
 * fiscal residency. The AR-side is a sociedad-IA (or pre-launch SAS) that
 * (a) issues factura A/B/C to the AR consumer, (b) cobra MP, (c) settles
 * inter-entity to the USA-LLC weekly.
 *
 * Each cross-entity transaction is gated by an AP2 (Google Agent Payments
 * Protocol) mandate the USA-LLC signs and the AR sociedad verifies before
 * acting. This is what RFC-001 § 7 sketches as the contract surface for
 * "agent commerce that crosses jurisdictions".
 *
 * The mandate has 3 critical fields:
 *   - issuer: USA-LLC's stable identifier (DID, DAO LLC EIN, etc.)
 *   - subject: the AR sociedad's CUIT
 *   - claims: { action: "factura.emit", amount, currency: "ARS",
 *               consumer: { dni, email }, allowance: { capPerMonth, capPerOp } }
 *
 * Verification:
 *   1. AP2 verify chain — JWS ES256 signature against the issuer's pinned key.
 *   2. Mandate hasn't expired (`exp` claim).
 *   3. Operation respects the cap (cumulative against the audit log).
 *   4. Consumer-side checks (CUIT validity, BCRA situation if amount large).
 *
 * If any check fails, the AR sociedad refuses + logs the refusal in the
 * audit log. RFC-001 § 9.2 makes that audit entry probative — the USA-LLC
 * can later challenge "you said no, prove the rule".
 *
 * # Edge Runtime
 *
 * Yes — @ar-agents/ap2 + @ar-agents/incorporate are both fetch-only.
 * Verification uses Web Crypto's verify() against the issuer's pinned JWK.
 *
 * # Production caveats
 *
 * - The AR sociedad MUST emit the factura under its own CUIT, not the
 *   USA-LLC's. Cross-CUIT factura is not legal in AR.
 * - Settlement between entities is an SLA between the operator and the
 *   USA-LLC. The toolkit doesn't dictate the cadence; recipe 22 (planned)
 *   covers nightly reconciliation.
 * - For amounts > certain BCRA thresholds, AR sociedad needs to hold
 *   funds for ~2 days while AFIP IBPP processes. The agent should surface
 *   this to the consumer at checkout.
 */

import { fetchAudit } from "@ar-agents/incorporate";
import { verifyMandate, type Mandate } from "@ar-agents/ap2";
import {
  identityTools,
  UnconfiguredAfipPadronAdapter,
} from "@ar-agents/identity";
import { facturacionTools } from "@ar-agents/facturacion";
import { bankingTools } from "@ar-agents/banking";

// ─────────────────────────────────────────────────────────────────────────────
// Mandate the USA-LLC sends to the AR sociedad
// ─────────────────────────────────────────────────────────────────────────────

interface CrossJurisdictionalClaims {
  action: "factura.emit" | "mp.charge" | "shipment.create";
  amountArs: number;
  currency: "ARS";
  consumer: { cuit: string; email: string };
  allowance: {
    capPerOpArs: number;
    capPerMonthArs: number;
  };
  /** ISO 8601. Mandate expires here. */
  exp: string;
  /** USA-LLC's transaction reference for reconciliation. */
  externalId: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// AR sociedad's verify-then-act handler
// ─────────────────────────────────────────────────────────────────────────────

interface VerifyAndActOptions {
  /**
   * The AR sociedad's audit-log session id. All operations under this
   * mandate land in the same forensic timeline.
   */
  sessionId: string;
  /**
   * The USA-LLC's JWK that issued the mandate. In production: pinned
   * via the platform's vendor table.
   */
  issuerJwk: JsonWebKey;
  /** The mandate the USA-LLC delivered. */
  mandate: Mandate<CrossJurisdictionalClaims>;
}

interface ActResult {
  ok: boolean;
  reason?: string;
  facturaCae?: string;
  auditDashboardUrl: string;
}

export async function verifyAndAct(
  options: VerifyAndActOptions,
): Promise<ActResult> {
  const { sessionId, issuerJwk, mandate } = options;

  // ─── 1. Verify the AP2 mandate ──────────────────────────────────────
  const verification = await verifyMandate(mandate, { issuerJwk });
  if (!verification.valid) {
    return {
      ok: false,
      reason: `Mandate verification failed: ${verification.reason}`,
      auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
    };
  }

  // ─── 2. Expiry check ────────────────────────────────────────────────
  if (Date.parse(mandate.claims.exp) < Date.now()) {
    return {
      ok: false,
      reason: "Mandate expired (exp claim in the past)",
      auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
    };
  }

  // ─── 3. Per-op cap ──────────────────────────────────────────────────
  if (mandate.claims.amountArs > mandate.claims.allowance.capPerOpArs) {
    return {
      ok: false,
      reason: `Amount $${mandate.claims.amountArs} exceeds per-op cap $${mandate.claims.allowance.capPerOpArs}.`,
      auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
    };
  }

  // ─── 4. Cumulative cap (querying the audit log) ─────────────────────
  // Pull this month's prior emissions on the same sessionId + sum.
  const audit = (await fetchAudit(sessionId, { verify: false })) as {
    entries: Array<{
      tool: string;
      ts: string;
      input: { amountArs?: number; externalId?: string };
    }>;
  };
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const cumulative = audit.entries
    .filter(
      (e) =>
        e.tool === "cross_jurisdictional_factura_emit" &&
        Date.parse(e.ts) >= monthStart.getTime(),
    )
    .reduce((sum, e) => sum + (e.input.amountArs ?? 0), 0);

  if (cumulative + mandate.claims.amountArs > mandate.claims.allowance.capPerMonthArs) {
    return {
      ok: false,
      reason: `Cumulative monthly emissions ($${cumulative} + $${mandate.claims.amountArs}) exceed cap $${mandate.claims.allowance.capPerMonthArs}.`,
      auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
    };
  }

  // ─── 5. Idempotency: did we already process this externalId? ────────
  if (
    audit.entries.some(
      (e) =>
        e.tool === "cross_jurisdictional_factura_emit" &&
        e.input.externalId === mandate.claims.externalId,
    )
  ) {
    return {
      ok: false,
      reason: `externalId ${mandate.claims.externalId} already processed (idempotency).`,
      auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
    };
  }

  // ─── 6. Validate the consumer's CUIT ────────────────────────────────
  // (Real prod would have an AfipPadronAdapter wired — using the
  // unconfigured shim here just to demonstrate the flow.)
  const idTools = identityTools({ afip: new UnconfiguredAfipPadronAdapter() });
  const cuitCheck = await idTools.validate_cuit.execute({
    cuit: mandate.claims.consumer.cuit,
  });
  if (!cuitCheck.valid) {
    return {
      ok: false,
      reason: `Consumer CUIT ${mandate.claims.consumer.cuit} is malformed.`,
      auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
    };
  }

  // ─── 7. For amounts above $500k ARS, BCRA credit-situation check ────
  if (mandate.claims.amountArs > 500_000) {
    const bk = bankingTools();
    // In production this hits BCRA Central de Deudores for real; mock here.
    const credit = await bk.lookup_credit_situation.execute({
      cuit: mandate.claims.consumer.cuit,
    });
    if (
      credit.available === false ||
      (credit.worstSituation && credit.worstSituation > 2)
    ) {
      return {
        ok: false,
        reason: `Consumer has BCRA situation ${credit.worstSituation} (>2 = high risk).`,
        auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
      };
    }
  }

  // ─── 8. Emit the factura ────────────────────────────────────────────
  // (Real prod requires AFIP cert; using mock returns CAE here.)
  const fact = facturacionTools();
  // Note: in real code, you'd select cbteTipo ("FACTURA_B" for
  // CONSUMIDOR_FINAL etc.) based on AFIP padron lookup of the consumer.
  // Demo just hardcodes Factura B + 21% IVA.
  const result = await fact.crear_factura.execute({
    cbteTipo: "FACTURA_B",
    docTipo: "CUIT",
    docNro: mandate.claims.consumer.cuit,
    impTotal: mandate.claims.amountArs,
    impNeto: Math.round(mandate.claims.amountArs / 1.21),
    impIVA: mandate.claims.amountArs - Math.round(mandate.claims.amountArs / 1.21),
  });

  // ─── 9. Audit log entry happens automatically via the tool wrapper.
  //       Surface the result + dashboard URL for the USA-LLC's records.

  return {
    ok: true,
    facturaCae: result.cae ?? undefined,
    auditDashboardUrl: `https://ar-agents.ar/dashboard/${sessionId}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Example: handle a cross-jurisdictional factura request
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const sessionId = "tenant-clawbank-llc-ar"; // pinned per USA-LLC tenant

  // Mandate the USA-LLC produced (signed JWS; pretend it's already verified
  // structurally — in real code, JWS parsing happens inside verifyMandate).
  const mandate = {
    issuer: "wyoming-dao-llc:claw-bank",
    subject: "ar-sociedad:30123456789",
    claims: {
      action: "factura.emit" as const,
      amountArs: 75_000,
      currency: "ARS" as const,
      consumer: { cuit: "20-12345678-9", email: "consumidor@example.com" },
      allowance: {
        capPerOpArs: 100_000,
        capPerMonthArs: 2_000_000,
      },
      exp: new Date(Date.now() + 3600 * 1000).toISOString(),
      externalId: "claw-bank:tx_42",
    },
    signature: "<JWS-ES256-signature>", // produced by USA-LLC
  } as unknown as Mandate<CrossJurisdictionalClaims>;

  // The USA-LLC's pinned issuer key. In production: pulled from the
  // platform's vendor table at signup time.
  const issuerJwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: "<base64url-x>",
    y: "<base64url-y>",
  };

  const result = await verifyAndAct({ sessionId, issuerJwk, mandate });

  if (!result.ok) {
    console.error("Refused:", result.reason);
    console.error("Audit dashboard:", result.auditDashboardUrl);
    process.exit(0);
  }

  console.log("Factura emitted:", result.facturaCae);
  console.log("Audit dashboard:", result.auditDashboardUrl);
  console.log(
    "Settlement reference:",
    `clawbank-llc:${mandate.claims.externalId}`,
  );
}

if (typeof require !== "undefined" && require.main === module) {
  main().catch((err) => {
    console.error("Recipe 21 failed:", err);
    process.exit(1);
  });
}

export { main };
