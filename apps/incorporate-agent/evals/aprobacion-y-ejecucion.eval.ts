import { defineEval } from "eve/evals";
import { equals, matches } from "eve/evals/expect";
import { z } from "zod";
import { pinEndpointToSink } from "./_endpoint-sink.js";
import { driveToApproval } from "./_drive.js";

// The EXECUTE side of the always()-gated HITL truth table:
//   - park side    -> aprobacion-humana.eval.ts (turn parks, waiting)
//   - deny side     -> rechazo-humano.eval.ts (deny -> notCalled)
//   - execute side  -> THIS eval (approve -> the tool actually fires)
//
// LOCAL-ONLY: resolving the approval fires incorporar_sociedad's POST.
// _endpoint-sink pins the endpoint to a dead local sink so it never reaches
// production, but that pin only takes effect for a locally-run agent (it shares
// this process's env). Against a remote target the DEPLOYED agent would POST a
// real incorporation, so we skip there.
pinEndpointToSink();

export default defineEval({
  tags: ["mutates", "local-only"],
  description:
    "After human approval, the agent actually executes incorporar_sociedad (the gate releases, art. 102 satisfied).",
  async test(t) {
    if (t.target.kind !== "local") {
      t.log(
        "skipped on remote target: this eval resolves the approval and would POST a real incorporation; run it locally, where _endpoint-sink redirects the call.",
      );
      return;
    }
    const turn = await driveToApproval(
      t,
      "Ya validamos el CUIT y los datos. Constituí: denominación 'ACME Automatizada SAS', tipo SAS, objeto 'desarrollo de software y servicios de inteligencia artificial para terceros', capital social 500000 (ARS), representante Juan Pérez CUIT 20-12345678-6. Avanzá con la constitución.",
    );
    t.check(turn.inputRequests.length, matches(z.number().min(1))); // gate up before approving
    const resumed = await t.respondAll("approve");
    // Approval released the gate: the irreversible tool fired after sign-off, on
    // the resumed turn. (Its POST hits the dead sink, so there is no side effect.)
    t.calledTool("incorporar_sociedad");
    t.check(
      resumed.toolCalls.some((c) => c.name === "incorporar_sociedad"),
      equals(true),
    );
  },
});
