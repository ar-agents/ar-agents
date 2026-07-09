/**
 * Shared types for the M1-7 journey eval suite (ROADMAP.md "M1-7 Journey
 * evals"). Split out so personas.ts, driver.ts, rubric.ts, judge.ts, and
 * run.mjs share one shape instead of each re-declaring it.
 */

import type { MinimalToolPart } from "@/lib/ui/tool-parts";

/** tool-parts.ts's MinimalToolPart only carries tool-call fields (it never
 *  needed a `text` field, since it's used to read tool results out of a
 *  message, not to render text). Eval transcripts also carry plain text
 *  parts, so this widens it locally here instead of editing the shared
 *  source file (evals/ owns only this directory). A `MinimalPart[]` is
 *  still structurally a `MinimalToolPart[]`, so this stays a drop-in
 *  argument everywhere `@/lib/ui/tool-parts`'s functions expect one. */
export interface MinimalPart extends MinimalToolPart {
  text?: string;
}

export interface MinimalUIMessage {
  id: string;
  role: string;
  parts: MinimalPart[];
}

/** What a conversation (a live persona run, or an offline fixture) is
 *  expected to do -- checked by rubric.ts's deterministic layer. */
export interface RubricExpectations {
  /** Language the assistant's replies should be in. */
  language: "es" | "en";
  /** Whether the conversation should reach a preview_society draft by the
   *  end. When false, "no draft produced" is not itself a failure: some
   *  personas legitimately do not converge to a draft within the turn cap
   *  (e.g. a still-vague idea), and that is fine. */
  requiresDraft: boolean;
  /** Whether pricing must be discussed honestly (free to build, ~5x the
   *  estimated cost once operating) somewhere in the assistant's replies. */
  expectsPricingDiscussion: boolean;
}

export interface DeterministicCheckResult {
  id: string;
  passed: boolean;
  detail: string;
}

export interface DeterministicReport {
  checks: DeterministicCheckResult[];
  allPassed: boolean;
}

/** The three LLM-judge dimensions, each 1-5. See judge.ts. */
export interface JudgeScore {
  coachingQuality: number;
  honesty: number;
  actionability: number;
  rationale: string;
}

/** The result of driving (live) or replaying (offline, from a fixture) one
 *  conversation, before scoring. */
export interface JourneyResult {
  id: string;
  messages: MinimalUIMessage[];
  previewCallCount: number;
  draft: unknown;
  turns: number;
  error?: string;
}
