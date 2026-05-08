// Promotions — `/seller-promotions/promotions`,
// `/seller-promotions/candidates`,
// `/seller-promotions/items/{id}` (opt-in).
//
// One of MELI's biggest blindspots: ML invites items into promotions via
// `/candidates`, but the surface is buried in seller hub. Auto-opt-in
// based on margin guards is dollar-printing.

import type { MeliClient } from "./client";
import {
  PromotionCandidate,
  PromotionOptInRequest,
  PromotionOptInResponse,
  type PromotionCandidate as TPromotionCandidate,
  type PromotionOptInRequest as TPromotionOptInRequest,
  type PromotionOptInResponse as TPromotionOptInResponse,
} from "./schemas/promotion";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Candidates list
// ---------------------------------------------------------------------------

const PromotionCandidatesResponse = z.object({
  results: z.array(PromotionCandidate),
  paging: z
    .object({
      total: z.number().int().nonnegative(),
      offset: z.number().int().nonnegative().optional(),
      limit: z.number().int().positive().optional(),
    })
    .optional(),
});
export type PromotionCandidatesResponse = z.infer<typeof PromotionCandidatesResponse>;

export interface ListPromotionCandidatesOptions {
  promotionType?:
    | "DEAL"
    | "DOD"
    | "LIGHTNING"
    | "SMART"
    | "PRICE_DISCOUNT"
    | "SELLER_COUPON_CAMPAIGN"
    | "MARKETPLACE_CAMPAIGN";
  limit?: number;
  offset?: number;
}

export async function listPromotionCandidates(
  client: MeliClient,
  sellerId: number,
  options: ListPromotionCandidatesOptions = {},
): Promise<PromotionCandidatesResponse> {
  const query: Record<string, string | number> = { app_version: "v2" };
  if (options.promotionType) query["promotion_type"] = options.promotionType;
  if (options.limit) query["limit"] = options.limit;
  if (options.offset) query["offset"] = options.offset;
  return client.fetch<PromotionCandidatesResponse>({
    method: "GET",
    path: `/seller-promotions/users/${sellerId}/candidates`,
    query,
    responseSchema: PromotionCandidatesResponse,
  });
}

// ---------------------------------------------------------------------------
// Active promotions list
// ---------------------------------------------------------------------------

const ActivePromotionsResponse = z.object({
  results: z.array(PromotionCandidate),
  paging: z
    .object({
      total: z.number().int().nonnegative(),
    })
    .optional(),
});
export async function listActivePromotions(
  client: MeliClient,
  sellerId: number,
): Promise<TPromotionCandidate[]> {
  const r = await client.fetch<z.infer<typeof ActivePromotionsResponse>>({
    method: "GET",
    path: `/seller-promotions/users/${sellerId}/promotions`,
    responseSchema: ActivePromotionsResponse,
  });
  return r.results;
}

// ---------------------------------------------------------------------------
// Opt-in for an item
// ---------------------------------------------------------------------------

export async function optInPromotion(
  client: MeliClient,
  itemId: string,
  payload: TPromotionOptInRequest,
): Promise<TPromotionOptInResponse> {
  const validated = PromotionOptInRequest.parse(payload);
  return client.fetch<TPromotionOptInResponse>({
    method: "POST",
    path: `/seller-promotions/items/${itemId}`,
    body: validated,
    responseSchema: PromotionOptInResponse,
  });
}

// ---------------------------------------------------------------------------
// Margin-aware auto-opt-in
// ---------------------------------------------------------------------------

export interface MarginGuard {
  /** Item id → minimum margin we accept (decimal, e.g. 0.15 for 15%). */
  minimumMarginByItem?: Record<string, number>;
  /** Default minimum margin when item-specific isn't set. Default 0.15. */
  defaultMinimumMargin?: number;
  /** Item id → COGS in major units (used to compute margin from candidate's
   *  suggested_price). When absent, the candidate is SKIPPED (we'd rather
   *  miss revenue than auto-opt-in below cost). */
  cogsByItem: Record<string, number>;
}

export interface AutoOptInResult {
  optedIn: TPromotionOptInResponse[];
  skipped: Array<{
    itemId: string;
    promotionId: string;
    reason: "no_cogs" | "below_margin" | "no_suggested_price";
    detail: string;
  }>;
}

/**
 * Iterate candidates and opt-in to those that respect the configured
 * margin guard. Returns both opted-in items and skipped ones (with reason
 * codes for telemetry).
 */
export async function autoOptInPromotions(
  client: MeliClient,
  sellerId: number,
  guard: MarginGuard,
  options: ListPromotionCandidatesOptions = {},
): Promise<AutoOptInResult> {
  const result: AutoOptInResult = { optedIn: [], skipped: [] };
  const candidates = await listPromotionCandidates(client, sellerId, options);
  const minDefault = guard.defaultMinimumMargin ?? 0.15;

  for (const cand of candidates.results) {
    if (!cand.items) continue;
    for (const item of cand.items) {
      const cogs = guard.cogsByItem[item.id];
      if (cogs === undefined) {
        result.skipped.push({
          itemId: item.id,
          promotionId: cand.promotion_id,
          reason: "no_cogs",
          detail:
            "No COGS configured for this item; refusing to auto-opt-in without a margin floor.",
        });
        continue;
      }
      const suggested = item.suggested_price ?? item.original_price;
      if (!suggested) {
        result.skipped.push({
          itemId: item.id,
          promotionId: cand.promotion_id,
          reason: "no_suggested_price",
          detail: "Candidate has no suggested_price/original_price.",
        });
        continue;
      }
      const margin = (suggested - cogs) / suggested;
      const minMargin = guard.minimumMarginByItem?.[item.id] ?? minDefault;
      if (margin < minMargin) {
        result.skipped.push({
          itemId: item.id,
          promotionId: cand.promotion_id,
          reason: "below_margin",
          detail: `Margin at suggested_price (${(margin * 100).toFixed(1)}%) below floor ${(minMargin * 100).toFixed(1)}%.`,
        });
        continue;
      }
      const optInResult = await optInPromotion(client, item.id, {
        promotion_id: cand.promotion_id,
        promotion_type: cand.promotion_type,
        deal_price: suggested,
      });
      result.optedIn.push(optInResult);
    }
  }
  return result;
}
