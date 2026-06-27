export type LawStatus = "pre" | "live";

// Single switch for the whole site. Today the draft Ley de Sociedades is in the
// Senate, so the site runs in "pre" mode: honest banner, waitlist-style CTAs,
// the wizard generates the company but marks registration as pending. The day
// the law passes, set NEXT_PUBLIC_LAW_STATUS=live and every CTA + banner across
// the site flips to the real "register / create your company" flow. One build.
export const LAW_STATUS: LawStatus =
  process.env.NEXT_PUBLIC_LAW_STATUS === "live" ? "live" : "pre";

export const lawIsLive = LAW_STATUS === "live";
