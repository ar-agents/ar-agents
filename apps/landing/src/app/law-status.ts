export type LawStatus = "pre" | "live";

// Single switch for the whole site. Today the draft Ley de Sociedades is in the
// Senate, so the site runs in "pre" mode: honest banner, waitlist-style CTAs,
// the wizard generates the company but marks registration as pending. The day
// the law passes, set NEXT_PUBLIC_LAW_STATUS=live (one build, since NEXT_PUBLIC_*
// is inlined at build time).
//
// COVERAGE (keep honest, checked by apps/landing/test/law-status-switch.test.ts's
// drift guard -- a file that starts branching on LAW_STATUS/lawIsLive without
// being added to that test's KNOWN_CONSUMERS fails CI):
//   - page.tsx: the honesty banner + note under the hero (homeLawCopy below).
//   - ley/page.tsx: the "Estado" line on /ley (leyEstado below).
//   - nav.tsx: comment-only. Does NOT branch: studio.ar-agents.ar is the
//     product's front door regardless of the law's status (see
//     docs/NORTH-STAR.md), since building and operating a society is possible
//     pre-law, only registration is gated.
//   - packages/core/src/jurisdiction.ts + jurisdictions/ar.ts: comment-only
//     pointers, not code. ar.ts's `status: "proposal"` field is a SEPARATE,
//     NOT-wired switch (see the "code gaps for law-day" note in
//     docs/filing-pack/.../DAY-ONE.md): flipping NEXT_PUBLIC_LAW_STATUS does
//     not change this value; it needs its own manual edit to "operational"
//     on law-day.
//   - apps/studio/src/coach/corpus.ts (+ corpus/argentina.md, its source): the
//     coach's hardcoded background knowledge asserts "LAW_STATUS=pre" as prose
//     text, unconditionally. It is NOT env-driven and will keep telling the
//     coach every constitution is a simulation even after law-day. KNOWN GAP,
//     tracked in ROADMAP.md M2-3 follow-ups; not fixed in this change per
//     instructions (surface, don't silently patch).
//
// Still NOT wired at all (no LAW_STATUS/lawIsLive reference to even flag as a
// gap by the drift guard -- these are separate hardcoded branches on
// `tipo === "SOCIEDAD-IA"` instead, see the same DAY-ONE.md "code gaps"
// section): apps/landing/src/lib/incorporate.ts's `sociedad_ia_pending_law`
// finding + generateChecklist's tipo-branch, and its client-side duplicate in
// incorporar/wizard.tsx. Also byte-identical pre vs live today: registro/ and
// precios/. And apps/landing/src/app/api/jurisdictions/route.ts's hardcoded
// comparison table (editorial content, not a runtime branch).
export const LAW_STATUS: LawStatus =
  process.env.NEXT_PUBLIC_LAW_STATUS === "live" ? "live" : "pre";

export const lawIsLive = LAW_STATUS === "live";

/** Pure copy for the home hero's honesty banner + note. Used by page.tsx. */
export function homeLawCopy(
  status: LawStatus,
  es: boolean,
): { banner: string | null; note: string } {
  if (status === "live") {
    return { banner: null, note: es ? "Registro abierto." : "Registration open." };
  }
  return {
    banner: es
      ? "El anteproyecto de Ley de Sociedades está en el Senado. Todavía no es ley."
      : "The draft Companies Law is in the Senate. It is not law yet.",
    note: es
      ? "Generás y operás todo hoy. Registrás el día que sea ley."
      : "Build and operate everything today. Register the day it becomes law.",
  };
}

/** Pure copy for /ley's "Estado" line. Used by ley/page.tsx. */
export function leyEstado(status: LawStatus, es: boolean): string {
  if (status === "live") {
    return es ? "Estado: vigente." : "Status: in force.";
  }
  return es ? "Estado: en el Senado. Todavía no es ley." : "Status: in the Senate. Not law yet.";
}
