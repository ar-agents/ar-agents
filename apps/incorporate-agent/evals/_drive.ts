import type { EveEvalContext, EveEvalTurn } from "eve/evals";

function pendingTool(turn: EveEvalTurn, toolName: string) {
  return turn.inputRequests.find(
    (r) => r.action.kind === "tool-call" && r.action.toolName === toolName,
  );
}

// Drive the conversation until incorporar_sociedad's always() approval gate is
// up (the run parks on that tool's HITL request), or until maxTurns is reached.
//
// The live model is conservative about an irreversible legal act: before it
// calls the gated tool it first asks an `ask_question` HITL (options like
// confirm / bcra_first / cancel). So reaching the real approval takes a couple
// of steps: we answer each ask_question affirmatively ("confirm"), nudge on a
// plain freeform wait, and assert nothing is constituted unattended along the
// way. Returns the turn parked on the incorporar_sociedad approval (or the last
// turn if the gate was never reached). Not *.eval.ts, so discovery ignores it.
export async function driveToApproval(
  t: EveEvalContext,
  first: string,
  maxTurns = 5,
): Promise<EveEvalTurn> {
  let turn = await t.send(first);
  for (let i = 0; i < maxTurns; i++) {
    if (pendingTool(turn, "incorporar_sociedad")) return turn; // real gate is up
    if (turn.status !== "waiting") return turn; // completed/failed: let caller assert
    t.notCalledTool("incorporar_sociedad"); // never constitute unattended on the way

    const question = pendingTool(turn, "ask_question");
    const options = (question?.options ?? turn.inputRequests[0]?.options ?? []).map(
      (o) => o.id,
    );
    if (options.length > 0) {
      const yes =
        options.find((id) =>
          /confirm|^si$|aprob|proceder|adelante|constitu|continu|avanz/i.test(id),
        ) ?? options[0];
      turn = await t.respondAll(yes);
    } else {
      turn = await t.send("Sí, está todo confirmado. Avanzá con la constitución ahora.");
    }
  }
  return turn;
}
