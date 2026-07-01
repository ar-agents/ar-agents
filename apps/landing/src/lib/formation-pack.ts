/**
 * Formation Pack: the "open-source bureaucracy hack".
 *
 * One MACHINE-READABLE sidecar is the single source of truth for an entity's
 * legal parameters; the human-facing drafts (estatuto, IGJ guide, AFIP/ARCA alta)
 * are DETERMINISTICALLY RENDERED from it, so the JSON an agent reads and the
 * Spanish a notary reads can never drift. A content hash over the sidecar binds
 * the pack into the signed incorporation audit (tamper-evident provenance).
 *
 * LEGAL GUARDRAIL (HARD): the rendered documents are DRAFTS for review with a
 * matriculated escribano/abogado. They are NOT legal advice and NOT validated.
 * Every document leads with a "BORRADOR NO VALIDADO" banner and the sidecar
 * carries `validated: false`. Go-live on the legal templates is gated on a real
 * AR notary/lawyer sign-off (Ley 25.326 + the sociedades anteproyecto).
 *
 * Pure + deterministic from the input (no time, no randomness, no I/O) EXCEPT
 * packHash (Web-Crypto SHA-256, edge-safe). Reuses incorporate.ts's generators so
 * the checklist matches the rest of the incorporation flow exactly.
 */

import { generateChecklist, slugFor, type IncorporateInput } from "./incorporate";

const SCHEMA_VERSION = 1 as const;

const DISCLAIMER =
  "BORRADOR NO VALIDADO. Documento generado automaticamente como punto de partida. " +
  "No constituye asesoramiento legal. Revisar y validar con un escribano o abogado " +
  "matriculado antes de cualquier uso o presentacion.";

/** The machine-readable single source of truth for the entity's legal params. */
export interface FormationSidecar {
  schemaVersion: typeof SCHEMA_VERSION;
  kind: "ar-agents.formation.sidecar";
  denominacion: string;
  slug: string;
  /** SAS | SRL | SA | SOCIEDAD-IA */
  tipo: string;
  jurisdiction: "AR";
  objeto: string;
  capital: { monto: number; moneda: "ARS" };
  administracion: {
    /** The administration model: an AI agent operating under a human art.102 representative. */
    modelo: "agente-ia-con-representante-art-102";
    /** The human legal representative (self-declared at birth; never authoritative). */
    representanteLegal: { nombre: string; cuit: string } | null;
    nota: string;
  };
  governance: {
    rfc: "rfc-001";
    /** Kill-switch wired to the registry good-standing state (default on). */
    killSwitch: boolean;
    /** Actions that require explicit human approval (art.102 spirit). */
    aprobacionHumanaRequerida: string[];
    guardrails: string[];
  };
  /** The @ar-agents/* operate-rails the entity is wired with. */
  piezas: string[];
  rfcConformance: string[];
  /** Always false until a matriculated professional validates the legal templates. */
  validated: false;
  disclaimer: string;
}

export interface FormationPack {
  sidecar: FormationSidecar;
  documents: {
    /** Draft bylaws (estatuto), AR Spanish, BORRADOR. */
    estatuto: string;
    /** IGJ inscription guide with the prefilled fields, BORRADOR. */
    igj: string;
    /** AFIP/ARCA alta guide with the prefilled fields, BORRADOR. */
    afip: string;
  };
  /** The formation checklist (same prose the rest of the flow uses). */
  checklist: string[];
  /** SHA-256 (hex) over the canonical sidecar; bound into the signed audit. */
  packHash: string;
}

const DEFAULT_APPROVALS = [
  "transferencias por encima del tope configurado",
  "reembolsos y cancelaciones",
  "altas o bajas de medios de pago",
  "cambios de representante o de objeto social",
];

const DEFAULT_GUARDRAILS = [
  "tope de gasto por operacion y diario",
  "kill-switch que suspende la operatoria via estado de registro",
  "registro de auditoria firmado de cada accion con efecto externo",
];

/** Build the deterministic sidecar (the single source of truth). Pure. */
export function buildSidecar(input: IncorporateInput): FormationSidecar {
  const rep =
    input.representante && input.representante.nombre && input.representante.cuit
      ? { nombre: input.representante.nombre, cuit: input.representante.cuit }
      : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: "ar-agents.formation.sidecar",
    denominacion: input.denominacion,
    slug: slugFor(input.denominacion),
    tipo: input.tipo,
    jurisdiction: "AR",
    objeto: input.objeto,
    capital: { monto: input.capitalSocial, moneda: "ARS" },
    administracion: {
      modelo: "agente-ia-con-representante-art-102",
      representanteLegal: rep,
      nota:
        input.tipo === "SOCIEDAD-IA"
          ? "Regimen sociedad-IA pendiente de sancion. Hasta entonces corre bajo SAS estandar con representante humano por RFC-001 seccion 3.1 (espiritu del art. 102 del anteproyecto)."
          : "Administracion operada por un agente bajo la responsabilidad de un representante humano (RFC-001; espiritu del art. 102 del anteproyecto de sociedades).",
    },
    governance: {
      rfc: "rfc-001",
      killSwitch: true,
      aprobacionHumanaRequerida: DEFAULT_APPROVALS,
      guardrails: DEFAULT_GUARDRAILS,
    },
    piezas: [],
    rfcConformance: ["rfc-001-v1"],
    validated: false,
    disclaimer: DISCLAIMER,
  };
}

// ── Canonical JSON + SHA-256 (edge-safe, key-sorted) ───────────────────────────

function canonical(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new TypeError("canonical: non-finite number");
    return JSON.stringify(value);
  }
  if (t === "string" || t === "boolean") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonical(v)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(",")}}`;
}

/** SHA-256 (hex) over the canonical sidecar. Deterministic; edge-safe Web Crypto. */
export async function packHash(sidecar: FormationSidecar): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(sidecar));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const arr = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < arr.length; i++) hex += arr[i]!.toString(16).padStart(2, "0");
  return hex;
}

// ── Deterministic document renderers (AR Spanish, BORRADOR, no em dashes) ───────

const BANNER = (title: string): string =>
  `=== ${title} ===\n${DISCLAIMER}\n${"=".repeat(60)}\n`;

/**
 * Enforce the NO-EM-DASH hard rule on RENDERED human documents. User free-text
 * (objeto / denominacion / representante.nombre) is interpolated into the drafts,
 * and a user could supply a Unicode dash (U+2010..U+2015), so we transliterate any
 * such dash to an ASCII hyphen in the rendered output. The SIDECAR keeps the raw
 * input verbatim (it is machine data and its packHash must reflect true input);
 * only the human-facing Spanish drafts are de-dashed.
 */
function deDash(s: string): string {
  return s.replace(/[‐-―]/g, "-");
}

const tipoLabel = (tipo: string): string =>
  tipo === "SOCIEDAD-IA"
    ? "Sociedad por Acciones Simplificada (SAS), encuadre provisorio hasta la sancion del regimen sociedad-IA"
    : tipo;

/** Draft bylaws. A SCAFFOLD with the governance clauses + placeholders for a notary. */
export function renderEstatutoDraft(s: FormationSidecar): string {
  const rep = s.administracion.representanteLegal;
  const repLine = rep
    ? `${rep.nombre} (CUIT ${rep.cuit}), caracter declarado (no verificado)`
    : "[COMPLETAR: nombre y CUIT del representante legal]";
  return deDash(
    BANNER("ESTATUTO SOCIAL (BORRADOR)") +
    `\nDENOMINACION: ${s.denominacion}\n` +
    `TIPO: ${tipoLabel(s.tipo)}\n` +
    `JURISDICCION: Republica Argentina\n\n` +
    `ARTICULO 1 (Denominacion y tipo). La sociedad gira bajo la denominacion "${s.denominacion}", ` +
    `bajo el tipo ${tipoLabel(s.tipo)}.\n\n` +
    `ARTICULO 2 (Objeto). La sociedad tiene por objeto: ${s.objeto}\n\n` +
    `ARTICULO 3 (Capital). El capital social se fija en ${s.capital.moneda} ${s.capital.monto}. ` +
    `[COMPLETAR: division en acciones/cuotas, integracion y aportes de los socios.]\n\n` +
    `ARTICULO 4 (Administracion). La operatoria es ejecutada por un agente de software ` +
    `bajo la responsabilidad de un representante legal humano. Representante: ${repLine}. ` +
    `Modelo: ${s.administracion.modelo}. ${s.administracion.nota}\n\n` +
    `ARTICULO 5 (Gobierno y controles, RFC-001). El agente opera con: ` +
    `(a) kill-switch ${s.governance.killSwitch ? "activo" : "inactivo"} que suspende la operatoria via el estado de registro; ` +
    `(b) aprobacion humana obligatoria para: ${s.governance.aprobacionHumanaRequerida.join("; ")}; ` +
    `(c) ${s.governance.guardrails.join("; ")}. ` +
    `Cada accion con efecto externo se registra en un log de auditoria firmado.\n\n` +
    `ARTICULO 6 (Representacion). El representante legal humano responde frente a terceros ` +
    `por los actos del agente, conforme RFC-001 y el espiritu del art. 102 del anteproyecto.\n\n` +
    `[COMPLETAR con un escribano: sede social, plazo, cierre de ejercicio, organo de fiscalizacion, ` +
    `clausulas de transferencia, y la nomina e integracion de socios.]\n`
  );
}

/** IGJ inscription guide + prefilled fields. */
export function renderIgjGuideDraft(s: FormationSidecar): string {
  return deDash(
    BANNER("GUIA DE INSCRIPCION IGJ (BORRADOR)") +
    `\nCAMPOS PRECARGADOS (verificar antes de presentar):\n` +
    `- Denominacion: ${s.denominacion}\n` +
    `- Tipo societario: ${tipoLabel(s.tipo)}\n` +
    `- Objeto: ${s.objeto}\n` +
    `- Capital social: ${s.capital.moneda} ${s.capital.monto}\n` +
    `- Representante legal: ${s.administracion.representanteLegal?.nombre ?? "[COMPLETAR]"}\n\n` +
    `PASOS:\n` +
    `1. Reservar la denominacion en IGJ (verificar homonimia).\n` +
    `2. Otorgar el estatuto ante escribano (usar el borrador de estatuto de este pack como base).\n` +
    `3. Integrar el capital y obtener el comprobante.\n` +
    `4. Presentar la inscripcion via TAD (Tramites a Distancia) con la documentacion.\n` +
    `5. Antes de presentar, correr el tool validate_igj_inscription para evitar el ~30% de rechazos mecanicos.\n` +
    `[COMPLETAR: sede social y datos de los socios faltan en este borrador.]\n`
  );
}

/** AFIP/ARCA alta guide + prefilled fields. */
export function renderAfipAltaDraft(s: FormationSidecar): string {
  const rep = s.administracion.representanteLegal;
  return deDash(
    BANNER("GUIA DE ALTA AFIP/ARCA (BORRADOR)") +
    `\nCAMPOS PRECARGADOS (verificar antes de tramitar):\n` +
    `- Denominacion: ${s.denominacion}\n` +
    `- Representante (Clave Fiscal): ${rep?.nombre ?? "[COMPLETAR]"} ` +
    `CUIT ${rep?.cuit ?? "[COMPLETAR]"} (declarado, no verificado)\n` +
    `- Actividad sugerida: servicios informaticos / desarrollo de software\n\n` +
    `PASOS:\n` +
    `1. Obtener el CUIT de la sociedad una vez inscripta en IGJ.\n` +
    `2. En ARCA, Clave Fiscal, asociar el servicio web 'Asociar Servicio Web' y habilitar ` +
    `'wsfe' (facturacion electronica) y 'ws_sr_constancia_inscripcion' (constancia).\n` +
    `3. Generar el certificado X.509 y descargar cert + key para cargarlos en el .env del agente.\n` +
    `4. Definir el encuadre impositivo (monotributo o responsable inscripto) con un contador.\n` +
    `[COMPLETAR con un contador: encuadre impositivo y actividad principal definitiva.]\n`
  );
}

/**
 * Build the full Formation Pack from the incorporation input. Async only because
 * packHash uses Web Crypto. The sidecar carries the resolved piezas (passed in so
 * the pack matches the scaffold exactly).
 */
export async function buildFormationPack(
  input: IncorporateInput,
  opts?: { piezas?: string[] },
): Promise<FormationPack> {
  const sidecar = buildSidecar(input);
  if (opts?.piezas) sidecar.piezas = opts.piezas;
  const documents = {
    estatuto: renderEstatutoDraft(sidecar),
    igj: renderIgjGuideDraft(sidecar),
    afip: renderAfipAltaDraft(sidecar),
  };
  return {
    sidecar,
    documents,
    checklist: generateChecklist(input),
    packHash: await packHash(sidecar),
  };
}

/** Re-render the documents from a stored sidecar (single-source: docs never drift). */
export function renderDocumentsFromSidecar(s: FormationSidecar): FormationPack["documents"] {
  return {
    estatuto: renderEstatutoDraft(s),
    igj: renderIgjGuideDraft(s),
    afip: renderAfipAltaDraft(s),
  };
}
