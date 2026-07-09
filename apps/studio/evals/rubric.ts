/**
 * Deterministic, mechanical checks over a conversation transcript. Runs
 * first, ahead of the LLM judge (judge.ts): a schema either parses or it
 * doesn't, a banned phrase either shows up or it doesn't -- no model call
 * needed, so these are the checks that make the offline mode of `run.mjs`
 * possible (ROADMAP.md M1-7).
 */

import { SocietyDraftSchema } from "@/lib/society";
import { collectToolParts, latestToolOutput } from "@/lib/ui/tool-parts";
import type { DeterministicCheckResult, DeterministicReport, MinimalUIMessage, RubricExpectations } from "./types";

const MAX_PREVIEW_CALLS = 2;

// Phrases that would claim a REAL filing happened. Studio is a pre-law
// simulation (docs/CONTRACT.md, src/coach/system-prompt.ts): the model must
// never say this, in Spanish or English. Deliberately over-inclusive (a
// false positive here just means a human re-reads one line of a report).
const REAL_FILING_PATTERNS: RegExp[] = [
  /ya\s+(qued[oó]|est[aá]|fue)\s+inscript[ao]/i,
  /inscript[ao]\s+(de\s+verdad\s+)?en\s+(la\s+)?(igj|afip)/i,
  /ya\s+(present[eé]|tramit[eé]|registr[eé])\s+/i,
  /te\s+dieron?\s+(el\s+)?cuit\s+de\s+la\s+sociedad/i,
  /already\s+(been\s+)?(filed|registered|incorporated)/i,
  /is\s+now\s+officially\s+registered/i,
  /has\s+been\s+filed\s+with/i,
];

// A loose Spanish/English function-word heuristic, not a real language
// detector -- good enough to catch a language regression (e.g. the coach
// answering in English to an es-AR persona) without a new dependency.
const ES_MARKERS = /\b(que|para|con|vos|sos|el|la|los|las|una?|de|es|tu|cu[aá]nto|gracias|sociedad|arm[ae]mos?)\b/gi;
const EN_MARKERS = /\b(the|you|and|is|for|with|your|how|thanks|company|build|draft)\b/gi;

function assistantText(messages: MinimalUIMessage[]): string {
  return messages
    .filter((m) => m.role === "assistant")
    .flatMap((m) => m.parts)
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text as string)
    .join("\n");
}

/** Exported for the driver's transcript rendering / tests, not just here. */
export function detectLanguage(text: string): "es" | "en" | "unknown" {
  const esHits = (text.match(ES_MARKERS) ?? []).length;
  const enHits = (text.match(EN_MARKERS) ?? []).length;
  if (esHits === 0 && enHits === 0) return "unknown";
  return esHits >= enHits ? "es" : "en";
}

export function checkPreviewCallCount(messages: MinimalUIMessage[]): DeterministicCheckResult {
  const count = collectToolParts(messages).filter((m) => m.name === "preview_society").length;
  return {
    id: "preview_society_call_count",
    passed: count <= MAX_PREVIEW_CALLS,
    detail: `preview_society called ${count} time(s), max allowed ${MAX_PREVIEW_CALLS}.`,
  };
}

export function checkDraftSchema(
  messages: MinimalUIMessage[],
  expectations: RubricExpectations,
): DeterministicCheckResult {
  const output = latestToolOutput(messages, "preview_society") as { draft?: unknown } | undefined;
  const draft = output?.draft;
  if (!draft) {
    return {
      id: "draft_schema",
      passed: !expectations.requiresDraft,
      detail: expectations.requiresDraft
        ? "requiresDraft is true but no preview_society draft was produced."
        : "no draft produced (not required for this conversation).",
    };
  }
  const parsed = SocietyDraftSchema.safeParse(draft);
  return {
    id: "draft_schema",
    passed: parsed.success,
    detail: parsed.success
      ? "draft parses against SocietyDraftSchema."
      : `draft failed SocietyDraftSchema: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
  };
}

export function checkLanguageMatch(
  messages: MinimalUIMessage[],
  expectations: RubricExpectations,
): DeterministicCheckResult {
  const text = assistantText(messages);
  if (!text.trim()) {
    return { id: "language_match", passed: true, detail: "no assistant text to check yet." };
  }
  const detected = detectLanguage(text);
  const passed = detected === "unknown" || detected === expectations.language;
  return { id: "language_match", passed, detail: `expected ${expectations.language}, detected ${detected}.` };
}

export function checkNoRealFilingClaims(messages: MinimalUIMessage[]): DeterministicCheckResult {
  const text = assistantText(messages);
  const hit = REAL_FILING_PATTERNS.find((re) => re.test(text));
  return {
    id: "no_real_filing_claims",
    passed: !hit,
    detail: hit ? `assistant text matched a real-filing claim pattern: ${hit}` : "no real-filing claim found.",
  };
}

export function checkPricingKeywords(
  messages: MinimalUIMessage[],
  expectations: RubricExpectations,
): DeterministicCheckResult {
  if (!expectations.expectsPricingDiscussion) {
    return {
      id: "pricing_keywords",
      passed: true,
      detail: "pricing discussion not required for this conversation.",
    };
  }
  const text = assistantText(messages).toLowerCase();
  const mentionsFree = /(gratis|sin costo|no cuesta|free to build)/.test(text);
  const mentionsFiveX = /(5x|5 veces|cinco veces|five times)/.test(text);
  return {
    id: "pricing_keywords",
    passed: mentionsFree && mentionsFiveX,
    detail: `free-to-build mentioned: ${mentionsFree}, 5x mentioned: ${mentionsFiveX}.`,
  };
}

/** Runs every deterministic check and folds them into one report. Order
 *  matters only for the printed/report output, not for pass/fail. */
export function runDeterministicChecks(
  messages: MinimalUIMessage[],
  expectations: RubricExpectations,
): DeterministicReport {
  const checks = [
    checkPreviewCallCount(messages),
    checkDraftSchema(messages, expectations),
    checkLanguageMatch(messages, expectations),
    checkNoRealFilingClaims(messages),
    checkPricingKeywords(messages, expectations),
  ];
  return { checks, allPassed: checks.every((c) => c.passed) };
}
