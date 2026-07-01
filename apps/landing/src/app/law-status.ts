export type LawStatus = "pre" | "live";

// Single switch for the whole site. Today the draft Ley de Sociedades is in the
// Senate, so the site runs in "pre" mode: honest banner, waitlist-style CTAs,
// the wizard generates the company but marks registration as pending. The day
// the law passes, set NEXT_PUBLIC_LAW_STATUS=live (one build, since NEXT_PUBLIC_*
// is inlined at build time).
//
// COVERAGE (keep honest): the flip is currently wired on nav.tsx (CTA), page.tsx
// (hero + law banner), and ley/page.tsx (estado). Still to wire before it is truly
// site-wide: incorporar/ (the "cuando se sancione la ley" pre-launch copy), and
// registro/ + precios/ (today byte-identical pre vs live). Verify every branch
// under NEXT_PUBLIC_LAW_STATUS=live before shipping on law-day.
export const LAW_STATUS: LawStatus =
  process.env.NEXT_PUBLIC_LAW_STATUS === "live" ? "live" : "pre";

export const lawIsLive = LAW_STATUS === "live";
