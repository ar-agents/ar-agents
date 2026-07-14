import Link from "next/link";
import { DocH2, DocP, DocShell } from "../doc-shell";
import type { Lang } from "../i18n";

/**
 * Shared bilingual content for `/economia-del-regimen` (ES, default)
 * and `/en/regime-economics` (EN).
 *
 * This page is DE-LISTED (noindex, not in nav/sitemap/llms) and intentionally
 * kept short and neutral. It is reachable by direct URL for continuity with old
 * inbound links; it carries no projections, totals, or comparative claims.
 */

export function EconomiaContent({ lang }: { lang: Lang }) {
  const es = lang === "es";
  return (
    <DocShell
      eyebrow={es ? "régimen · nota" : "regime · note"}
      title={es ? "Costos de constitución y operación" : "Formation and operating costs"}
      subtitle={
        es
          ? "Constituir y operar una sociedad automatizada tiene un costo. Los importes dependen del tipo societario, la jurisdicción y los servicios contratados."
          : "Forming and operating an automated company has a cost. The figures depend on the company type, the jurisdiction, and the services used."
      }
    >
      <DocP>
        {es
          ? "Esta página quedó como referencia. Para los costos y planes vigentes, mirá la página de precios. Para constituir, usá el asistente."
          : "This page is kept for reference. For current costs and plans, see the pricing page. To form a company, use the assistant."}
      </DocP>

      <DocH2>{es ? "Dónde seguir" : "Where to go next"}</DocH2>
      <DocP>
        <Link href={es ? "/precios" : "/en/pricing"}>{es ? "Precios" : "Pricing"}</Link>
        {" · "}
        <Link href="/incorporar">{es ? "Constituí una sociedad" : "Form a company"}</Link>
        {" · "}
        <Link href={es ? "/legislacion" : "/en/legislation"}>
          {es ? "Síntesis legislativa" : "Legislative synthesis"}
        </Link>
      </DocP>
    </DocShell>
  );
}
