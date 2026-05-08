/**
 * Severity heuristic for Domicilio Electrónico notifications.
 *
 * The DEC inbox is a noisy stream — courtesy notices, acuses de recibo,
 * actual binding notifications. The agent needs a triage signal so it can
 * prioritise responses to legally-binding deadlines and ignore informational
 * spam.
 *
 * The heuristic is intentionally conservative: when in doubt, escalate.
 * False positives (calling something critical when it's only important)
 * waste agent cycles; false negatives (missing a critical deadline) cost
 * the sociedad-IA real money or its registration.
 */

const ORGANISM_RULES: Array<{ match: RegExp; level: "critical" | "important" }> = [
  { match: /\b(arca|afip)\b/i, level: "critical" },
  { match: /\b(igj|registro\s+publico|inspeccion)\b/i, level: "critical" },
  { match: /\baduana\b/i, level: "critical" },
  { match: /\b(ministerio\s+de\s+trabajo|trabajo)\b/i, level: "important" },
  { match: /\banses\b/i, level: "important" },
  { match: /\bbcra\b/i, level: "important" },
];

const SUBJECT_KEYWORDS_CRITICAL: RegExp[] = [
  /intimaci[oó]n/i,
  /vista\s+previa/i,
  /requerimiento/i,
  /sumario/i,
  /clausura/i,
  /multa/i,
  /sanci[oó]n/i,
  /audiencia/i,
  /apercibimiento/i,
  /traslado/i,
  /baja\s+(de\s+)?inscripci[oó]n/i,
];

const SUBJECT_KEYWORDS_IMPORTANT: RegExp[] = [
  /resoluci[oó]n/i,
  /providencia/i,
  /constataci[oó]n/i,
  /verificaci[oó]n/i,
  /informe/i,
  /vencimiento/i,
];

const SUBJECT_KEYWORDS_INFO: RegExp[] = [
  /acuse\s+de\s+recibo/i,
  /confirmaci[oó]n/i,
  /notificaci[oó]n\s+de\s+cortes[ií]a/i,
  /aviso\s+(de\s+)?lectura/i,
  /circular/i,
];

/**
 * Compute a severity given the issuing organism, subject, and (optionally)
 * an explicit response-due date.
 */
export function computeSeverity(input: {
  organism: string;
  subject: string;
  responseDueBy: string | null;
}): "critical" | "important" | "info" {
  const { organism, subject, responseDueBy } = input;

  // 1. Hard signals: explicit response deadline → at least important.
  const hasDeadline =
    !!responseDueBy && !Number.isNaN(Date.parse(responseDueBy));

  // 2. Subject-keyword scan.
  if (SUBJECT_KEYWORDS_CRITICAL.some((rx) => rx.test(subject))) {
    return "critical";
  }
  if (SUBJECT_KEYWORDS_INFO.some((rx) => rx.test(subject)) && !hasDeadline) {
    return "info";
  }

  // 3. Organism-level prior.
  const organismRule = ORGANISM_RULES.find((r) => r.match.test(organism));
  const organismLevel = organismRule?.level;

  // 4. Combine.
  if (organismLevel === "critical" && hasDeadline) return "critical";
  if (organismLevel === "critical") return "important";
  if (SUBJECT_KEYWORDS_IMPORTANT.some((rx) => rx.test(subject))) {
    return hasDeadline ? "important" : "info";
  }
  if (organismLevel === "important") return hasDeadline ? "important" : "info";
  if (hasDeadline) return "important";
  return "info";
}
