// Vercel AI SDK 6 tools wrapper for `@ar-agents/mercadolibre`.
//
// Drop the result of `meliTools(client, options)` directly into an
// `Experimental_Agent`'s `tools` field. Each tool is a `tool({...})` from
// the `ai` package, with discriminated success/failure return shapes.
//
// Usage:
//
//   import { Experimental_Agent as Agent, stepCountIs } from "ai";
//   import { MeliClient, meliTools } from "@ar-agents/mercadolibre";
//
//   const client = new MeliClient({ auth: { kind: "oauth", userId, app, store } });
//   const agent = new Agent({
//     model: "anthropic/claude-sonnet-4-6",
//     tools: meliTools(client, { siteId: "MLA", sellerId }),
//     stopWhen: stepCountIs(8),
//   });

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { MeliClient } from "./client";
import {
  classifyHitlSeverity,
  gateHitl,
  HitlRejectedError,
  type HitlConfig,
  type HitlContext,
  type HitlOpKind,
} from "./hitl";
import * as items from "./items";
import * as categories from "./categories";
import * as questions from "./questions";
import * as orders from "./orders";
import * as claims from "./claims";
import * as shipments from "./shipments";
import * as reputation from "./reputation";
import * as promotions from "./promotions";
import { isMeliError } from "./errors";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export type MeliToolName =
  | "list_my_items"
  | "get_item"
  | "create_item"
  | "update_item_price_or_stock"
  | "categorize_listing_and_plan_attributes"
  | "list_unanswered_questions"
  | "answer_question"
  | "classify_question_spam"
  | "list_recent_orders"
  | "get_order"
  | "list_open_claims"
  | "defend_claim"
  | "get_seller_reputation"
  | "list_promotion_candidates";

export interface MeliToolsOptions {
  /** MELI site id this seller operates on (MLA / MLB / MLM / etc.). */
  siteId: "MLA" | "MLB" | "MLM" | "MLC" | "MCO" | "MLU" | "MPE";
  /** MELI seller id (numeric). Required for any seller-side query. */
  sellerId: number;
  /** Override agent-facing descriptions. */
  descriptions?: Partial<Record<MeliToolName, string>>;
  /** Human-in-the-loop gate for irreversible operations
   *  (`create_item`, `update_item_price_or_stock`, `answer_question`,
   *  `defend_claim`). Without this, the LLM can execute every tool
   *  freely. With it, the destructive tools wait for the host's
   *  `requireConfirmation` callback before firing the HTTP request. */
  hitl?: HitlConfig;
}

// ---------------------------------------------------------------------------
// Default descriptions, written for LLM consumption
// ---------------------------------------------------------------------------

const DEFAULT_DESCRIPTIONS: Record<MeliToolName, string> = {
  list_my_items:
    "List the seller's own Mercado Libre listings (mis publicaciones de Mercado Libre). USE THIS WHEN: the agent needs to inventory the seller's catalog or filter by status. Pagination via `scroll_id` is automatic; pass `cursor` if you got one back. Returns `{ ok: true, item_ids, scroll_id?, total }`.",
  get_item:
    "Fetch a Mercado Libre listing by id (consultar una publicación; e.g. `MLA1234567890`). USE THIS WHEN: you need the listing's title, price, status, attributes, or pictures. Public endpoint, no seller scope needed. Returns `{ ok: true, item }`.",
  create_item:
    "Publish a new Mercado Libre listing (publicar un producto en Mercado Libre). USE THIS WHEN the seller has decided to publish. Requires title + category_id + price + currency_id + available_quantity + at least one picture. Pair with `categorize_listing_and_plan_attributes` first to fill required attributes. Returns `{ ok: true, item }`.",
  update_item_price_or_stock:
    "Update price or stock on a Mercado Libre listing (cambiar precio, actualizar stock). USE THIS WHEN: a stock change or repricing decision has been made. Pass `id` plus any of `price` / `available_quantity` / `status`. Returns `{ ok: true, item }`.",
  categorize_listing_and_plan_attributes:
    "Predict the Mercado Libre category for a listing (predecir categoría) AND fetch its required attributes. USE THIS BEFORE `create_item`: it returns the canonical category_id, the domain_id, and the list of MAIN attributes the seller MUST fill before publishing (so a downstream agent can either auto-fill or ask the user). Returns `{ ok: true, prediction, requiredAttributeIds, technicalSpecs }`.",
  list_unanswered_questions:
    "List unanswered Mercado Libre questions (preguntas sin responder) on this seller's items. USE THIS WHEN: the agent is doing a triage pass. Returns `{ ok: true, questions, total }`. Combine with `classify_question_spam` to filter spam before drafting answers.",
  answer_question:
    "Answer a Mercado Libre pre-sale question (responder una pregunta). USE THIS WHEN: the question is real (not spam) and the agent has drafted a response in the seller's voice. Max 2000 chars. Returns `{ ok: true, answer }`.",
  classify_question_spam:
    "Classify a pre-sale question as spam / borderline / ham (detectar spam en preguntas) using a transparent heuristic. USE THIS BEFORE answering at scale to avoid wasting response time on spam waves. Returns `{ ok: true, label, score, features }`.",
  list_recent_orders:
    "List the seller's recent Mercado Libre orders (ventas recientes, listar órdenes). USE THIS WHEN: doing a fulfillment audit, billing reconciliation, or building a daily summary. Returns `{ ok: true, orders, total }`.",
  get_order:
    "Fetch a Mercado Libre order by id (consultar una venta), including buyer, payments, shipping, items. USE THIS WHEN: investigating a specific order. Returns `{ ok: true, order }`.",
  list_open_claims:
    "List open Mercado Libre claims (listar reclamos abiertos) at the requested mediation stage. USE THIS WHEN: the agent is running a defense pass. Returns `{ ok: true, claims, total }`. Pair with `defend_claim` to upload evidence.",
  defend_claim:
    "Defend a Mercado Libre claim (defender un reclamo) via the 2-day-SLA flow: upload all evidences in one call (one-shot per spec) and optionally post a closing message. USE THIS WHEN: a claim needs response within the SLA window and the agent has gathered evidence (proof of shipment, invoice, video, etc.). Returns `{ ok: true, claim, uploadedEvidences, messagePosted }`.",
  get_seller_reputation:
    "Fetch the seller's Mercado Libre reputation (reputación del vendedor), thermometer color, claim/handling/cancel rates, transactions, status. USE THIS WHEN: dashboarding or before a big-volume action like batch repricing. Returns `{ ok: true, reputation, alerts }`, alerts are pre-evaluated against thermometer thresholds.",
  list_promotion_candidates:
    "List available Mercado Libre promotions (promociones disponibles) the seller has been invited to but hasn't opted into yet. USE THIS WHEN: the seller wants to find money-printing opportunities. Returns `{ ok: true, candidates }`. Use `autoOptInPromotions` (programmatic) for bulk opt-in with margin guards.",
};

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

export function meliTools(
  client: MeliClient,
  options: MeliToolsOptions,
): ToolSet {
  const desc = (n: MeliToolName) =>
    options.descriptions?.[n] ?? DEFAULT_DESCRIPTIONS[n];

  return {
    list_my_items: tool({
      description: desc("list_my_items"),
      inputSchema: z.object({
        status: z.enum(["active", "paused", "closed", "all"]).optional(),
        cursor: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: wrap(async (input) => {
        const opts: items.SearchSellerItemsOptions = {};
        if (input.status !== undefined) opts.status = input.status;
        if (input.cursor !== undefined) opts.scrollId = input.cursor;
        if (input.limit !== undefined) opts.limit = input.limit;
        const r = await items.searchSellerItems(client, options.sellerId, opts);
        return {
          item_ids: r.results,
          total: r.paging.total,
          ...(r.scroll_id !== undefined ? { scroll_id: r.scroll_id } : {}),
        };
      }),
    }),

    get_item: tool({
      description: desc("get_item"),
      inputSchema: z.object({ id: z.string() }),
      execute: wrap(async ({ id }) => ({ item: await items.getItem(client, id) })),
    }),

    create_item: tool({
      description: desc("create_item"),
      inputSchema: z.object({
        title: z.string().min(1),
        category_id: z.string(),
        price: z.number().nonnegative(),
        currency_id: z.string(),
        available_quantity: z.number().int().nonnegative(),
        condition: z.enum(["new", "used", "not_specified"]).optional(),
        description: z.string().optional(),
        pictures: z.array(z.string().url()).min(1).optional(),
        attributes: z
          .array(z.object({ id: z.string(), value_name: z.string() }))
          .optional(),
        listing_type_id: z
          .enum(["free", "bronze", "silver", "gold", "gold_special", "gold_pro"])
          .optional(),
      }),
      execute: hitlWrap(
        options.hitl,
        (input) => ({
          kind: "create_item",
          resourceId: input.title.slice(0, 80),
          summary: `Publicar listing nuevo: "${input.title}" a ${input.currency_id} ${input.price} (${input.available_quantity} disponibles).`,
          input,
        }),
        async (input) => {
          const payload: Parameters<typeof items.createItem>[1] = {
            title: input.title,
            category_id: input.category_id,
            price: input.price,
            currency_id: input.currency_id as never,
            available_quantity: input.available_quantity,
            buying_mode: "buy_it_now",
            condition: input.condition ?? "new",
            listing_type_id: input.listing_type_id ?? "gold_special",
          };
          if (input.description) payload.description = { plain_text: input.description };
          if (input.pictures) {
            payload.pictures = input.pictures.map((source: string) => ({ source }));
          }
          if (input.attributes) {
            payload.attributes = input.attributes.map(
              (a: { id: string; value_name: string }) => ({
                id: a.id,
                value_name: a.value_name,
              }),
            );
          }
          return { item: await items.createItem(client, payload) };
        },
      ),
    }),

    update_item_price_or_stock: tool({
      description: desc("update_item_price_or_stock"),
      inputSchema: z.object({
        id: z.string(),
        price: z.number().nonnegative().optional(),
        available_quantity: z.number().int().nonnegative().optional(),
        status: z.enum(["active", "paused", "closed"]).optional(),
      }),
      execute: hitlWrap(
        options.hitl,
        (input) => {
          const parts: string[] = [];
          if (input.price !== undefined) parts.push(`precio → ${input.price}`);
          if (input.available_quantity !== undefined)
            parts.push(`stock → ${input.available_quantity}`);
          if (input.status !== undefined) parts.push(`estado → ${input.status}`);
          return {
            kind: input.status === "paused" || input.status === "closed"
              ? (input.status === "paused" ? "pause_item" : "close_item")
              : "update_item_price_or_stock",
            resourceId: input.id,
            summary: `Modificar item ${input.id}: ${parts.join(", ")}.`,
            input,
          };
        },
        async ({ id, price, available_quantity, status }) => {
          const payload: Parameters<typeof items.updateItem>[2] = {};
          if (price !== undefined) payload.price = price;
          if (available_quantity !== undefined) payload.available_quantity = available_quantity;
          if (status !== undefined) payload.status = status;
          return { item: await items.updateItem(client, id, payload) };
        },
      ),
    }),

    categorize_listing_and_plan_attributes: tool({
      description: desc("categorize_listing_and_plan_attributes"),
      inputSchema: z.object({
        title: z.string().min(1),
        price: z.number().nonnegative().optional(),
        condition: z.enum(["new", "used"]).optional(),
      }),
      execute: wrap(async (input) => {
        return categories.categorizeAndPlan(client, options.siteId, input);
      }),
    }),

    list_unanswered_questions: tool({
      description: desc("list_unanswered_questions"),
      inputSchema: z.object({
        item_id: z.string().optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: wrap(async (input) => {
        const opts: questions.ListQuestionsOptions = { status: "UNANSWERED" };
        if (input.item_id !== undefined) opts.itemId = input.item_id;
        if (input.limit !== undefined) opts.limit = input.limit;
        const r = await questions.listQuestions(client, options.sellerId, opts);
        return { questions: r.questions, total: r.total };
      }),
    }),

    answer_question: tool({
      description: desc("answer_question"),
      inputSchema: z.object({
        question_id: z.number().int(),
        text: z.string().min(1).max(2000),
      }),
      execute: hitlWrap(
        options.hitl,
        (input) => ({
          kind: "answer_question",
          resourceId: input.question_id,
          summary: `Responder pregunta ${input.question_id} con: "${input.text.slice(0, 140)}${input.text.length > 140 ? "…" : ""}".`,
          input,
        }),
        async (input) => {
          const r = await questions.answerQuestion(client, input);
          return { answer: r };
        },
      ),
    }),

    classify_question_spam: tool({
      description: desc("classify_question_spam"),
      inputSchema: z.object({
        question_text: z.string().min(1),
        asker_account_age_days: z.number().nonnegative().optional(),
        asker_answered_questions: z.number().int().nonnegative().optional(),
        recent_questions_by_this_asker: z.array(z.string()).optional(),
      }),
      execute: wrap(async (input) => {
        // Synthesize a Question-shaped object for the classifier.
        const question = {
          id: 0,
          date_created: new Date().toISOString(),
          item_id: "MLA0",
          seller_id: options.sellerId,
          status: "UNANSWERED" as const,
          text: input.question_text,
        };
        const askerProfile: NonNullable<questions.ClassifySpamInput["askerProfile"]> = {};
        if (input.asker_account_age_days !== undefined) {
          askerProfile.account_age_days = input.asker_account_age_days;
        }
        if (input.asker_answered_questions !== undefined) {
          askerProfile.answered_questions = input.asker_answered_questions;
        }
        const cs: questions.ClassifySpamInput = { question };
        if (Object.keys(askerProfile).length > 0) cs.askerProfile = askerProfile;
        if (input.recent_questions_by_this_asker !== undefined) {
          cs.recentQuestionsByThisAsker = input.recent_questions_by_this_asker;
        }
        return questions.classifySpam(cs);
      }),
    }),

    list_recent_orders: tool({
      description: desc("list_recent_orders"),
      inputSchema: z.object({
        status: z.enum(["paid", "confirmed", "cancelled"]).optional(),
        date_from: z.string().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: wrap(async (input) => {
        const opts: orders.SearchOrdersOptions = {};
        if (input.status !== undefined) opts.status = input.status;
        if (input.date_from !== undefined) opts.dateCreatedFrom = input.date_from;
        if (input.limit !== undefined) opts.limit = input.limit;
        const r = await orders.searchOrders(client, options.sellerId, opts);
        return { orders: r.results, total: r.paging.total };
      }),
    }),

    get_order: tool({
      description: desc("get_order"),
      inputSchema: z.object({ order_id: z.number().int() }),
      execute: wrap(async ({ order_id }) => ({
        order: await orders.getOrder(client, order_id),
      })),
    }),

    list_open_claims: tool({
      description: desc("list_open_claims"),
      inputSchema: z.object({
        stage: z.enum(["claim", "dispute", "mediation"]).optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: wrap(async (input) => {
        const opts: claims.SearchClaimsOptions = { status: "opened" };
        if (input.stage !== undefined) opts.stage = input.stage;
        if (input.limit !== undefined) opts.limit = input.limit;
        const r = await claims.searchClaims(client, opts);
        return { claims: r.data, total: r.paging.total };
      }),
    }),

    defend_claim: tool({
      description: desc("defend_claim"),
      inputSchema: z.object({
        claim_id: z.number().int(),
        evidences: z
          .array(
            z.object({
              evidence_type: z.enum([
                "PROOF_OF_SHIPMENT",
                "ITEM_DESCRIPTION_VS_RECEIVED",
                "VIDEO_OF_PRODUCT",
                "INVOICE",
                "MESSAGE_THREAD",
                "DELIVERY_PROOF",
                "RETURN_PROOF",
                "OTHER",
              ]),
              text: z.string().optional(),
              attachment_id: z.string().optional(),
            }),
          )
          .min(1),
        message: z.string().optional(),
      }),
      execute: hitlWrap(
        options.hitl,
        (input) => ({
          kind: "defend_claim",
          resourceId: input.claim_id,
          summary: `Defender claim ${input.claim_id} con ${input.evidences.length} evidencia(s)${input.message ? " + mensaje" : ""}.`,
          input,
        }),
        async (input) => {
          const defendInput: claims.DefendClaimInput = {
            claimId: input.claim_id,
            evidences: input.evidences,
          };
          if (input.message !== undefined) defendInput.message = input.message;
          return claims.defendClaim(client, defendInput);
        },
      ),
    }),

    get_seller_reputation: tool({
      description: desc("get_seller_reputation"),
      inputSchema: z.object({}).optional(),
      execute: wrap(async () => {
        const snapshot = await reputation.getSellerReputation(client, options.sellerId);
        const alerts = reputation.evaluateReputationAlerts(snapshot);
        return { reputation: snapshot, alerts };
      }),
    }),

    list_promotion_candidates: tool({
      description: desc("list_promotion_candidates"),
      inputSchema: z.object({
        promotion_type: z
          .enum([
            "DEAL",
            "DOD",
            "LIGHTNING",
            "SMART",
            "PRICE_DISCOUNT",
            "SELLER_COUPON_CAMPAIGN",
            "MARKETPLACE_CAMPAIGN",
          ])
          .optional(),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: wrap(async (input) => {
        const opts: promotions.ListPromotionCandidatesOptions = {};
        if (input.promotion_type !== undefined) opts.promotionType = input.promotion_type;
        if (input.limit !== undefined) opts.limit = input.limit;
        const r = await promotions.listPromotionCandidates(client, options.sellerId, opts);
        return { candidates: r.results };
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function wrap<I, O>(fn: (input: I) => Promise<O>) {
  return async (input: I) => {
    try {
      const result = await fn(input);
      return { ok: true as const, ...(result as object) };
    } catch (err) {
      if (err instanceof HitlRejectedError) {
        return {
          ok: false as const,
          code: err.code,
          message: err.message,
          ...(err.reason !== undefined ? { reason: err.reason } : {}),
        };
      }
      if (isMeliError(err)) {
        return {
          ok: false as const,
          code: err.code,
          message: err.message,
        };
      }
      return {
        ok: false as const,
        code: "unknown_error",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  };
}

/**
 * Higher-order wrapper for irreversible tools. Builds the HITL context,
 * runs the gate, applies any host-supplied input overrides, then calls
 * the underlying executor.
 */
function hitlWrap<I extends Record<string, unknown>, O>(
  hitl: HitlConfig | undefined,
  buildContext: (input: I) => Omit<HitlContext, "severity"> & { kind: HitlOpKind },
  fn: (input: I) => Promise<O>,
) {
  return wrap(async (input: I) => {
    const partial = buildContext(input);
    const ctx: HitlContext = {
      ...partial,
      severity: classifyHitlSeverity(partial.kind),
    };
    const decision = await gateHitl(hitl, ctx);
    const finalInput = decision.overrides
      ? ({ ...input, ...decision.overrides } as I)
      : input;
    return fn(finalInput);
  });
}

// Re-export shipments helpers for tools that call them via the public lib.
export { shipments };
