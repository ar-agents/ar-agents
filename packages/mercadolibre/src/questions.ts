// Questions API — `/questions/search`, `/questions/{id}`, `/answers`,
// `/users/{id}/questions_blacklist`.
//
// Includes a heuristic spam classifier suitable for a first-pass filter
// before an LLM-based responder takes over.

import type { MeliClient } from "./client";
import {
  AnswerRequest,
  Question,
  QuestionSpamFeatures,
  QuestionsSearchResponse,
  type Answer,
  type AnswerRequest as TAnswerRequest,
  type Question as TQuestion,
  type QuestionSpamFeatures as TQuestionSpamFeatures,
  type QuestionsSearchResponse as TQuestionsSearchResponse,
} from "./schemas/question";
import { z } from "zod";

// ---------------------------------------------------------------------------
// List questions — `/questions/search?seller_id=...&status=...`
// ---------------------------------------------------------------------------

export interface ListQuestionsOptions {
  status?: "ANSWERED" | "UNANSWERED" | "CLOSED_UNANSWERED";
  itemId?: string;
  /** Default 50. Max 100 per the docs. */
  limit?: number;
  offset?: number;
  /** Sort, default `date_created.desc`. */
  sort?: "date_created.desc" | "date_created.asc";
}

export async function listQuestions(
  client: MeliClient,
  sellerId: number,
  options: ListQuestionsOptions = {},
): Promise<TQuestionsSearchResponse> {
  const query: Record<string, string | number> = {
    seller_id: sellerId,
    api_version: 4,
  };
  if (options.status) query["status"] = options.status;
  if (options.itemId) query["item"] = options.itemId;
  if (options.limit) query["limit"] = options.limit;
  if (options.offset) query["offset"] = options.offset;
  if (options.sort) query["sort"] = options.sort;
  return client.fetch<TQuestionsSearchResponse>({
    method: "GET",
    path: `/questions/search`,
    query,
    responseSchema: QuestionsSearchResponse,
  });
}

export async function getQuestion(
  client: MeliClient,
  questionId: number,
): Promise<TQuestion> {
  return client.fetch<TQuestion>({
    method: "GET",
    path: `/questions/${questionId}`,
    responseSchema: Question,
  });
}

// ---------------------------------------------------------------------------
// Answer — `POST /answers`
// ---------------------------------------------------------------------------

const AnswerResponse = z.object({
  id: z.number().int(),
  text: z.string(),
  status: z.string().optional(),
  date_created: z.string().optional(),
});

export async function answerQuestion(
  client: MeliClient,
  request: TAnswerRequest,
): Promise<z.infer<typeof AnswerResponse>> {
  const validated = AnswerRequest.parse(request);
  return client.fetch({
    method: "POST",
    path: `/answers`,
    body: validated,
    responseSchema: AnswerResponse,
  });
}

// ---------------------------------------------------------------------------
// Block (blacklist) a buyer
// ---------------------------------------------------------------------------

export async function blacklistAsker(
  client: MeliClient,
  sellerId: number,
  askerUserId: number,
): Promise<void> {
  await client.fetch({
    method: "POST",
    path: `/users/${sellerId}/questions_blacklist`,
    body: { user_id: askerUserId },
  });
}

export async function unblockAsker(
  client: MeliClient,
  sellerId: number,
  askerUserId: number,
): Promise<void> {
  await client.fetch({
    method: "DELETE",
    path: `/users/${sellerId}/questions_blacklist/${askerUserId}`,
  });
}

// ---------------------------------------------------------------------------
// Heuristic spam classifier — feature extractor + score function.
//
// The score is a non-LLM first-pass filter. For high-stakes auto-respond,
// pair this with an LLM that re-classifies anything in the "borderline"
// zone (score 0.3..0.7).
// ---------------------------------------------------------------------------

export interface ClassifySpamInput {
  question: TQuestion;
  /** Fetched separately when needed (asker history). */
  askerProfile?: {
    answered_questions?: number;
    account_age_days?: number;
  };
  /** Set of question texts (or hashes) seen across this seller's catalog. */
  recentQuestionsByThisAsker?: string[];
}

const URL_RE = /\bhttps?:\/\/\S+|www\.\S+/i;
const PHONE_RE = /(\+?\d[\d\s\-().]{6,})/;
const EMAIL_RE = /[^\s]+@[^\s]+\.[^\s]+/i;

export function extractSpamFeatures(input: ClassifySpamInput): TQuestionSpamFeatures {
  const text = input.question.text;
  const containsExternal =
    URL_RE.test(text) || PHONE_RE.test(text) || EMAIL_RE.test(text);
  const repetitions = (input.recentQuestionsByThisAsker ?? []).filter(
    (t) => t === text,
  ).length;
  return QuestionSpamFeatures.parse({
    asker_account_age_days: input.askerProfile?.account_age_days,
    asker_answered_questions: input.askerProfile?.answered_questions,
    contains_external_contact: containsExternal,
    cross_listing_repetition: repetitions >= 2,
    text_length: text.length,
  });
}

/**
 * Score 0..1 — higher is more likely spam. Uses a transparent heuristic so
 * agents can explain their decision.
 */
export function scoreSpam(features: TQuestionSpamFeatures): number {
  let score = 0;
  if (features.contains_external_contact) score += 0.45;
  if (features.cross_listing_repetition) score += 0.35;
  if (features.text_length < 8) score += 0.15;
  if (features.text_length > 500) score += 0.05;
  if (
    features.asker_account_age_days !== undefined &&
    features.asker_account_age_days < 7
  ) {
    score += 0.15;
  }
  if (
    features.asker_answered_questions !== undefined &&
    features.asker_answered_questions === 0
  ) {
    score += 0.1;
  }
  return Math.max(0, Math.min(1, score));
}

export type SpamLabel = "spam" | "borderline" | "ham";

export function classifySpam(
  input: ClassifySpamInput,
): { label: SpamLabel; score: number; features: TQuestionSpamFeatures } {
  const features = extractSpamFeatures(input);
  const score = scoreSpam(features);
  const label: SpamLabel =
    score >= 0.7 ? "spam" : score <= 0.3 ? "ham" : "borderline";
  return { label, score, features };
}
