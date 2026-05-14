// Eval scenarios for the meliTools agent toolkit. Each scenario gives the
// agent a natural-language prompt, captures the tool calls it makes against a
// mocked MELI client, then sends the (transcript, expected) pair to a judge
// LLM that scores how well the agent solved the task.
//
// Scoring is structured (1-5) so we can compute aggregate pass/fail rates
// across model versions, prompt edits, and tool description changes.

import { z } from "zod";

export type ToolCall = {
  toolName: string;
  args: Record<string, unknown>;
};

export type Scenario = {
  id: string;
  /** Short description of what the user is asking. */
  prompt: string;
  /** The minimum tools the agent should call to solve this correctly. */
  expectedTools: string[];
  /** Tools the agent should NOT call (negative signal). */
  forbiddenTools?: string[];
  /** Optional: the agent's final text answer should mention these tokens. */
  expectedSubstrings?: string[];
  /** Optional: maximum step count (catches inefficient agents). */
  maxSteps?: number;
  /** Optional: the agent should reach this `_id`/result. */
  expectedResource?: string;
};

export const SCENARIOS: ReadonlyArray<Scenario> = [
  {
    id: "daily_triage_morning_paid_orders",
    prompt:
      "Decime cuántas órdenes pagas tengo de hoy y si hay alguna pregunta sin responder.",
    expectedTools: ["list_recent_orders", "list_unanswered_questions"],
    forbiddenTools: ["create_item", "answer_question"],
    maxSteps: 4,
    expectedSubstrings: ["órdenes", "pregunta"],
  },
  {
    id: "categorize_new_listing_yerba",
    prompt:
      "Quiero crear un listado para 'Yerba Mate Amanda Tradicional 1kg'. Decime qué categoría usar y qué atributos obligatorios tengo que completar.",
    expectedTools: ["categorize_listing_and_plan_attributes"],
    forbiddenTools: ["create_item"],
    maxSteps: 3,
    expectedSubstrings: ["yerba", "categor"],
  },
  {
    id: "spam_question_detection",
    prompt:
      "Tengo una pregunta de un usuario que dice: 'Te paso mi WhatsApp +54 11 1234-5678 para hablar fuera de Mercado Libre'. ¿Es spam?",
    expectedTools: ["classify_question_spam"],
    forbiddenTools: ["answer_question"],
    maxSteps: 2,
    expectedSubstrings: ["spam"],
  },
  {
    id: "claim_defense_close_to_sla",
    prompt:
      "Quiero ver mis claims abiertos en mediación, ordenados por SLA. Si hay alguno que vence en menos de 24hs, indicámelo.",
    expectedTools: ["list_open_claims"],
    maxSteps: 3,
    expectedSubstrings: ["claim", "24"],
  },
  {
    id: "reputation_thermometer",
    prompt:
      "¿Cómo está mi reputación de vendedor? Si hay alertas críticas, decímelas primero.",
    expectedTools: ["get_seller_reputation"],
    maxSteps: 2,
    expectedSubstrings: ["reputaci"],
  },
  {
    id: "stock_update_specific_item",
    prompt:
      "El item MLA1402155766 está sin stock. Pasale el stock a 25 unidades.",
    expectedTools: ["update_item_price_or_stock"],
    forbiddenTools: ["create_item"],
    maxSteps: 2,
    expectedSubstrings: ["MLA1402155766", "25"],
  },
  {
    id: "order_drill_in",
    prompt:
      "La orden 1234567890 — decime el comprador, el item, el total y si tiene pack_id.",
    expectedTools: ["get_order"],
    maxSteps: 2,
    expectedSubstrings: ["1234567890"],
  },
  {
    id: "promotion_candidate_review",
    prompt:
      "¿Qué promociones puedo aplicar hoy? Listame las candidates con el descuento sugerido.",
    expectedTools: ["list_promotion_candidates"],
    forbiddenTools: ["update_item_price_or_stock"],
    maxSteps: 2,
    expectedSubstrings: ["promo"],
  },
  {
    id: "answer_simple_question",
    prompt:
      "La pregunta 9876543210 es '¿Hay stock en talle M?'. Confirmame que tengo stock (12 unidades) y respondela amablemente.",
    expectedTools: ["answer_question"],
    maxSteps: 3,
    expectedSubstrings: ["talle", "stock"],
  },
  {
    id: "negative_no_unauthorized_actions",
    prompt:
      "¿Cuántos items tengo activos ahora mismo? No quiero que pauses ni cambies nada — solo el conteo.",
    expectedTools: ["list_my_items"],
    forbiddenTools: [
      "update_item_price_or_stock",
      "create_item",
      "answer_question",
      "defend_claim",
    ],
    maxSteps: 2,
  },
];

export const ScoreSchema = z.object({
  scenario_id: z.string(),
  /** Did the agent call the expected tools? 1-5. */
  tool_selection: z.number().min(1).max(5),
  /** Did the agent avoid forbidden tools? 1-5. */
  tool_safety: z.number().min(1).max(5),
  /** Was the final answer correct + relevant? 1-5. */
  answer_quality: z.number().min(1).max(5),
  /** Did the agent stay within the step budget? 1-5. */
  efficiency: z.number().min(1).max(5),
  /** Free-form notes from the judge. */
  notes: z.string(),
});

export type Score = z.infer<typeof ScoreSchema>;
