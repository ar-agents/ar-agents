import { defineEval } from "eve/evals";
import { includes, matches } from "eve/evals/expect";
import { z } from "zod";

// Knowledge eval: the agent loads the sociedad-automatizada skill and answers
// the two facts that matter, the "Automatizada" denomination (art. 14) and why
// the human must approve (art. 102). Single turn, no tool side effects.
export default defineEval({
  description:
    "Explains the 'Automatizada' denomination (art. 14) and why incorporation needs human approval (art. 102).",
  async test(t) {
    const turn = await t.send(
      "Para constituir una sociedad automatizada, que tiene que incluir la denominacion y por que la constitucion requiere mi aprobacion como humano?",
    );
    turn.expectOk();
    t.check(turn.message ?? "", includes("Automatizada"));
    t.check(
      turn.message ?? "",
      matches(z.string().refine((m) => /102|aprob|superv/i.test(m))),
    );
  },
});
