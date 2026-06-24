// Run the eval suite. Reads scenarios, asks the judge LLM to grade each
// agent transcript, prints a markdown report. Headless — no UI needed.
//
// Usage (routes through the Vercel AI Gateway; bare "provider/model" strings):
//   AI_GATEWAY_API_KEY=… pnpm tsx evals/run.ts
//   AI_GATEWAY_API_KEY=… pnpm tsx evals/run.ts --judge-model anthropic/claude-sonnet-4-6
//
// Cost note: each scenario runs the SUT agent (~$0.001) + the judge agent
// (~$0.002). 10 scenarios = ~$0.03. Cheap enough to run on every PR.

import { generateObject, generateText } from "ai";
import { mockFetch, makeMeliClient } from "../src/testing";
import { meliTools } from "../src/ai-sdk";
import { SCENARIOS, ScoreSchema, type Score, type Scenario } from "./scenarios";

const JUDGE_MODEL = process.argv.includes("--judge-model")
  ? process.argv[process.argv.indexOf("--judge-model") + 1]!
  : "anthropic/claude-sonnet-4-6";

const SUT_MODEL = "anthropic/claude-sonnet-4-6"; // system-under-test (gateway-routed)

// ---------------------------------------------------------------------------
// MOCK MELI BACKEND. Returns canned data shaped like real MELI responses so
// the agent can complete the scenarios. This is the SAME shape exercised by
// the unit tests, just plumbed through ai-sdk's tool-call cycle.
// ---------------------------------------------------------------------------

function buildMockClient() {
  const fm = mockFetch()
    .on("GET", "/orders/search", () => ({
      status: 200,
      body: {
        paging: { total: 7 },
        results: Array.from({ length: 7 }, (_, i) => ({
          id: 1000 + i,
          date_created: new Date().toISOString(),
          status: "paid",
          total_amount: 4500 * (i + 1),
          currency_id: "ARS",
          pack_id: i % 3 === 0 ? 9000 + i : null,
          order_items: [
            {
              item: { id: `MLA${1402155766 + i}`, title: "Yerba mate" },
              quantity: 1,
              unit_price: 4500,
              currency_id: "ARS",
            },
          ],
          buyer: { id: 88 + i, nickname: `BUYER-${i}` },
        })),
      },
    }))
    .on("GET", "/orders/1234567890", () => ({
      status: 200,
      body: {
        id: 1234567890,
        date_created: new Date().toISOString(),
        status: "paid",
        total_amount: 12500,
        currency_id: "ARS",
        pack_id: 9001,
        order_items: [
          {
            item: { id: "MLA1402155766", title: "Yerba mate Amanda 1kg" },
            quantity: 2,
            unit_price: 6250,
            currency_id: "ARS",
          },
        ],
        buyer: {
          id: 88,
          nickname: "TERE-X",
          billing_info: { doc_type: "DNI", doc_number: "12345678" },
        },
      },
    }))
    .onRegex("GET", /\/orders\/\d+$/, () => ({
      status: 200,
      body: {
        id: 9999,
        date_created: new Date().toISOString(),
        status: "paid",
        total_amount: 5000,
        currency_id: "ARS",
        pack_id: null,
        order_items: [],
        buyer: { id: 1, nickname: "X" },
      },
    }))
    .on("GET", "/questions/search", () => ({
      status: 200,
      body: {
        total: 3,
        questions: [
          {
            id: 9876543210,
            seller_id: 12345,
            item_id: "MLA1402155766",
            text: "¿Hay stock en talle M?",
            status: "UNANSWERED",
            date_created: new Date().toISOString(),
            from: { id: 88, nickname: "TERE-X", answered_questions: 12 },
          },
          {
            id: 1111,
            seller_id: 12345,
            item_id: "MLA1402155767",
            text: "¿Hacés envío gratis?",
            status: "UNANSWERED",
            date_created: new Date().toISOString(),
            from: { id: 89 },
          },
          {
            id: 2222,
            seller_id: 12345,
            item_id: "MLA1402155768",
            text: "Hola",
            status: "UNANSWERED",
            date_created: new Date().toISOString(),
            from: { id: 90 },
          },
        ],
      },
    }))
    .on("POST", "/answers", (req) => ({
      status: 200,
      body: { id: 9999, text: (req.body as { text: string }).text, status: "ANSWERED" },
    }))
    .on("GET", "/sites/MLA/category_predictor/predict", () => ({
      status: 200,
      body: {
        id: "MLA409408",
        name: "Yerba Mate",
        path_from_root: [
          { id: "MLA1403", name: "Alimentos y Bebidas" },
          { id: "MLA1409", name: "Almacén" },
          { id: "MLA409408", name: "Yerba Mate" },
        ],
      },
    }))
    .on("GET", "/sites/MLA/domain_discovery/search", () => ({
      status: 200,
      body: [
        {
          domain_id: "MLA-YERBA_MATE",
          domain_name: "Yerba mate",
          category_id: "MLA409408",
          category_name: "Yerba Mate",
          attributes: [],
        },
      ],
    }))
    .on("GET", "/domains/MLA-YERBA_MATE/technical_specs/input", () => ({
      status: 200,
      body: {
        input: {
          components: [
            { type: "INPUT", id: "BRAND", required: true },
            { type: "INPUT", id: "MODEL", required: true },
            { type: "INPUT", id: "NET_WEIGHT", required: true },
            { type: "INPUT", id: "ITEM_CONDITION", required: true },
          ],
          mandatory: 4,
        },
      },
    }))
    .on("GET", "/users/12345/items/search", () => ({
      status: 200,
      body: {
        results: Array.from({ length: 47 }, (_, i) => `MLA${1400000000 + i}`),
        scroll_id: null,
      },
    }))
    .on("PUT", "/items/MLA1402155766", (req) => ({
      status: 200,
      body: {
        id: "MLA1402155766",
        title: "Yerba mate Amanda 1kg",
        price: 4500,
        currency_id: "ARS",
        available_quantity:
          (req.body as { available_quantity?: number }).available_quantity ?? 25,
        status: "active",
      },
    }))
    .on("GET", "/post-purchase/v1/claims/search", () => ({
      status: 200,
      body: {
        paging: { total: 2 },
        data: [
          {
            id: 5421,
            resource: "order",
            resource_id: 1234567890,
            status: "opened",
            stage: "mediation",
            type: "missing_product",
            reason_id: "PNR0001",
            date_created: new Date(Date.now() - 36 * 3600 * 1000).toISOString(),
            due_date: new Date(Date.now() + 18 * 3600 * 1000).toISOString(),
          },
          {
            id: 5422,
            resource: "order",
            resource_id: 1234567891,
            status: "opened",
            stage: "mediation",
            type: "different_product",
            reason_id: "PNR0042",
            date_created: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
            due_date: new Date(Date.now() + 36 * 3600 * 1000).toISOString(),
          },
        ],
      },
    }))
    .on("GET", "/users/12345/seller_reputation", () => ({
      status: 200,
      body: {
        level_id: "3_yellow",
        power_seller_status: null,
        metrics: {
          claims: { rate: 0.04, value: 12, period: "60d" },
          delayed_handling_time: { rate: 0.02, value: 6, period: "60d" },
          cancellations: { rate: 0.015, value: 5, period: "60d" },
          sales: { period: "60d", completed: 200 },
        },
      },
    }))
    .on("GET", "/seller-promotions/users/12345/candidates", () => ({
      status: 200,
      body: {
        results: [
          {
            promotion_id: "PROMO_2026_05",
            promotion_type: "DEAL",
            start_date: new Date().toISOString(),
            finish_date: new Date(Date.now() + 7 * 86400 * 1000).toISOString(),
            suggested_discount_percentage: 20,
            max_discount_percentage: 30,
            min_discount_percentage: 10,
            items: [
              {
                id: "MLA1402155766",
                original_price: 4500,
                suggested_price: 3600,
                currency_id: "ARS",
              },
            ],
          },
        ],
      },
    }))
    .build();

  return makeMeliClient({
    fetch: fm.fetch,
    accessToken: "test_token",
    skipResponseValidation: true,
  });
}

// ---------------------------------------------------------------------------
// RUN ONE SCENARIO. Captures the tool calls + final answer + step count.
// ---------------------------------------------------------------------------

async function runScenario(
  scenario: Scenario,
): Promise<{
  prompt: string;
  toolCalls: { name: string; args: unknown }[];
  finalText: string;
  steps: number;
}> {
  const client = buildMockClient();
  const tools = meliTools(client, { siteId: "MLA", sellerId: 12345 });

  const r = await generateText({
    model: SUT_MODEL,
    tools,
    system:
      "Sos un asistente para vendedores de Mercado Libre Argentina. Hablás español rioplatense. Sos breve y específico. Usás las tools cuando hace falta información real; no inventes datos. Usá la mínima cantidad de tools necesaria, sin llamadas de más. Después de usar las tools, SIEMPRE terminá con una respuesta final clara y concisa que resuma el resultado para el vendedor.",
    prompt: scenario.prompt,
    stopWhen: ({ steps }) => steps.length >= (scenario.maxSteps ?? 6),
  });

  const toolCalls: { name: string; args: unknown }[] = [];
  for (const step of r.steps) {
    for (const part of step.content) {
      if (part.type === "tool-call") {
        toolCalls.push({ name: part.toolName, args: part.input });
      }
    }
  }

  return {
    prompt: scenario.prompt,
    toolCalls,
    finalText: r.text,
    steps: r.steps.length,
  };
}

// ---------------------------------------------------------------------------
// JUDGE. Sends the transcript + expectations to claude-sonnet-4-6 and asks
// for a structured score.
// ---------------------------------------------------------------------------

async function judgeScenario(
  scenario: Scenario,
  result: Awaited<ReturnType<typeof runScenario>>,
): Promise<Score> {
  const judgePrompt = `You are evaluating an AI agent's tool-use transcript for a Mercado Libre seller assistant.

SCENARIO:
- id: ${scenario.id}
- user prompt: ${JSON.stringify(scenario.prompt)}
- expected tools (must call all of these): ${JSON.stringify(scenario.expectedTools)}
- forbidden tools (must NOT call any): ${JSON.stringify(scenario.forbiddenTools ?? [])}
- expected substrings in answer: ${JSON.stringify(scenario.expectedSubstrings ?? [])}
- max steps: ${scenario.maxSteps ?? 6}

AGENT TRANSCRIPT:
- tool_calls: ${JSON.stringify(result.toolCalls)}
- final_answer: ${JSON.stringify(result.finalText)}
- step_count: ${result.steps}

Score on a 1-5 scale (5 = perfect):
- tool_selection: did it call every expected tool?
- tool_safety: did it avoid every forbidden tool?
- answer_quality: was the answer correct, relevant, in Spanish, well-formed?
- efficiency: did it stay within the step budget without redundant calls?

Also write notes (1-2 sentences) summarizing what worked / didn't.`;

  const r = await generateObject({
    model: JUDGE_MODEL,
    schema: ScoreSchema,
    prompt: judgePrompt,
  });
  return r.object;
}

// ---------------------------------------------------------------------------
// MAIN.
// ---------------------------------------------------------------------------

async function main() {
  const scores: Score[] = [];
  console.log(`\n=== Running ${SCENARIOS.length} scenarios on ${SUT_MODEL} ===\n`);

  for (const scenario of SCENARIOS) {
    process.stdout.write(`[${scenario.id}] running... `);
    let result;
    try {
      result = await runScenario(scenario);
    } catch (err) {
      console.log(`FAILED: ${(err as Error).message}`);
      continue;
    }
    process.stdout.write(`scoring... `);
    const score = await judgeScenario(scenario, result);
    scores.push(score);
    const total =
      score.tool_selection + score.tool_safety + score.answer_quality + score.efficiency;
    console.log(`${total}/20`);
  }

  // Print markdown report.
  console.log("\n\n## Eval report\n");
  console.log(
    "| scenario | tools | safety | answer | efficiency | total | notes |",
  );
  console.log("|---|---|---|---|---|---|---|");
  for (const s of scores) {
    const total = s.tool_selection + s.tool_safety + s.answer_quality + s.efficiency;
    console.log(
      `| ${s.scenario_id} | ${s.tool_selection} | ${s.tool_safety} | ${s.answer_quality} | ${s.efficiency} | **${total}/20** | ${s.notes.replace(/\|/g, "\\|").slice(0, 80)} |`,
    );
  }
  if (scores.length === 0) {
    console.log("\nNo scenarios scored. (Did the model run out of credits?)");
    return;
  }
  const avg = scores.reduce(
    (acc, s) =>
      acc +
      s.tool_selection +
      s.tool_safety +
      s.answer_quality +
      s.efficiency,
    0,
  ) / scores.length;
  console.log(`\n**Mean score:** ${avg.toFixed(1)} / 20`);
  console.log(`**Pass rate (≥16/20):** ${scores.filter((s) => s.tool_selection + s.tool_safety + s.answer_quality + s.efficiency >= 16).length} / ${scores.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
