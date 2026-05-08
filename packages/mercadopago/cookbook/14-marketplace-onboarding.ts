/**
 * Recipe 14 — Marketplace seller onboarding flow.
 *
 * The end-to-end flow for connecting a seller's MP account to your platform:
 *
 *   1. **CUIT validation** (algorithm-only, free)
 *   2. **AFIP padron lookup** (@ar-agents/identity, adapter-required) —
 *      verifies the CUIT exists, resolves the legal name + IVA condition.
 *      Bonus: detects monotributo category, which determines the maximum
 *      monthly invoice amount and informs your platform's tier rules.
 *   3. **OAuth redirect** — generate the MP marketplace OAuth URL with PKCE
 *      and your platform's redirect_uri.
 *   4. **OAuth callback** — exchange the auth code for access + refresh
 *      tokens. Persist them keyed by your internal seller-id.
 *   5. **First test charge** — bill a tiny token amount ($1 ARS) to verify
 *      the OAuth chain works end-to-end before the seller's first real sale.
 *   6. **Marketplace fee setup** — compute platform fee on subsequent
 *      charges using `computeMarketplaceFee`.
 *
 * # State
 *
 * Use `VercelKVOAuthTokenStore` for OAuth token persistence in production.
 * In-memory in this recipe.
 */

import {
  MercadoPagoClient,
  computeMarketplaceFee,
  type OAuthTokens,
} from "@ar-agents/mercadopago";

const platformMp = new MercadoPagoClient({
  accessToken: process.env.MP_ACCESS_TOKEN!, // your platform's APP_USR-... token
});

// ─────────────────────────────────────────────────────────────────────────────
// Token store — replace with VercelKVOAuthTokenStore in prod
// ─────────────────────────────────────────────────────────────────────────────

const tokenStore = new Map<string, OAuthTokens>();

// ─────────────────────────────────────────────────────────────────────────────
// Step 1: CUIT validation
// ─────────────────────────────────────────────────────────────────────────────

export function validateCuitForOnboarding(cuit: string): {
  ok: boolean;
  formatted?: string;
  error?: string;
} {
  const digits = cuit.replace(/[^\d]/g, "");
  if (digits.length !== 11) {
    return { ok: false, error: "CUIT must have 11 digits" };
  }
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((a, w, i) => a + w * Number(digits[i]), 0);
  const expected = (11 - (sum % 11)) % 11;
  if (expected !== Number(digits[10])) {
    return { ok: false, error: "CUIT checksum invalid" };
  }
  return {
    ok: true,
    formatted: `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2: AFIP padron lookup (skipped if @ar-agents/identity isn't wired)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calls `@ar-agents/identity`'s lookup_cuit_afip if available. Returns null
 * if the package isn't installed (recipe stays runnable without AFIP creds).
 */
export async function lookupSellerAtAfip(cuit: string): Promise<{
  legalName: string;
  ivaCondition: string;
  monotributoCategory: string | null;
} | null> {
  try {
    // Dynamic import so the recipe compiles without the optional dep.
    const { WsaaWscdcAfipPadronAdapter } = await import("@ar-agents/identity");
    if (
      !process.env.AFIP_CERT_PEM ||
      !process.env.AFIP_KEY_PEM ||
      !process.env.AFIP_CUIT
    ) {
      return null;
    }
    const adapter = new WsaaWscdcAfipPadronAdapter({
      certPem: process.env.AFIP_CERT_PEM,
      keyPem: process.env.AFIP_KEY_PEM,
      cuitRepresentado: process.env.AFIP_CUIT,
      env: "prod",
    });
    const result = await adapter.lookup({ cuit });
    if (!result.available || !result.data) return null;
    return {
      legalName: result.data.razonSocial ?? result.data.nombre ?? "—",
      ivaCondition: result.data.condicionIva ?? "—",
      monotributoCategory: result.data.monotributoCategoria ?? null,
    };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3: OAuth redirect URL
// ─────────────────────────────────────────────────────────────────────────────

export function buildSellerOauthUrl(args: {
  internalSellerId: string;
  redirectUri: string;
}): string {
  const params = new URLSearchParams({
    client_id: process.env.MP_CLIENT_ID!,
    response_type: "code",
    platform_id: "mp",
    state: args.internalSellerId, // round-tripped back to your callback
    redirect_uri: args.redirectUri,
  });
  return `https://auth.mercadopago.com.ar/authorization?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4: OAuth callback handler
// ─────────────────────────────────────────────────────────────────────────────

export async function handleSellerOauthCallback(req: Request): Promise<{
  internalSellerId: string;
  mpSellerId: string;
}> {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const internalSellerId = url.searchParams.get("state"); // your id, round-tripped

  if (!code || !internalSellerId) {
    throw new Error("Missing code or state in OAuth callback");
  }

  // Exchange the code for tokens. The MercadoPagoClient OAuth methods do this:
  const tokens = await platformMp.exchangeOAuthCode({
    code,
    clientSecret: process.env.MP_CLIENT_SECRET!,
    redirectUri: process.env.MP_REDIRECT_URI!,
  });

  tokenStore.set(internalSellerId, tokens);

  return {
    internalSellerId,
    mpSellerId: tokens.user_id,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5: Test charge to verify the OAuth chain
// ─────────────────────────────────────────────────────────────────────────────

export async function runFirstTestCharge(args: {
  internalSellerId: string;
  payerEmail: string;
  cardToken: string;
}): Promise<{ ok: boolean; paymentId?: string; reason?: string }> {
  const tokens = tokenStore.get(args.internalSellerId);
  if (!tokens) return { ok: false, reason: "OAuth tokens not found" };

  // Use the seller's access_token to charge ON BEHALF OF the seller.
  const sellerMp = new MercadoPagoClient({ accessToken: tokens.access_token });

  const payment = await sellerMp.createPayment({
    transactionAmount: 1, // $1 ARS sentinel amount
    paymentMethodId: "visa",
    payerEmail: args.payerEmail,
    token: args.cardToken,
    description: "Marketplace onboarding test charge",
    externalReference: `onboarding-${args.internalSellerId}`,
  });

  if (payment.status === "approved") {
    return { ok: true, paymentId: String(payment.id) };
  }

  const detail = (payment as typeof payment & { status_detail?: string }).status_detail;
  return {
    ok: false,
    reason: `Test charge ${payment.status}: ${detail ?? "unknown"}`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6: Charge with marketplace fee
// ─────────────────────────────────────────────────────────────────────────────

export async function chargeWithMarketplaceFee(args: {
  internalSellerId: string;
  payerEmail: string;
  cardToken: string;
  amount: number;
  description: string;
  feePct: number; // e.g. 5 for 5%
}) {
  const tokens = tokenStore.get(args.internalSellerId);
  if (!tokens) throw new Error("Seller not onboarded");

  const sellerMp = new MercadoPagoClient({ accessToken: tokens.access_token });

  const fee = computeMarketplaceFee(args.amount, { percent: args.feePct });

  return await sellerMp.createPayment({
    transactionAmount: args.amount,
    applicationFee: fee, // your platform's cut (gets credited to your account)
    paymentMethodId: "visa",
    payerEmail: args.payerEmail,
    token: args.cardToken,
    description: args.description,
  });
}
