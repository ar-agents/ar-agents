/**
 * Recipe 13 — Anti-fraud pre-charge middleware.
 *
 * Before authorizing a charge, run a chain of cheap heuristics that catch the
 * most common LATAM fraud patterns. None of these is a hard NO on its own —
 * they're scored and combined into a single risk verdict that the agent (or
 * a human reviewer) can act on.
 *
 * # The heuristics
 *
 *   1. **CUIT validity** (@ar-agents/identity)
 *      Algorithm-only, free. A malformed CUIT is a strong signal of either
 *      typo or test/fraud account. -10 risk points if valid, +30 if invalid.
 *
 *   2. **CUIT activity in BCRA Central de Deudores** (@ar-agents/banking,
 *      adapter-required)
 *      Returns worstSituation 0-6. 0 = no debt reported, 5+ = irrecuperable.
 *      Only relevant for high-value subscriptions where a defaulting CUIT is
 *      a reliable predictor.
 *
 *   3. **Payer email history** (mercadopago — searchPayments by email)
 *      A buyer with a healthy history of approved payments is low-risk. A
 *      buyer with a recent string of rejections (especially status_detail
 *      = `cc_rejected_call_for_authorize` or `cc_rejected_high_risk`) is
 *      flagged.
 *
 *   4. **Velocity check** (in-memory or Vercel KV)
 *      Charges to the same email within a 1-hour window. >3 attempts in
 *      the last hour is a strong fraud signal.
 *
 *   5. **AR issuer-promo abuse** (@ar-agents/mercadopago AR_ISSUER_PROMOS)
 *      Stacking multiple promos in a single transaction is a known abuse
 *      pattern — flag if more than one applies.
 *
 * # Output
 *
 * `{ verdict: "approve" | "review" | "reject"; score: number; reasons: string[] }`
 *
 * The agent's pre-charge check looks like:
 *
 *   const verdict = await runFraudCheck({ payerEmail, transactionAmount, cuit });
 *   if (verdict.verdict === "reject") return { error: "fraud_check_failed", ...verdict };
 *   if (verdict.verdict === "review") {
 *     const ok = await requireHumanReview(verdict);
 *     if (!ok) return { error: "human_rejected", ...verdict };
 *   }
 *   return await mp.createPayment({ ...params });
 */

import {
  MercadoPagoClient,
  paginatePayments,
  AR_ISSUER_PROMOS,
  type Payment,
} from "@ar-agents/mercadopago";

const mp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!,
});

// ─────────────────────────────────────────────────────────────────────────────
// Velocity tracker — replace with VercelKV in production
// ─────────────────────────────────────────────────────────────────────────────

const velocityStore = new Map<string, number[]>(); // email → array of unix timestamps

function recordAttempt(email: string) {
  const now = Date.now();
  const history = velocityStore.get(email) ?? [];
  history.push(now);
  // Keep only the last hour.
  velocityStore.set(
    email,
    history.filter((t) => now - t < 60 * 60 * 1000),
  );
}

function attemptsInLastHour(email: string): number {
  const now = Date.now();
  const history = velocityStore.get(email) ?? [];
  return history.filter((t) => now - t < 60 * 60 * 1000).length;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic checks — each returns { points, reason } or null if not applicable
// ─────────────────────────────────────────────────────────────────────────────

type Signal = { points: number; reason: string };

function scoreCuit(cuit: string | undefined): Signal | null {
  if (!cuit) return null;
  // Pure-algorithm validation — see @ar-agents/identity for the implementation.
  // Inlined here to keep the recipe import-graph small.
  const digits = cuit.replace(/[^\d]/g, "");
  if (digits.length !== 11) {
    return { points: 30, reason: "CUIT length is not 11 digits" };
  }
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  const checksum = (11 - (sum % 11)) % 11;
  if (checksum !== Number(digits[10])) {
    return { points: 30, reason: "CUIT checksum invalid" };
  }
  return { points: -10, reason: "CUIT validates" };
}

async function scorePayerHistory(payerEmail: string): Promise<Signal[]> {
  const recent: Payment[] = [];
  let count = 0;
  for await (const p of paginatePayments(mp, { payerEmail, limit: 50 })) {
    recent.push(p);
    if (++count >= 50) break;
  }
  if (recent.length === 0) {
    return [
      { points: 5, reason: "First-time payer — no history to score against" },
    ];
  }
  const approved = recent.filter((p) => p.status === "approved").length;
  const rejected = recent.filter((p) => p.status === "rejected").length;
  const fraudFlags = recent.filter((p) => {
    const detail = (p as Payment & { status_detail?: string }).status_detail ?? "";
    return (
      detail === "cc_rejected_call_for_authorize" ||
      detail === "cc_rejected_high_risk" ||
      detail === "cc_rejected_blacklist"
    );
  }).length;
  const signals: Signal[] = [];
  if (approved >= 3) {
    signals.push({ points: -15, reason: `${approved} successful past charges` });
  }
  if (rejected >= 5) {
    signals.push({ points: 15, reason: `${rejected} rejected charges in history` });
  }
  if (fraudFlags >= 2) {
    signals.push({
      points: 40,
      reason: `${fraudFlags} fraud-flag rejections (call_for_authorize / high_risk / blacklist)`,
    });
  }
  return signals;
}

function scoreVelocity(payerEmail: string): Signal | null {
  const attempts = attemptsInLastHour(payerEmail);
  if (attempts === 0) return null;
  if (attempts >= 5) {
    return { points: 50, reason: `${attempts} charge attempts in the last hour` };
  }
  if (attempts >= 3) {
    return { points: 20, reason: `${attempts} charge attempts in the last hour` };
  }
  return { points: 5, reason: `${attempts} prior attempts in the last hour` };
}

function scoreIssuerPromo(args: {
  paymentMethodId?: string;
  installments?: number;
}): Signal | null {
  if (!args.paymentMethodId || !args.installments) return null;
  const applicable = AR_ISSUER_PROMOS.filter(
    (p) =>
      p.cardBrand === args.paymentMethodId &&
      args.installments! >= p.installments,
  );
  if (applicable.length > 1) {
    return {
      points: 25,
      reason: `Stacks ${applicable.length} issuer promos — possible abuse`,
    };
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Combined check
// ─────────────────────────────────────────────────────────────────────────────

export async function runFraudCheck(input: {
  payerEmail: string;
  transactionAmount: number;
  cuit?: string;
  paymentMethodId?: string;
  installments?: number;
}): Promise<{
  verdict: "approve" | "review" | "reject";
  score: number;
  reasons: string[];
}> {
  recordAttempt(input.payerEmail);

  const signals: Signal[] = [];

  const cuitSignal = scoreCuit(input.cuit);
  if (cuitSignal) signals.push(cuitSignal);

  signals.push(...(await scorePayerHistory(input.payerEmail)));

  const velocity = scoreVelocity(input.payerEmail);
  if (velocity) signals.push(velocity);

  const promo = scoreIssuerPromo(input);
  if (promo) signals.push(promo);

  // High-value charges get extra scrutiny (multiplier on accumulated risk).
  const score = signals.reduce((acc, s) => acc + s.points, 0);
  const adjusted = input.transactionAmount > 100_000 ? score * 1.5 : score;

  let verdict: "approve" | "review" | "reject";
  if (adjusted >= 60) verdict = "reject";
  else if (adjusted >= 25) verdict = "review";
  else verdict = "approve";

  return {
    verdict,
    score: Math.round(adjusted),
    reasons: signals.map((s) => `${s.points >= 0 ? "+" : ""}${s.points}: ${s.reason}`),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Example wired into a charge flow
// ─────────────────────────────────────────────────────────────────────────────

export async function chargeWithFraudCheck(input: {
  payerEmail: string;
  transactionAmount: number;
  cuit?: string;
  paymentMethodId: string;
  cardToken: string;
  installments: number;
  externalReference: string;
}) {
  const fraud = await runFraudCheck({
    payerEmail: input.payerEmail,
    transactionAmount: input.transactionAmount,
    cuit: input.cuit,
    paymentMethodId: input.paymentMethodId,
    installments: input.installments,
  });

  if (fraud.verdict === "reject") {
    throw new Error(
      `Fraud check rejected (score ${fraud.score}): ${fraud.reasons.join("; ")}`,
    );
  }

  if (fraud.verdict === "review") {
    // In production: route to a human reviewer queue. For this recipe, we log.
    console.warn(
      `[fraud-review] score ${fraud.score} for ${input.payerEmail}: ${fraud.reasons.join("; ")}`,
    );
  }

  // Charge proceeds (the fraud signals are attached as metadata for audit).
  return await mp.createPayment({
    transactionAmount: input.transactionAmount,
    paymentMethodId: input.paymentMethodId,
    payerEmail: input.payerEmail,
    token: input.cardToken,
    installments: input.installments,
    externalReference: input.externalReference,
    metadata: {
      fraud_score: fraud.score,
      fraud_verdict: fraud.verdict,
      fraud_reasons: fraud.reasons,
    },
  });
}
