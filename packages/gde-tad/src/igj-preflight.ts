/**
 * Pre-flight validator for IGJ inscription / SAS / SRL forms.
 *
 * IGJ (Inspección General de Justicia) rejects ~30% of inscription requests
 * on first submission for predictable, mechanical reasons (name conflicts,
 * missing required fields, malformed CUIT, out-of-range capital). Catching
 * those locally before TAD submit saves 5–10 working days per round-trip.
 *
 * This is not exhaustive — it's the rules we have hit ourselves or that
 * IGJ's public guidance documents call out. Findings with severity "error"
 * MUST be fixed; "warning" findings are likely-but-not-certain rejections.
 */

import { normalizeCuit } from "./cuit";
import type { IgjInscriptionPreflight } from "./types";

/**
 * Inputs we validate. Mirrors the IGJ "Constitución de Sociedad" form
 * surface but strips the parts that don't affect rejection probability.
 */
export interface IgjInscriptionInput {
  /** Proposed corporate name. */
  denominacion: string;
  /** Corporate type. */
  type: "SAS" | "SRL" | "SA" | "SOCIEDAD-IA";
  /** Sede social (legal address). */
  sede: {
    calle: string;
    numero: string;
    ciudad: string;
    provincia: string;
    cpa: string;
  };
  /** Capital social in ARS. */
  capitalSocial: number;
  /** Objeto social — what the company does. */
  objeto: string;
  /**
   * Constituyentes (founders). At least one human is currently required;
   * RFC-001 § 3.4 proposes lifting this for sociedades-IA.
   */
  constituyentes: Array<{
    cuit: string;
    razonSocial?: string;
    apellido?: string;
    nombre?: string;
    /** Aporte de capital in ARS for this constituyente. */
    aporte: number;
  }>;
  /**
   * Optional flag: when true, runs the sociedad-IA-specific rule set
   * (RFC-001 § 3.4). Without the flag we apply standard SA/SRL/SAS rules.
   */
  sociedadIa?: boolean;
}

const TIPOS_VALIDOS = new Set(["SAS", "SRL", "SA", "SOCIEDAD-IA"]);

const MIN_CAPITAL_BY_TYPE: Record<string, number> = {
  SAS: 100_000,
  SRL: 100_000,
  SA: 30_000_000,
  // RFC-001 § 3.4 proposes 1 ARS minimum, signalling token-economic flexibility.
  "SOCIEDAD-IA": 1,
};

/** Forbidden words in denominación (IGJ public-policy list). */
const DENOMINACION_FORBIDDEN: RegExp[] = [
  /\bnacional\b/i,
  /\bestatal\b/i,
  /\bgobierno\b/i,
  /\bestado\b/i,
  /\boficial\b/i,
];

export function validateIgjInscription(
  input: IgjInscriptionInput,
): IgjInscriptionPreflight {
  const findings: IgjInscriptionPreflight["findings"] = [];

  // ── Denominación ────────────────────────────────────────────────────────
  if (!input.denominacion || input.denominacion.trim().length < 3) {
    findings.push({
      code: "denominacion_too_short",
      severity: "error",
      field: "denominacion",
      message:
        "La denominación debe tener al menos 3 caracteres y no puede estar vacía.",
    });
  } else if (input.denominacion.trim().length > 200) {
    findings.push({
      code: "denominacion_too_long",
      severity: "error",
      field: "denominacion",
      message: "La denominación no puede superar los 200 caracteres.",
    });
  } else {
    for (const rx of DENOMINACION_FORBIDDEN) {
      if (rx.test(input.denominacion)) {
        findings.push({
          code: "denominacion_reserved_word",
          severity: "error",
          field: "denominacion",
          message: `La denominación contiene una palabra reservada por IGJ (${rx.source}).`,
        });
        break;
      }
    }
  }

  // ── Tipo societario ─────────────────────────────────────────────────────
  if (!TIPOS_VALIDOS.has(input.type)) {
    findings.push({
      code: "tipo_invalido",
      severity: "error",
      field: "type",
      message: `Tipo societario "${input.type}" no es válido. Use SAS, SRL, SA o SOCIEDAD-IA.`,
    });
  }
  if (input.type === "SOCIEDAD-IA" && !input.sociedadIa) {
    findings.push({
      code: "sociedad_ia_flag_missing",
      severity: "warning",
      field: "sociedadIa",
      message:
        "Tipo SOCIEDAD-IA seleccionado pero el flag sociedadIa no está activo. RFC-001 § 3.4 — confirme que conoce el régimen.",
    });
  }

  // ── Sede social ─────────────────────────────────────────────────────────
  const requiredSede: Array<keyof IgjInscriptionInput["sede"]> = [
    "calle",
    "numero",
    "ciudad",
    "provincia",
    "cpa",
  ];
  for (const f of requiredSede) {
    if (!input.sede?.[f] || String(input.sede[f]).trim() === "") {
      findings.push({
        code: "sede_field_missing",
        severity: "error",
        field: `sede.${f}`,
        message: `Falta el campo de sede social: ${f}.`,
      });
    }
  }
  if (input.sede?.cpa && !/^[A-Z]?\d{4}[A-Z]{0,3}$/.test(input.sede.cpa)) {
    findings.push({
      code: "cpa_format",
      severity: "warning",
      field: "sede.cpa",
      message:
        "El CPA no sigue el formato AR estándar (ej. C1043AAZ). IGJ acepta el código postal de 4 dígitos pero sugiere CPA.",
    });
  }

  // ── Capital social ──────────────────────────────────────────────────────
  if (typeof input.capitalSocial !== "number" || input.capitalSocial <= 0) {
    findings.push({
      code: "capital_invalid",
      severity: "error",
      field: "capitalSocial",
      message: "El capital social debe ser un número mayor a 0.",
    });
  } else {
    const min = MIN_CAPITAL_BY_TYPE[input.type] ?? 100_000;
    if (input.capitalSocial < min) {
      findings.push({
        code: "capital_below_minimum",
        severity: "error",
        field: "capitalSocial",
        message: `Capital social $${input.capitalSocial.toLocaleString("es-AR")} es menor al mínimo para ${input.type} ($${min.toLocaleString("es-AR")}).`,
      });
    }
  }

  // ── Objeto ──────────────────────────────────────────────────────────────
  if (!input.objeto || input.objeto.trim().length < 20) {
    findings.push({
      code: "objeto_too_short",
      severity: "error",
      field: "objeto",
      message:
        "El objeto social debe describir las actividades en al menos 20 caracteres. IGJ rechaza objetos genéricos.",
    });
  }

  // ── Constituyentes ──────────────────────────────────────────────────────
  if (!input.constituyentes?.length) {
    findings.push({
      code: "no_constituyentes",
      severity: "error",
      field: "constituyentes",
      message: "Debe haber al menos un constituyente.",
    });
  } else {
    let aporteSum = 0;
    for (let i = 0; i < input.constituyentes.length; i++) {
      const c = input.constituyentes[i]!;
      if (!c.cuit || !/^\d{11}$/.test(normalizeCuit(c.cuit))) {
        findings.push({
          code: "constituyente_cuit_invalid",
          severity: "error",
          field: `constituyentes[${i}].cuit`,
          message: `CUIT del constituyente #${i + 1} es inválido.`,
        });
      }
      if (typeof c.aporte !== "number" || c.aporte <= 0) {
        findings.push({
          code: "constituyente_aporte_invalid",
          severity: "error",
          field: `constituyentes[${i}].aporte`,
          message: `Aporte del constituyente #${i + 1} debe ser > 0.`,
        });
      } else {
        aporteSum += c.aporte;
      }
    }
    if (
      typeof input.capitalSocial === "number" &&
      input.capitalSocial > 0 &&
      Math.abs(aporteSum - input.capitalSocial) > 1
    ) {
      findings.push({
        code: "aporte_total_mismatch",
        severity: "error",
        field: "constituyentes",
        message: `La suma de aportes ($${aporteSum.toLocaleString("es-AR")}) no coincide con el capital social ($${input.capitalSocial.toLocaleString("es-AR")}).`,
      });
    }
  }

  return {
    valid: !findings.some((f) => f.severity === "error"),
    findings,
  };
}
