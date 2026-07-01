/**
 * GET /api/auto-monitor
 *
 * Vercel cron-driven endpoint. Hits /api/conformance-history?refresh=1
 * for each entry in the public /registro page, building up a long-term
 * time-series of cert-scores. The cron runs once daily (0 4 * * *) per vercel.json.
 *
 * Returns a summary JSON: per-URL latest score + run duration.
 *
 * Called by Vercel cron, which sends Authorization: Bearer <CRON_SECRET>.
 * Fail-closed: this endpoint refuses (503) when CRON_SECRET is unset and
 * rejects (401) any request lacking the correct Bearer token, so it is
 * NOT publicly callable.
 *
 * Node runtime. ~3-5s per URL (the certifier itself does 9 HTTP
 * sub-checks). Five URLs = ~25s worst case, well under Vercel's
 * 60s function timeout.
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const SITE = "https://ar-agents.ar";

/**
 * URLs to monitor. Source of truth: the live entries in /registro.
 * Keep this list in sync with the REGISTRY constant in
 * apps/landing/src/app/registro/page.tsx.
 */
const TARGETS = [
  "https://ar-agents.ar",
  "https://mp-hello.ar-agents.ar",
  "https://cuit-hello.ar-agents.ar",
  "https://whatsapp-hello.ar-agents.ar",
  "https://bridge-hello.ar-agents.ar",
];

interface TargetResult {
  url: string;
  ok: boolean;
  latestScore?: number;
  latestRating?: string;
  totalPoints?: number;
  error?: string;
  elapsedMs: number;
}

export async function GET(req: Request): Promise<Response> {
  // Fail-closed: each run fans out to ~5x11 outbound fetches, so it must not be
  // publicly triggerable. Vercel cron sends Authorization: Bearer <CRON_SECRET>.
  // If CRON_SECRET is unset we refuse rather than serve it open to anyone.
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return NextResponse.json(
      { error: "Disabled: set CRON_SECRET to enable the monitor (fail-closed)." },
      { status: 503 },
    );
  }
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json(
      { error: "Unauthorized. Send Authorization: Bearer <CRON_SECRET>." },
      { status: 401 },
    );
  }

  const startAll = Date.now();
  const results: TargetResult[] = await Promise.all(
    TARGETS.map(async (url): Promise<TargetResult> => {
      const start = Date.now();
      try {
        const r = await fetch(
          `${SITE}/api/conformance-history?url=${encodeURIComponent(url)}&refresh=1`,
          {
            method: "GET",
            signal: AbortSignal.timeout(20000),
            headers: {
              "user-agent": "ar-agents-auto-monitor (cron)",
            },
          },
        );
        if (!r.ok) {
          return {
            url,
            ok: false,
            error: `HTTP ${r.status}`,
            elapsedMs: Date.now() - start,
          };
        }
        const data = (await r.json()) as {
          points?: Array<{ score?: number; rating?: string }>;
        };
        const points = data.points ?? [];
        const latest = points[points.length - 1];
        return {
          url,
          ok: true,
          latestScore: latest?.score,
          latestRating: latest?.rating,
          totalPoints: points.length,
          elapsedMs: Date.now() - start,
        };
      } catch (e) {
        return {
          url,
          ok: false,
          error: (e as Error).message,
          elapsedMs: Date.now() - start,
        };
      }
    }),
  );

  const totalElapsedMs = Date.now() - startAll;
  const okCount = results.filter((r) => r.ok).length;

  return NextResponse.json(
    {
      $schema: `${SITE}/schemas/auto-monitor.v1.json`,
      generatedAt: new Date().toISOString(),
      targetsCount: TARGETS.length,
      okCount,
      failedCount: TARGETS.length - okCount,
      totalElapsedMs,
      results,
    },
    {
      headers: {
        "cache-control": "no-store",
        "content-type": "application/json; charset=utf-8",
      },
    },
  );
}
