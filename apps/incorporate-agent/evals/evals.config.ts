import { defineEvalConfig } from "eve/evals";

// Run-wide eval defaults. Required by `eve eval` (the runner refuses to start
// without it). No judge model is set: every eval in this suite scores with
// deterministic assertions (t.check / t.calledTool / t.notCalledTool /
// t.waiting / t.messageIncludes / t.respondAll), never t.judge.*, so no
// LLM-as-judge model is needed. Add `{ judge: { model: "..." } }` here if a
// future eval introduces a judge assertion.
export default defineEvalConfig({});
