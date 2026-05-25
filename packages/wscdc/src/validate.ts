/**
 * Pre-flight input validation for ConstatarRequest. Catches client-
 * side mistakes BEFORE the WSAA round-trip, so a typo doesn't cost a
 * billable AFIP call.
 *
 * These are local checks only — they cannot tell whether the
 * comprobante is real. The semantic answer comes from AFIP.
 */
import type { ConstatarRequest } from "./types";
import { WscdcValidationError } from "./errors";

const CUIT_RE = /^\d{11}$/;
const CAE_RE = /^\d{14}$/;
const CBTE_FCH_RE = /^\d{8}$/; // YYYYMMDD

/** Normalize a CUIT-or-hyphenated input to 11 digits. Throws on garbage. */
export function normalizeCuit(value: string, fieldName: string): string {
  const clean = value.replace(/-/g, "");
  if (!CUIT_RE.test(clean)) {
    throw new WscdcValidationError(
      fieldName,
      "must be 11 digits (with or without hyphens)",
    );
  }
  return clean;
}

export function validateConstatarRequest(req: ConstatarRequest): void {
  if (req.cbteModo !== "CAE" && req.cbteModo !== "CAEA") {
    throw new WscdcValidationError("cbteModo", "must be 'CAE' or 'CAEA'");
  }
  normalizeCuit(req.cuitEmisor, "cuitEmisor");
  if (!Number.isInteger(req.ptoVta) || req.ptoVta < 1 || req.ptoVta > 99_999) {
    throw new WscdcValidationError("ptoVta", "must be integer 1..99999");
  }
  if (!Number.isInteger(req.cbteTipo) || req.cbteTipo <= 0) {
    throw new WscdcValidationError("cbteTipo", "must be positive integer");
  }
  if (!Number.isInteger(req.cbteNro) || req.cbteNro <= 0) {
    throw new WscdcValidationError("cbteNro", "must be positive integer");
  }
  if (!CBTE_FCH_RE.test(req.cbteFch)) {
    throw new WscdcValidationError(
      "cbteFch",
      "must be YYYYMMDD (AFIP wire format, no hyphens)",
    );
  }
  if (typeof req.impTotal !== "number" || !Number.isFinite(req.impTotal) || req.impTotal < 0) {
    throw new WscdcValidationError("impTotal", "must be a non-negative number");
  }
  if (!CAE_RE.test(req.codAutorizacion)) {
    throw new WscdcValidationError(
      "codAutorizacion",
      "must be 14 digits (CAE or CAEA)",
    );
  }
  if (!Number.isInteger(req.docTipoReceptor) || req.docTipoReceptor < 0) {
    throw new WscdcValidationError("docTipoReceptor", "must be non-negative integer");
  }
  if (typeof req.docNroReceptor !== "string") {
    throw new WscdcValidationError("docNroReceptor", "must be a string");
  }
  // 0 is valid (Consumidor Final), but any other shape must be digits.
  if (req.docNroReceptor !== "0" && !/^\d+$/.test(req.docNroReceptor)) {
    throw new WscdcValidationError(
      "docNroReceptor",
      "must be a numeric string (use '0' for Consumidor Final)",
    );
  }
}
