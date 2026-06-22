/**
 * art. 102 governance, wired into the agent's central enforcement
 * (`enforceRiskPolicy` from @ar-agents/core). Two hooks:
 *
 *  - `approve`: the ASYNC approval gate. A deployed society can't block on a
 *    human per tool-call, so it asks ar-agents.ar whether this exact action is
 *    already approved. If yes it is consumed and we proceed; if no, it is queued
 *    for the administrator and we DEFER (return false). The agent retries on a
 *    later run once the human approves.
 *  - `isHalted`: the KILL-SWITCH. Asks ar-agents.ar whether this society is
 *    suspended; if so, every tool refuses.
 *
 * Both FAIL CLOSED on error (an action we can't confirm is allowed does not run;
 * a society we can't confirm is live halts). If SOCIETY_ID is unset the society
 * runs ungoverned (local dev): approve passes and nothing is halted.
 */

const BASE = process.env.AR_AGENTS_API_BASE?.trim() || "https://ar-agents.ar";
const SOCIETY = process.env.SOCIETY_ID?.trim() || "";
// This society's runtime gate token (minted at constitution, shown once). Proves
// to the approval queue that this deploy IS the society, so a stranger who knows
// the public sessionId cannot flood the queue. Sent on every gate call.
const GATE_TOKEN = process.env.SOCIETY_GATE_TOKEN?.trim() || "";
// The ungoverned pass-through is for LOCAL DEV ONLY. In production a missing
// SOCIETY_ID must FAIL CLOSED: a deployed society with governance silently off
// (every high-stakes tool ungated, kill-switch inert) is the most dangerous
// misconfiguration — a total art. 102 bypass the operator would not notice.
const IS_PROD = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);

export async function approve(toolName: string, args: unknown): Promise<boolean> {
  if (!SOCIETY) return !IS_PROD; // dev: pass through; prod: refuse (fail closed)
  try {
    const res = await fetch(`${BASE}/api/approvals/gate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ society: SOCIETY, tool: toolName, args, gateToken: GATE_TOKEN }),
    });
    if (!res.ok) return false; // fail closed
    const data = (await res.json()) as { approved?: boolean };
    return data.approved === true;
  } catch {
    return false; // fail closed
  }
}

export async function isHalted(): Promise<boolean> {
  if (!SOCIETY) return IS_PROD; // dev: not halted; prod: halt (fail closed)
  try {
    const res = await fetch(
      `${BASE}/api/suspension-status?society=${encodeURIComponent(SOCIETY)}`,
    );
    if (!res.ok) return true; // 503 / error -> halt (fail closed)
    const data = (await res.json()) as { suspended?: boolean };
    return data.suspended === true;
  } catch {
    return true; // unreachable -> halt (fail closed)
  }
}
