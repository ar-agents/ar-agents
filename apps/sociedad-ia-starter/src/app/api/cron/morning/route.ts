/**
 * `GET /api/cron/morning` — daily operating loop.
 *
 * Wire to Vercel Cron via `vercel.json`:
 *
 * ```json
 * {
 *   "crons": [
 *     { "path": "/api/cron/morning", "schedule": "0 12 * * *" }
 *   ]
 * }
 * ```
 *
 * Each morning the agent:
 *   1. Reads the DEC inbox (Domicilio Electrónico Constituido) via
 *      `@ar-agents/gde-tad`.
 *   2. Pulls today's Boletín Oficial publications.
 *   3. Triages critical items and (in production) posts a digest to
 *      WhatsApp / Slack.
 *
 * Returns 401 if the request lacks the cron secret header set by Vercel
 * Cron — this prevents arbitrary callers from invoking the loop.
 */

import { NextResponse } from "next/server";
import { buildAgent } from "@/lib/agent";

export async function GET(req: Request) {
  const expectedSecret = process.env.CRON_SECRET?.trim();
  if (expectedSecret) {
    const provided =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    if (provided !== expectedSecret) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
  }

  const cuit = process.env.SOCIEDAD_IA_CUIT?.trim();
  if (!cuit) {
    return NextResponse.json(
      { error: "SOCIEDAD_IA_CUIT not configured." },
      { status: 503 },
    );
  }

  try {
    const agent = await buildAgent();
    const result = await agent.generate({
      prompt:
        `Es la rutina de mañana. Para la sociedad-IA con CUIT ${cuit}:\n` +
        `1. Listá las notificaciones críticas del DEC (get_critical_notifications).\n` +
        `2. Listá las publicaciones del Boletín Oficial de hoy que afecten al CUIT (bo_today + filtro CUIT).\n` +
        `3. Devolvé un resumen ejecutivo en máximo 5 viñetas. Si no hay nada urgente, dí "todo en orden".`,
    });

    return NextResponse.json({
      summary: result.text,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
