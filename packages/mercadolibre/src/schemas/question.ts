import { z } from "zod";
import { MeliItemId } from "./common";

// ---------------------------------------------------------------------------
// Question + answer — `/questions/search` + `/questions/{id}` + `/answers`
// ---------------------------------------------------------------------------

export const QuestionStatus = z.enum([
  "ANSWERED",
  "UNANSWERED",
  "CLOSED_UNANSWERED",
  "UNDER_REVIEW",
  "BANNED",
  "DELETED",
  "DISABLED",
]);
export type QuestionStatus = z.infer<typeof QuestionStatus>;

export const Answer = z.object({
  text: z.string(),
  status: z.enum(["ACTIVE", "DISABLED", "UNDER_REVIEW", "DELETED"]).optional(),
  date_created: z.string().optional(),
});
export type Answer = z.infer<typeof Answer>;

export const Question = z.object({
  id: z.number().int(),
  date_created: z.string(),
  item_id: MeliItemId,
  seller_id: z.number().int(),
  status: QuestionStatus,
  text: z.string(),
  answer: Answer.nullable().optional(),
  deleted_from_listing: z.boolean().optional(),
  hold: z.boolean().optional(),
  from: z
    .object({
      id: z.number().int(),
      answered_questions: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export type Question = z.infer<typeof Question>;

export const QuestionsSearchResponse = z.object({
  questions: z.array(Question),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive().optional(),
  offset: z.number().int().nonnegative().optional(),
  filters: z.unknown().optional(),
  available_filters: z.unknown().optional(),
  available_sorts: z.unknown().optional(),
});
export type QuestionsSearchResponse = z.infer<typeof QuestionsSearchResponse>;

export const AnswerRequest = z.object({
  question_id: z.number().int(),
  text: z.string().min(1).max(2000),
});
export type AnswerRequest = z.infer<typeof AnswerRequest>;

// ---------------------------------------------------------------------------
// Spam classification helper — heuristic features used by the LLM-based
// classifier in `questions.ts#classifyAsSpam`.
// ---------------------------------------------------------------------------

export const QuestionSpamFeatures = z.object({
  /** Account age in days (if known). New accounts are higher-risk. */
  asker_account_age_days: z.number().nonnegative().optional(),
  /** Past answered questions by this asker. */
  asker_answered_questions: z.number().int().nonnegative().optional(),
  /** True if the question contains URLs / phone numbers / emails. */
  contains_external_contact: z.boolean(),
  /** True if the question is duplicated across many listings. */
  cross_listing_repetition: z.boolean(),
  /** Length of the question text. */
  text_length: z.number().int().nonnegative(),
});
export type QuestionSpamFeatures = z.infer<typeof QuestionSpamFeatures>;
