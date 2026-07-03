/**
 * `GET /api/constancia/metrics`, the public reading of the acquisition
 * experiment.
 *
 * Returns the classified k-factor counters (see @/lib/constancia-metrics):
 * seeds, proxies, synthetic test hits, and the only number that matters,
 * distinct EXTERNAL domains embedding the badge. Public on purpose: the
 * experiment's honesty guarantee is that anyone can watch it, including
 * watching it read zero.
 *
 * Runtime nodejs (KV). Cached 60s: the counters move slowly and this page
 * exists for humans and crawlers, not for high-frequency polling.
 */

import { jsonCors, preflight } from "@/lib/cors";
import { readConstanciaMetrics } from "@/lib/constancia-metrics";

export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const metrics = await readConstanciaMetrics();
  if (!metrics) {
    return jsonCors(
      {
        error: "metrics_unavailable",
        note: "El store de métricas no está configurado en este deployment.",
      },
      { status: 503 },
    );
  }
  return jsonCors(
    {
      $schema: "https://ar-agents.ar/schemas/constancia-metrics.v1.json",
      experiment:
        "Constancia Oracle, experimento #1 de adquisición autónoma (cero ventas humanas).",
      readAt: new Date().toISOString(),
      ...metrics,
    },
    {
      headers: {
        "cache-control": "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}

export function OPTIONS(): Response {
  return preflight();
}
