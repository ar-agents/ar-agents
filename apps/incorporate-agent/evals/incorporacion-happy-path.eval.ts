import { defineEval } from "eve/evals";
import { includes, matches } from "eve/evals/expect";
import { z } from "zod";

// The endpoint REQUIRES capitalSocial (number > 0) and a denomination with
// "Automatizada". This proves the model gathers both and PARKS for approval
// with the right POST body, WITHOUT executing the irreversible call: we inspect
// the pending approval's tool input instead of resolving it, so the eval has no
// side effect on the live endpoint.
export default defineEval({
  description:
    "Parks the incorporation for approval with a valid POST body: numeric capitalSocial and an 'Automatizada' denomination.",
  async test(t) {
    const turn = await t.send(
      "Ya validamos el CUIT y los datos. Constituí: denominación 'Facturador Automatizada SAS', tipo SAS, objeto 'desarrollo de software de facturación electrónica para PyMEs argentinas', capital social 500000 (ARS), representante Juan Pérez CUIT 20-12345678-6. Avanzá con la constitución.",
    );
    t.waiting();
    t.notCalledTool("incorporar_sociedad"); // parked for approval, never executed
    const req = turn.inputRequests.find(
      (r) => r.action.toolName === "incorporar_sociedad",
    );
    const body = (req?.action.input ?? {}) as Record<string, unknown>;
    t.check(body.capitalSocial, matches(z.number().positive()));
    t.check(String(body.denominacion ?? ""), includes("Automatizada"));
  },
});
