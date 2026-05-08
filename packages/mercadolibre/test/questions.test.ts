import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  listQuestions,
  getQuestion,
  answerQuestion,
  blacklistAsker,
  unblockAsker,
  classifySpam,
  scoreSpam,
  extractSpamFeatures,
} from "../src";

const QUESTION_FIXTURE = {
  id: 9991,
  date_created: "2026-05-09T00:00:00.000Z",
  item_id: "MLA12345",
  seller_id: 12345,
  status: "UNANSWERED" as const,
  text: "¿Hay envío a Mendoza?",
  from: { id: 88, answered_questions: 3 },
};

describe("questions API", () => {
  it("listQuestions hits /questions/search with seller_id + status", async () => {
    const fm = mockFetch()
      .on("GET", "/questions/search", () => ({
        status: 200,
        body: { total: 1, questions: [QUESTION_FIXTURE] },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await listQuestions(client, 12345, { status: "UNANSWERED" });
    expect(r.questions).toHaveLength(1);
    expect(new URL(fm.requests[0]!.url).searchParams.get("seller_id")).toBe("12345");
    expect(new URL(fm.requests[0]!.url).searchParams.get("status")).toBe("UNANSWERED");
  });

  it("getQuestion hits /questions/{id}", async () => {
    const fm = mockFetch()
      .on("GET", "/questions/9991", () => ({ status: 200, body: QUESTION_FIXTURE }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getQuestion(client, 9991);
    expect(r.id).toBe(9991);
  });

  it("answerQuestion posts to /answers", async () => {
    const fm = mockFetch()
      .on("POST", "/answers", (req) => ({
        status: 200,
        body: {
          id: 1,
          text: (req.body as { text: string }).text,
          status: "ACTIVE",
        },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await answerQuestion(client, {
      question_id: 9991,
      text: "Sí, llega en 48hs.",
    });
    expect(r.text).toBe("Sí, llega en 48hs.");
  });

  it("answerQuestion enforces 2000 char limit", async () => {
    const fm = mockFetch().build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const long = "x".repeat(2001);
    await expect(
      answerQuestion(client, { question_id: 1, text: long }),
    ).rejects.toThrow();
  });

  it("blacklistAsker posts to /users/{seller}/questions_blacklist", async () => {
    const fm = mockFetch()
      .on("POST", "/users/12345/questions_blacklist", () => ({ status: 204 }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    await expect(blacklistAsker(client, 12345, 88)).resolves.toBeUndefined();
    expect((fm.requests[0]?.body as { user_id: number }).user_id).toBe(88);
  });

  it("unblockAsker DELETEs the blacklist entry", async () => {
    const fm = mockFetch()
      .on("DELETE", "/users/12345/questions_blacklist/88", () => ({ status: 204 }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    await expect(unblockAsker(client, 12345, 88)).resolves.toBeUndefined();
  });
});

describe("question spam classifier", () => {
  it("flags external contact info as spam-leaning", () => {
    const features = extractSpamFeatures({
      question: { ...QUESTION_FIXTURE, text: "Llamame al +54 11 1234-5678" },
    });
    expect(features.contains_external_contact).toBe(true);
    expect(scoreSpam(features)).toBeGreaterThan(0.4);
  });

  it("clean question gets a low score", () => {
    const result = classifySpam({
      question: QUESTION_FIXTURE,
      askerProfile: { account_age_days: 365, answered_questions: 50 },
    });
    expect(result.label).toBe("ham");
    expect(result.score).toBeLessThan(0.3);
  });

  it("repetition across listings boosts the score", () => {
    const text = "¿Hay stock?";
    const result = classifySpam({
      question: { ...QUESTION_FIXTURE, text },
      recentQuestionsByThisAsker: [text, text, text],
    });
    expect(result.features.cross_listing_repetition).toBe(true);
    expect(result.score).toBeGreaterThan(0.3);
  });

  it("very short text increments the score", () => {
    const features = extractSpamFeatures({
      question: { ...QUESTION_FIXTURE, text: "?" },
    });
    expect(scoreSpam(features)).toBeGreaterThan(0);
  });

  it("flags new accounts higher", () => {
    const features = extractSpamFeatures({
      question: { ...QUESTION_FIXTURE, text: "Hola, ¿tenes stock?" },
      askerProfile: { account_age_days: 1 },
    });
    expect(features.asker_account_age_days).toBe(1);
    expect(scoreSpam(features)).toBeGreaterThan(0.1);
  });
});
