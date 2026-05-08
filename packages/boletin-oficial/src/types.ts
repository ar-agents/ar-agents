/**
 * Public types for `@ar-agents/boletin-oficial`.
 *
 * The Boletín Oficial publishes four daily *secciones*. Most regtech /
 * compliance use cases want Sección Segunda (sociedades) or Sección Primera
 * (decrees / resoluciones / leyes); Tercera covers public-sector
 * contracting, Cuarta covers judicial notices.
 */

/**
 * The four secciones published daily.
 *
 * - **primera** — Legislación y avisos oficiales: leyes, decretos del PEN,
 *   resoluciones ministeriales, comunicaciones BCRA, designaciones,
 *   decisiones administrativas.
 * - **segunda** — Sociedades: constituciones, modificaciones, reformas
 *   estatutarias, transferencias, fusiones, balances, asambleas.
 * - **tercera** — Contrataciones del Estado: licitaciones, concursos,
 *   contrataciones directas.
 * - **cuarta** — Avisos judiciales: edictos, sucesiones, prescripciones
 *   adquisitivas, citaciones.
 */
export type BoSeccion = "primera" | "segunda" | "tercera" | "cuarta";

/**
 * Coarse classifier of a norma's *type*. Driven by the heading of the
 * notice — useful when you need to route by impact level.
 *
 * - **ley** — Sancionada por Congreso. Highest weight.
 * - **decreto** — DNU or decreto del PEN.
 * - **resolucion** — Resolución de un ministerio o organismo.
 * - **disposicion** — Acto de un funcionario inferior.
 * - **comunicacion** — BCRA / SSN circulars.
 * - **decision_administrativa** — Jefatura de Gabinete.
 * - **sociedad** — Aviso societario (Sección Segunda).
 * - **contratacion** — Licitación / concurso (Sección Tercera).
 * - **edicto** — Aviso judicial (Sección Cuarta).
 * - **otro** — Anything else.
 */
export type NormaTipo =
  | "ley"
  | "decreto"
  | "resolucion"
  | "disposicion"
  | "comunicacion"
  | "decision_administrativa"
  | "sociedad"
  | "contratacion"
  | "edicto"
  | "otro";

/**
 * A single norma (notice/article) as published in the Boletín Oficial.
 *
 * `id` is the BO's internal identifier; pair with `seccion` and
 * `fechaPublicacion` to construct the canonical URL:
 * `https://www.boletinoficial.gob.ar/detalleAviso/{seccion}/{id}/{YYYYMMDD}`.
 */
export interface Norma {
  /** BO internal identifier — present in URL as `detalleAviso/{seccion}/{id}/...`. */
  id: string;
  /** Daily sección the norma appeared in. */
  seccion: BoSeccion;
  /** Coarse classification driven by the heading. */
  tipo: NormaTipo;
  /** Full title as published, e.g., "RESOLUCIÓN GENERAL Nº 5612/2026". */
  titulo: string;
  /** Issuing organism, e.g., "ARCA", "BCRA", "MINISTERIO DE ECONOMÍA". */
  organismo?: string;
  /**
   * Norma-level number, when typeable from the title. Present for leyes,
   * decretos, resoluciones; absent for sociedad / edicto / contratación.
   */
  numero?: string;
  /** Publication date in ISO 8601 (`YYYY-MM-DD`). */
  fechaPublicacion: string;
  /** Norma date when distinct from publication (e.g., "firmada el 30/03/2026"). */
  fechaNorma?: string;
  /** Plaintext body extracted from the publication. */
  texto?: string;
  /**
   * CUITs mentioned in the body. Useful for matching against subscriptions.
   * The fetcher tries to extract these heuristically — verify with a CUIT
   * validator before acting on them.
   */
  cuitsMencionados?: string[];
  /** Canonical URL to the BO detail page. */
  url: string;
  /** Raw fields from the source response, for forward-compat. */
  raw?: Record<string, unknown>;
}

/** Search filter passed to the fetcher. */
export interface SearchQuery {
  /** Limit results to one or more secciones. */
  secciones?: BoSeccion[];
  /**
   * Free-text query — interpreted in the fetcher's native search engine
   * (typically a substring match against title + body).
   */
  query?: string;
  /**
   * Restrict to publications on or after this ISO date.
   * Format: `YYYY-MM-DD`. Defaults to "today" when both `from` and
   * `to` are omitted.
   */
  from?: string;
  /** Restrict to publications on or before this ISO date. */
  to?: string;
  /** Filter by emitting organism (substring match against `organismo`). */
  organismo?: string;
  /** Filter to results mentioning a specific CUIT. */
  cuit?: string;
  /** Pagination cursor. Format defined by the fetcher. */
  cursor?: string;
  /** Page size. Default 20, max 100. */
  pageSize?: number;
}

export interface SearchResult {
  results: Norma[];
  /** Total matches (when the fetcher knows). May be undefined for cursor-paged backends. */
  total?: number;
  /** Cursor for the next page. `null` when there's no more. */
  nextCursor: string | null;
  /**
   * Source the results came from. `"live"` = real BO endpoint; `"mock"` =
   * stubbed by `MockBoFetcher`; `"unconfigured"` = no real fetch was made.
   */
  source: "live" | "mock" | "unconfigured";
}

/**
 * Subscription record. Stored by a `BoSubscriptionAdapter`. The matcher
 * runs each new norma against every active subscription and emits a
 * `BoMatch` for hits.
 */
export interface BoSubscription {
  id: string;
  /** Owner identifier (your app's user, tenant, etc.). */
  ownerId: string;
  /** What to match against. At least one of these must be set. */
  match: {
    keyword?: string;
    cuit?: string;
    organismo?: string;
    seccion?: BoSeccion;
    tipo?: NormaTipo;
  };
  /** Per-subscription metadata for your app to use later. */
  payload?: Record<string, unknown>;
  createdAt: number;
  /** Whether the subscription is active. */
  active: boolean;
}

export interface BoMatch {
  subscription: BoSubscription;
  norma: Norma;
  /** Why this norma matched — human-readable, for surfacing back to the user. */
  reason: string;
}
