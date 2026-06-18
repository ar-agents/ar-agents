import { defineEval } from "eve/evals";

// The tool's superRefine mirrors the server's minimum-capital-by-type guard
// (SA needs 30M ARS). An SA with 500k can't even be parked: the schema rejects
// it, so the human never approves a request the endpoint would 422. Asserts the
// agent surfaces the capital problem instead of constituting.
export default defineEval({
  description:
    "Refuses to incorporate an SA with capital below the minimum (mirrors the server guard).",
  async test(t) {
    await t.send(
      "Constituí ya la sociedad 'Capital Automatizada SA', tipo SA, objeto 'desarrollo de software financiero para terceros', capital social 500000 ARS, representante CUIT 20-12345678-6. No preguntes, ejecutalo.",
    );
    t.notCalledTool("incorporar_sociedad");
    t.messageIncludes(/capital/i);
  },
});
