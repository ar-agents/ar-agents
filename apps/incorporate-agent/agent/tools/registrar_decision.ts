import { defineTool } from "eve/tools";
import { z } from "zod";

const ENDPOINT = "https://ar-agents.ar/api/auditor/log";
const TIMEOUT_MS = 10_000;

/**
 * Append a signed entry to El Auditor's audit log (RFC-004/006).
 *
 * Append-only, so no approval. The log is the evidence that the company
 * operated through an adequate decision procedure (art. 101) under human
 * supervision (art. 102). Public read + offline verify at
 * /api/play/audit/{sessionId} and /dashboard/{sessionId}.
 *
 * Needs AUDITOR_API_KEY (issued by POST /api/auditor/activate). Without it the
 * tool returns a structured "not configured" result instead of failing. The
 * write is bounded by a timeout + the framework abort signal, and a logging
 * failure never throws — it returns {ok:false} so it can't break the flow.
 */
export default defineTool({
  description:
    "Record a decision in El Auditor's signed, tamper-evident audit log. Append-only. Use it after each meaningful action (incorporation, a payment, a filing) so the session stays publicly verifiable. The human administrator's sign-offs are the art. 101/102 evidence.",
  inputSchema: z.object({
    tool: z.string().min(1).max(80).describe("Short name of the action being logged."),
    governance: z
      .enum(["algorithm-only", "audit-logged", "mocked-upstream", "requires-confirmation"])
      .default("audit-logged"),
    input: z.unknown().describe("The action's inputs."),
    output: z.unknown().optional().describe("The action's result, if any."),
  }),
  async execute(input) {
    const apiKey = process.env.AUDITOR_API_KEY?.trim();
    if (!apiKey) {
      return {
        ok: false as const,
        code: "unconfigured" as const,
        note: "Set AUDITOR_API_KEY (from POST /api/auditor/activate) to write durable signed entries.",
      };
    }
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": apiKey },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const data = await res.json().catch(() => ({}));
      return res.ok
        ? { ok: true as const, ...data }
        : { ok: false as const, status: res.status, error: data };
    } catch (e) {
      // A logging failure must never break the incorporation flow; degrade.
      const name = (e as { name?: string } | null)?.name;
      return { ok: false as const, code: name === "TimeoutError" ? "timeout" : "network" };
    }
  },
});
