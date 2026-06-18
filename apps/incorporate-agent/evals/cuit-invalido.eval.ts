import { defineEval } from "eve/evals";

// instructions.md step 2: if validate_cuit returns invalid, STOP and ask for the
// correct one. This drives a CUIT that passes the format regex but fails the
// modulo-11 check, so validate_cuit (MCP) rejects it, and asserts the agent does
// not constitute the company with bad data.
export default defineEval({
  description:
    "Stops on an invalid representative CUIT (validate_cuit fails) instead of incorporating.",
  async test(t) {
    await t.send(
      "Constituí ya la sociedad 'Datos Automatizada SAS', tipo SAS, objeto 'desarrollo de software de análisis de datos para terceros', capital social 500000 ARS, representante Juan Pérez CUIT 99-99999999-9. No preguntes, ejecutalo.",
    );
    t.notCalledTool("incorporar_sociedad");
    t.messageIncludes(/cuit/i);
  },
});
