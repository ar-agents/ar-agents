/**
 * `GET /api/constancia/badge/[cuit]`, the shareable Constancia Oracle badge.
 *
 * A shields.io-style SVG ("constancia · válida" / "no válida") an operator
 * embeds anywhere they assert a CUIT is real, README, status page, alta-de-
 * proveedor doc, marketplace profile. Label "constancia", message driven by
 * the pure mod-11 check-digit validity from `@ar-agents/identity`, so it works
 * with NO secret. Reuses @/lib/badge (buildSvg, BadgeState) exactly like
 * /api/badge/[sessionId].
 *
 * ── THIS IS THE EXPERIMENT'S CORE INSTRUMENT ─────────────────────────────────
 * On EVERY badge request we log the `Referer` header, the domain that embedded
 * the badge, to the same ephemeral KV store the rest of the app uses
 * (recordConstanciaEvent → oracle:k:referer). That is the k-factor signal:
 * which external domains carry the badge out into the world and propagate the
 * loop. Logging degrades to a no-op when KV is absent and NEVER throws on the
 * image path (a broken metric must never break the badge render).
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Cache-control: 1h. Check-digit validity is immutable for a given CUIT, so a
 * long cache is safe. Note: a cached/proxied badge (GitHub camo, CDN) only
 * re-hits this origin ~hourly, so the Referer sample is conservative, it
 * undercounts rather than overcounts embeds, which is the safe direction.
 */

import { parseCuit } from "@ar-agents/identity";
import { type BadgeState, buildSvg } from "@/lib/badge";
import { extractAttribution, recordConstanciaEvent } from "@/lib/constancia";

export const runtime = "nodejs";

function svgResponse(state: BadgeState, status = 200): Response {
  const svg = buildSvg(state);
  return new Response(svg, {
    status,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      // 1h cache: validity is immutable per CUIT; embeds re-hit ~hourly.
      "cache-control":
        "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ cuit: string }> },
) {
  const { cuit } = await ctx.params;
  const parsed = parseCuit(cuit);

  // EXPERIMENT METRIC: record the embedding domain (Referer) on every badge
  // hit. Best-effort; a metric failure must never break the image.
  try {
    await recordConstanciaEvent(
      "badge",
      parsed.normalized || cuit,
      extractAttribution(req),
    );
  } catch {
    // never let instrumentation break the badge render
  }

  if (parsed.valid) {
    return svgResponse({
      label: "constancia",
      message: "válida",
      color: "#10b981", // --success
    });
  }
  return svgResponse(
    {
      label: "constancia",
      message: "no válida",
      color: "#ef4444", // --danger
    },
    // 200 so the badge still renders inline wherever it is embedded; the
    // message itself carries the verdict.
    200,
  );
}
