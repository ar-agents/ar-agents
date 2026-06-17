/**
 * Sección catalog + heading-based classifier.
 *
 * The Boletín Oficial doesn't tag normas with structured types — the only
 * signal is the heading text ("LEY 27.123", "DECRETO 412/2026",
 * "RESOLUCIÓN GENERAL Nº 5612/2026", "AVISO COMERCIAL", etc.). The
 * classifier here is heuristic; it covers the patterns observed in
 * practice and falls back to "otro" when uncertain.
 */

import type { BoSeccion, NormaTipo } from "./types";

/** Canonical sección codes the BO uses in URLs (`detalleAviso/{seccion}/...`). */
export const SECCIONES: ReadonlyArray<BoSeccion> = [
  "primera",
  "segunda",
  "tercera",
  "cuarta",
];

/** Human-readable name for a sección. */
export function describeSeccion(seccion: BoSeccion): string {
  switch (seccion) {
    case "primera":
      return "Sección Primera — Legislación y Avisos Oficiales";
    case "segunda":
      return "Sección Segunda — Sociedades";
    case "tercera":
      return "Sección Tercera — Contrataciones del Estado";
    case "cuarta":
      return "Sección Cuarta — Avisos Judiciales";
  }
}

/**
 * Classify a norma's tipo from its heading text. The classifier is
 * deliberately conservative — when in doubt, returns `"otro"`. Pair with
 * `seccion` to reduce ambiguity (e.g., a heading "AVISO" in seccion
 * "segunda" is "sociedad", but in "cuarta" it's "edicto").
 */
export function classifyTipo(titulo: string, seccion: BoSeccion): NormaTipo {
  const t = titulo.trim().toUpperCase();

  if (/^LEY\b/.test(t) || /\bLEY N[ºO°]?\s?\d/.test(t)) return "ley";
  if (/^DECRETO\b/.test(t) || /\bDNU\b/.test(t)) return "decreto";
  if (/^DECISI[ÓO]N ADMINISTRATIVA\b/.test(t)) return "decision_administrativa";
  if (/^RESOLUCI[ÓO]N\b/.test(t)) return "resolucion";
  if (/^DISPOSICI[ÓO]N\b/.test(t)) return "disposicion";
  if (/^COMUNICACI[ÓO]N\b/.test(t) || /\b(BCRA|S\.S\.N\.?)\b/.test(t)) {
    return "comunicacion";
  }

  if (seccion === "segunda") return "sociedad";
  if (seccion === "tercera") return "contratacion";
  if (seccion === "cuarta") return "edicto";

  return "otro";
}

/**
 * Extract heuristically-found CUITs from a body of text. Returns
 * normalized 11-digit strings. False positives are possible (any 11-digit
 * sequence matches) — caller should validate with a CUIT validator
 * before acting on the values.
 */
export function extractCuits(text: string): string[] {
  const seen = new Set<string>();
  // Pattern matches: 20-12345678-6 / 20.12345678.6 / 20 12345678 6 / 20123456786
  const pattern = /\b(2[03457]|3[034])[\s.-]?(\d{8})[\s.-]?(\d)\b/g;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(text)) !== null) {
    seen.add(`${m[1]}${m[2]}${m[3]}`);
  }
  return Array.from(seen);
}

/**
 * Build the canonical detail URL for a norma:
 *   https://www.boletinoficial.gob.ar/detalleAviso/{seccion}/{id}/{YYYYMMDD}
 *
 * Pure function; no I/O. Caller controls the date format input — pass an
 * ISO `YYYY-MM-DD` string (the function strips the dashes).
 */
export function buildNormaUrl(seccion: BoSeccion, id: string, fechaIso: string): string {
  const ymd = fechaIso.replace(/-/g, "").slice(0, 8);
  return `https://www.boletinoficial.gob.ar/detalleAviso/${seccion}/${encodeURIComponent(id)}/${ymd}`;
}
