/**
 * Pre-flight validation for `SolicitarCaeInput`. Catches the most common
 * AFIP rejection reasons LOCALLY so you don't burn a network round-trip on
 * a malformed request.
 *
 * The list here is curated from real production rejection patterns — every
 * check corresponds to an AFIP error code documented in `AGENTS.md`.
 *
 * Returns `{ valid: true }` when the input is internally consistent;
 * returns `{ valid: false, errors: [...] }` with Spanish-language error
 * messages otherwise.
 */

import type { SolicitarCaeInput } from "./types";
import { CbteTipo, Concepto } from "./catalogs";

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

const FACTURA_C_TYPES = new Set<number>([
  CbteTipo.FACTURA_C,
  CbteTipo.NOTA_DEBITO_C,
  CbteTipo.NOTA_CREDITO_C,
  CbteTipo.RECIBO_C,
  CbteTipo.FCE_FACTURA_C,
  CbteTipo.FCE_NOTA_DEBITO_C,
  CbteTipo.FCE_NOTA_CREDITO_C,
]);

const NOTA_TYPES = new Set<number>([
  CbteTipo.NOTA_DEBITO_A,
  CbteTipo.NOTA_CREDITO_A,
  CbteTipo.NOTA_DEBITO_B,
  CbteTipo.NOTA_CREDITO_B,
  CbteTipo.NOTA_DEBITO_C,
  CbteTipo.NOTA_CREDITO_C,
  CbteTipo.NOTA_DEBITO_M,
  CbteTipo.NOTA_CREDITO_M,
  CbteTipo.FCE_NOTA_DEBITO_A,
  CbteTipo.FCE_NOTA_CREDITO_A,
  CbteTipo.FCE_NOTA_DEBITO_B,
  CbteTipo.FCE_NOTA_CREDITO_B,
  CbteTipo.FCE_NOTA_DEBITO_C,
  CbteTipo.FCE_NOTA_CREDITO_C,
]);

/**
 * Validate a `SolicitarCaeInput` against AFIP's known constraints. Run this
 * BEFORE calling `solicitarCAE()` to catch errors locally.
 *
 * @example
 * ```ts
 * const v = validateSolicitarCae(input);
 * if (!v.valid) {
 *   throw new WsfeValidationError(
 *     `Factura inválida: ${v.errors.map(e => e.message).join("; ")}`,
 *     v.errors,
 *   );
 * }
 * await wsfe.solicitarCAE(input);
 * ```
 */
export function validateSolicitarCae(
  input: SolicitarCaeInput,
): ValidationResult {
  const errors: ValidationError[] = [];

  // ---- ptoVta ----
  if (!Number.isInteger(input.ptoVta) || input.ptoVta < 1 || input.ptoVta > 99999) {
    errors.push({
      field: "ptoVta",
      message: `Punto de venta inválido (${input.ptoVta}). Debe ser un entero entre 1 y 99999.`,
    });
  }

  // ---- cbteDesde / cbteHasta ----
  if (!Number.isInteger(input.cbteDesde) || input.cbteDesde < 1) {
    errors.push({
      field: "cbteDesde",
      message: `Número de comprobante desde inválido (${input.cbteDesde}). Debe ser un entero >= 1.`,
    });
  }
  if (!Number.isInteger(input.cbteHasta) || input.cbteHasta < input.cbteDesde) {
    errors.push({
      field: "cbteHasta",
      message: `Número de comprobante hasta (${input.cbteHasta}) debe ser >= cbteDesde (${input.cbteDesde}).`,
    });
  }

  // ---- cbteFch ----
  if (!/^\d{8}$/.test(input.cbteFch)) {
    errors.push({
      field: "cbteFch",
      message: `Fecha de comprobante (${input.cbteFch}) debe tener formato YYYYMMDD (ej: "20260506").`,
    });
  }

  // ---- amount sums (AFIP error 10048) ----
  const expectedTotal =
    (input.impTotConc ?? 0) +
    input.impNeto +
    input.impIVA +
    (input.impOpEx ?? 0) +
    (input.impTrib ?? 0);
  if (Math.abs(expectedTotal - input.impTotal) > 0.01) {
    errors.push({
      field: "impTotal",
      message: `ImpTotal (${input.impTotal.toFixed(2)}) no coincide con la suma de componentes (ImpTotConc + ImpNeto + ImpIVA + ImpOpEx + ImpTrib = ${expectedTotal.toFixed(2)}). AFIP rechaza con error 10048.`,
    });
  }

  // ---- IVA discrimination consistency ----
  const ivaSum = (input.iva ?? []).reduce((s, i) => s + i.importe, 0);
  if (input.iva && input.iva.length > 0 && Math.abs(ivaSum - input.impIVA) > 0.01) {
    errors.push({
      field: "iva",
      message: `Suma de Iva.Importe (${ivaSum.toFixed(2)}) no coincide con ImpIVA (${input.impIVA.toFixed(2)}).`,
    });
  }
  if (!input.iva && input.impIVA > 0) {
    errors.push({
      field: "iva",
      message: `ImpIVA es ${input.impIVA.toFixed(2)} pero no se pasaron filas <Iva>. Pasá al menos una fila con baseImp + importe.`,
    });
  }

  // ---- Tributos consistency ----
  if (input.tributos && input.tributos.length > 0) {
    const tribSum = input.tributos.reduce((s, t) => s + t.importe, 0);
    if (Math.abs(tribSum - (input.impTrib ?? 0)) > 0.01) {
      errors.push({
        field: "tributos",
        message: `Suma de Tributo.Importe (${tribSum.toFixed(2)}) no coincide con ImpTrib (${(input.impTrib ?? 0).toFixed(2)}).`,
      });
    }
  }

  // ---- Factura C: no IVA allowed ----
  if (FACTURA_C_TYPES.has(input.cbteTipo)) {
    if (input.impIVA > 0) {
      errors.push({
        field: "impIVA",
        message: `Factura/Nota tipo ${input.cbteTipo} (Monotributo / Exento) NO admite IVA. ImpIVA debe ser 0.`,
      });
    }
    if (input.iva && input.iva.length > 0) {
      errors.push({
        field: "iva",
        message: `Factura/Nota tipo ${input.cbteTipo} NO admite filas <Iva>. Quitalas del request.`,
      });
    }
  }

  // ---- Servicios: dates required ----
  if (
    (input.concepto === Concepto.SERVICIOS ||
      input.concepto === Concepto.PRODUCTOS_Y_SERVICIOS) &&
    (!input.fchServDesde || !input.fchServHasta || !input.fchVtoPago)
  ) {
    errors.push({
      field: "fchServDesde",
      message: `Concepto = Servicios (${input.concepto}) requiere fchServDesde, fchServHasta y fchVtoPago.`,
    });
  }

  // ---- Service date format ----
  for (const f of ["fchServDesde", "fchServHasta", "fchVtoPago"] as const) {
    const v = input[f];
    if (v && !/^\d{8}$/.test(v)) {
      errors.push({
        field: f,
        message: `${f} (${v}) debe tener formato YYYYMMDD.`,
      });
    }
  }

  // ---- Notas: cbtesAsoc required ----
  if (NOTA_TYPES.has(input.cbteTipo) && (!input.cbtesAsoc || input.cbtesAsoc.length === 0)) {
    errors.push({
      field: "cbtesAsoc",
      message: `Nota de Crédito/Débito tipo ${input.cbteTipo} requiere cbtesAsoc[] referenciando el comprobante original.`,
    });
  }

  // ---- monId/monCotiz ----
  if (input.monId && input.monId !== "PES" && (input.monCotiz ?? 1) === 1) {
    errors.push({
      field: "monCotiz",
      message: `Moneda ${input.monId} debería tener monCotiz != 1 (cotización vs ARS). Usá getCotizacion("${input.monId}") antes de emitir.`,
    });
  }

  return { valid: errors.length === 0, errors };
}
