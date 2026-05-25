/**
 * INPI types.
 *
 * Argentine trademark registry. Registrations use the Nice classification
 * (1-45). A given denomination may have separate registrations per class.
 *
 * Status enumeration mirrors INPI's "estado" field:
 *   - presentada     — application submitted
 *   - publicada      — published in Boletín de Marcas (opposition window open)
 *   - oposicion      — under opposition
 *   - concedida      — granted (10 years from concession date)
 *   - rechazada      — rejected
 *   - abandonada     — abandoned (e.g. fees not paid)
 *   - extinguida     — expired without renewal
 *   - en_renovacion  — renewal in flight
 */

export type TrademarkStatus =
  | "presentada"
  | "publicada"
  | "oposicion"
  | "concedida"
  | "rechazada"
  | "abandonada"
  | "extinguida"
  | "en_renovacion";

export interface TrademarkRecord {
  /** INPI registration number (acta), e.g. "3792456". */
  acta: string;
  denomination: string;
  /** Nice class, 1-45. */
  niceClass: number;
  status: TrademarkStatus;
  /** Holder name (persona o sociedad). */
  holder: string;
  /** YYYY-MM-DD when the application was submitted. */
  presentedAt?: string;
  /** YYYY-MM-DD when the registration was granted. */
  grantedAt?: string;
  /** YYYY-MM-DD when the current registration expires (10 years from grant). */
  expiresAt?: string;
  /** Optional INPI-issued note. */
  note?: string;
}

export interface SearchInput {
  /** Substring to match in `denomination`. Case insensitive. */
  q: string;
  /** Filter by Nice class, optional. */
  niceClass?: number | undefined;
  /** Filter by status, optional. */
  status?: TrademarkStatus | undefined;
  /** Max results per call, default 25, max 100. */
  limit?: number | undefined;
}

export interface SearchResult {
  query: SearchInput;
  records: TrademarkRecord[];
  hasMore: boolean;
}
