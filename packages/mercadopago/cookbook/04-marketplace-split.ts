/**
 * Recipe 04 — Marketplace platform with seller OAuth + split payments.
 *
 * # The Rappi/Tienda Nube pattern
 *
 * Your platform aggregates sellers. Each seller has their own MP account.
 * Buyers pay through your platform; you take a marketplace fee; the rest
 * goes to the seller's MP account.
 *
 * # Flow
 *
 * **One-time per seller**:
 * 1. Seller clicks "Conectar Mercado Pago" on your dashboard
 * 2. Your server redirects them to MP's OAuth authorize URL
 *    (`oauth_authorize_url` tool)
 * 3. Seller approves; MP redirects back with `?code=...&state=...`
 * 4. Your server exchanges code → token bundle (`oauth_exchange_code`)
 * 5. You PERSIST the bundle keyed by `token.user_id` (use OAuthTokenStore)
 *
 * **Per transaction**:
 * 1. Buyer completes purchase on your platform
 * 2. Your server fetches the seller's persisted token
 * 3. (If expired) refresh via `oauth_refresh_token`
 * 4. Instantiate `new MercadoPagoClient({ accessToken })` AS THE SELLER
 * 5. Create a Preference / Order with `marketplace_fee` + `collector_id`
 * 6. Funds route to the seller; fee splits off to your account
 *
 * # Key insight
 *
 * `marketplace_fee` is in ARS, NOT a percentage. Compute it from your
 * commission rate using `compute_marketplace_fee` (PURE helper, no network).
 */

import {
  buildAuthorizeUrl,
  computeMarketplaceFee,
  exchangeCodeForToken,
  expirationTimeMs,
  InMemoryOAuthTokenStore,
  isExpiringSoon,
  MercadoPagoClient,
  refreshAccessToken,
} from "@ar-agents/mercadopago";

// In production: VercelKVOAuthTokenStore
const oauthStore = new InMemoryOAuthTokenStore();

const CLIENT_ID = process.env.MP_CLIENT_ID!;
const CLIENT_SECRET = process.env.MP_CLIENT_SECRET!;
const REDIRECT_URI = "https://yourapp.com/api/mp/oauth/callback";
const MARKETPLACE_NAME = "MyMarketplace";

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Send seller to MP for authorization
// ─────────────────────────────────────────────────────────────────────────────

export async function startSellerOAuthFlow(input: { sellerSessionId: string }) {
  // `state` should be bound to the seller's session and verified on callback
  // (CSRF protection). Use a secure random token + persist against the session.
  const state = `${input.sellerSessionId}:${crypto.randomUUID()}`;
  // ... persist state → sellerSessionId mapping in your DB ...
  return buildAuthorizeUrl({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    state,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Handle the OAuth callback
// ─────────────────────────────────────────────────────────────────────────────

export async function handleOAuthCallback(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    return new Response("missing code/state", { status: 400 });
  }
  // ... verify state matches the seller's session in your DB ...

  const token = await exchangeCodeForToken({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    code,
    redirectUri: REDIRECT_URI,
  });

  // PERSIST the bundle. The user_id identifies which seller this is.
  await oauthStore.set(token.user_id, {
    user_id: token.user_id,
    access_token: token.access_token,
    refresh_token: token.refresh_token!,
    expires_at: expirationTimeMs(Date.now(), token.expires_in),
  });

  return Response.json({ ok: true, sellerId: token.user_id });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Per-transaction: get a per-seller MP client
// ─────────────────────────────────────────────────────────────────────────────

async function getSellerMpClient(sellerUserId: string): Promise<MercadoPagoClient> {
  let token = await oauthStore.get(sellerUserId);
  if (!token) {
    throw new Error(`Seller ${sellerUserId} hasn't connected MP yet.`);
  }

  // Proactive refresh: if within 5 min of expiration, refresh ahead of time.
  if (isExpiringSoon(token.expires_at)) {
    const fresh = await refreshAccessToken({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: token.refresh_token,
    });
    token = {
      user_id: fresh.user_id,
      access_token: fresh.access_token,
      refresh_token: fresh.refresh_token!,
      expires_at: expirationTimeMs(Date.now(), fresh.expires_in),
    };
    await oauthStore.set(token.user_id, token);
  }

  return new MercadoPagoClient({ accessToken: token.access_token });
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Create a marketplace preference with fee split
// ─────────────────────────────────────────────────────────────────────────────

export async function createMarketplacePreference(input: {
  sellerUserId: string; // from oauth_exchange_code earlier
  buyerEmail: string;
  productTitle: string;
  productPriceArs: number;
  externalReference: string;
}) {
  // Compute the exact fee to charge (5% with $50 floor and $5000 ceiling)
  const marketplaceFee = computeMarketplaceFee(input.productPriceArs, {
    percent: 5,
    minArs: 50,
    maxArs: 5000,
  });

  const sellerClient = await getSellerMpClient(input.sellerUserId);

  const preference = await sellerClient.createPreference({
    items: [
      {
        title: input.productTitle,
        quantity: 1,
        unit_price: input.productPriceArs,
        currency_id: "ARS",
      },
    ],
    payer: { email: input.buyerEmail },
    backUrls: {
      success: "https://yourapp.com/payment-success",
      failure: "https://yourapp.com/payment-failure",
    },
    autoReturn: "approved",
    externalReference: input.externalReference,
    notificationUrl: "https://yourapp.com/api/mp/webhook",

    // The marketplace fields — these split the funds:
    marketplace: MARKETPLACE_NAME,
    marketplaceFee, // in ARS, NOT %
    collectorId: input.sellerUserId, // funds route here; fee splits off to your platform
  });

  return {
    preferenceId: preference.id,
    initPoint: preference.init_point,
    sellerReceives: input.productPriceArs - marketplaceFee,
    platformFee: marketplaceFee,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Reconciliation: query merchant_orders to verify split
// ─────────────────────────────────────────────────────────────────────────────

export async function reconcileMarketplaceSale(input: {
  sellerUserId: string;
  preferenceId: string;
}) {
  const sellerClient = await getSellerMpClient(input.sellerUserId);
  const result = await sellerClient.searchMerchantOrders({
    preferenceId: input.preferenceId,
  });
  return result.elements;
}
