/**
 * Public types for `@ar-agents/gde-tad`.
 *
 * TAD (Trámites a Distancia, https://tramitesadistancia.gob.ar) is the AR
 * national portal where citizens and businesses file federal-government
 * forms — IGJ inscriptions, AFIP padron updates, ministry-level
 * authorizations, etc. GDE (Gestión Documental Electrónica) is the
 * back-office system that holds the resulting expediente. From an
 * agent's POV the relevant surfaces are:
 *
 *   - **Domicilio Electrónico Constituido (DEC)** — every legally-
 *     registered AR business has a DEC. Notifications from any federal
 *     organism (ARCA, IGJ, AFIP, Aduana, Trabajo, ANSES) are delivered
 *     to the DEC mailbox; from a sociedad-IA standpoint, the agent
 *     MUST poll this to stay legally informed.
 *
 *   - **Mis Trámites** — read-only listing of all expedientes the
 *     authenticated identity is a party to, with status + last update.
 *
 *   - **Carátulas variables** — each trámite type has a JSON-Schema-
 *     equivalent form. The agent renders, fills, and submits.
 *
 * As of 2026-05, this package ships:
 *   - Read-only adapters (Domicilio Electrónico, Mis Trámites)
 *   - Pre-flight schema validation for IGJ inscription
 *   - Authentication flow scaffolding (delegates to
 *     `@ar-agents/mi-argentina`)
 *
 * Write operations (filing trámites) are NOT yet implemented — they
 * require a per-organism integration the AR government is still rolling
 * out. See RFC-001 § 3.4 for the timeline + governance plan.
 */

/** "homo" routes to TAD's training environment; "prod" hits the real one. */
export type TadEnv = "homo" | "prod";

/** Status codes seen on an expediente in Mis Trámites. */
export type TramiteStatus =
  | "iniciado"
  | "tramitacion"
  | "subsanacion"
  | "resuelto-favorable"
  | "resuelto-desfavorable"
  | "archivado"
  | "desistido";

/** A single inbox notification from the Domicilio Electrónico. */
export interface DomicilioNotification {
  /** Stable notification ID assigned by GDE. */
  id: string;
  /** Issuing organism (ARCA, IGJ, AFIP, Aduana, etc.). */
  organism: string;
  /** Subject line as shown in the DEC inbox. */
  subject: string;
  /** Notification ISO date. */
  notifiedAt: string;
  /** ISO date by which the recipient must respond. May be null. */
  responseDueBy: string | null;
  /** Notification body — full text, may contain attachments references. */
  body: string;
  /** Has the agent acknowledged receipt? Acknowledgment is irreversible. */
  acknowledged: boolean;
  /**
   * Severity heuristic computed on the agent side. "critical" means there
   * is a binding deadline and missing it has legal consequences. "info"
   * means courtesy notice (no action required).
   */
  severity: "critical" | "important" | "info";
}

/** A trámite the authenticated identity is a party to. */
export interface Tramite {
  /** Expediente number (AR official format e.g., "EX-2026-12345-APN-DGD#MI"). */
  numero: string;
  /** Trámite type (CUIT inscription, IGJ inscription, etc.). */
  type: string;
  /** Issuing organism. */
  organism: string;
  status: TramiteStatus;
  startedAt: string;
  lastUpdatedAt: string;
  /** Brief one-line status description from the organism. */
  lastStatusNote: string | null;
  /** URL to the public TAD page for the expediente, when available. */
  publicUrl: string | null;
}

/** Result of a Domicilio Electrónico inbox poll. */
export interface DomicilioInboxResult {
  /** CUIT of the entity whose inbox was polled. */
  cuit: string;
  /** Whether the request was authenticated successfully. */
  available: boolean;
  /** Error description, when available is false. */
  error: string | null;
  /** Notifications sorted newest first. */
  notifications: DomicilioNotification[];
}

/** Result of a Mis Trámites listing. */
export interface MisTramitesResult {
  cuit: string;
  available: boolean;
  error: string | null;
  tramites: Tramite[];
}

/** Pre-flight check result for IGJ inscription. */
export interface IgjInscriptionPreflight {
  /** Whether the proposed payload would clear AR's known validation rules. */
  valid: boolean;
  /** Per-rule findings — empty iff valid. */
  findings: Array<{
    code: string;
    severity: "error" | "warning";
    field: string;
    message: string;
  }>;
}

/** Adapter contract for Domicilio Electrónico inbox access. */
export interface DomicilioAdapter {
  /** List notifications. Implementations should normalize errors as `available:false`. */
  list(cuit: string): Promise<DomicilioInboxResult>;
}

/** Adapter contract for Mis Trámites listing. */
export interface TramitesAdapter {
  /** List trámites for a given CUIT. */
  list(cuit: string): Promise<MisTramitesResult>;
}
