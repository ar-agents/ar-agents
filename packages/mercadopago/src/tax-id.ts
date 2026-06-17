/**
 * TaxID validation across LATAM — pure-algorithm validators for the major
 * jurisdictions where MP operates. NO network calls.
 *
 * # Why
 *
 * Marketplace-style apps that span multiple LATAM countries need to
 * validate buyer/seller tax IDs in their respective formats: AR (DNI/CUIT/CUIL),
 * BR (CPF/CNPJ), MX (RFC), CL (RUT), CO (NIT), UY (RUT), PE (RUC).
 *
 * Each country has its own checksum algorithm. Wiring this once per app
 * is annoying + error-prone. Embedding it here means the agent can
 * validate ANY LATAM tax ID with a single tool call.
 *
 * # Sources
 *
 * - AR DNI/CUIT/CUIL: AFIP RG 100/1998 (modulo-11 checksum)
 * - BR CPF: Receita Federal (two-step modulo-11)
 * - BR CNPJ: Receita Federal (two-step weighted modulo)
 * - MX RFC: SAT regex + 13-char structure
 * - CL RUT: SII modulo-11 + check digit "0-9, K"
 * - CO NIT: DIAN modulo-11
 * - UY RUT: 12-digit numeric + checksum
 * - PE RUC: SUNAT 11-digit + checksum
 */

export type TaxIdCountry = "AR" | "BR" | "MX" | "CL" | "CO" | "UY" | "PE";

export type TaxIdType =
  | "DNI"      // AR persona física
  | "CUIT"     // AR taxpayer (persona física o jurídica)
  | "CUIL"     // AR worker
  | "CPF"      // BR persona física
  | "CNPJ"     // BR persona jurídica
  | "RFC"      // MX taxpayer (PF + PM)
  | "RUT_CL"   // CL taxpayer
  | "NIT"      // CO taxpayer
  | "RUT_UY"   // UY taxpayer
  | "RUC";     // PE taxpayer

export interface TaxIdValidationResult {
  valid: boolean;
  /** Bare digits/chars after normalization (no separators). */
  normalized: string;
  /** Pretty-formatted version with country-specific separators. */
  formatted: string | null;
  type: TaxIdType;
  country: TaxIdCountry;
  /** Spanish error message when invalid. Surface verbatim to users. */
  error: string | null;
}

/**
 * Validate a tax ID against the appropriate country algorithm.
 *
 * @example
 * validateTaxId("20-12345678-6", "CUIT")
 * // → { valid: true, normalized: "20123456786", formatted: "20-12345678-6", ... }
 *
 * @example
 * validateTaxId("123.456.789-09", "CPF")
 * // → { valid: true, normalized: "12345678909", ... }
 */
export function validateTaxId(
  input: string,
  type: TaxIdType,
): TaxIdValidationResult {
  switch (type) {
    case "DNI":
      return validateAR_DNI(input);
    case "CUIT":
    case "CUIL":
      return validateAR_CUIT(input, type);
    case "CPF":
      return validateBR_CPF(input);
    case "CNPJ":
      return validateBR_CNPJ(input);
    case "RFC":
      return validateMX_RFC(input);
    case "RUT_CL":
      return validateCL_RUT(input);
    case "NIT":
      return validateCO_NIT(input);
    case "RUT_UY":
      return validateUY_RUT(input);
    case "RUC":
      return validatePE_RUC(input);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AR — DNI / CUIT / CUIL
// ─────────────────────────────────────────────────────────────────────────────

function validateAR_DNI(input: string): TaxIdValidationResult {
  const normalized = (input ?? "").replace(/\D/g, "");
  if (normalized.length === 0) {
    return failure(normalized, "DNI", "AR", "DNI vacío.");
  }
  if (normalized.length < 7 || normalized.length > 8) {
    return failure(
      normalized,
      "DNI",
      "AR",
      `Debe tener 7 u 8 dígitos; recibí ${normalized.length}.`,
    );
  }
  return {
    valid: true,
    normalized,
    formatted: normalized.replace(/^(\d{1,2})(\d{3})(\d{3})$/, "$1.$2.$3"),
    type: "DNI",
    country: "AR",
    error: null,
  };
}

const AR_CHECK_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

function validateAR_CUIT(input: string, type: "CUIT" | "CUIL"): TaxIdValidationResult {
  const normalized = (input ?? "").replace(/\D/g, "");
  if (normalized.length !== 11) {
    return failure(
      normalized,
      type,
      "AR",
      `Debe tener 11 dígitos; recibí ${normalized.length}.`,
    );
  }
  const sum = AR_CHECK_WEIGHTS.reduce(
    (acc, w, i) => acc + w * Number(normalized[i]),
    0,
  );
  const remainder = sum % 11;
  const expected = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
  const actual = Number(normalized[10]);
  if (actual !== expected) {
    return failure(
      normalized,
      type,
      "AR",
      `Dígito verificador inválido. Esperado: ${expected}, recibido: ${actual}.`,
    );
  }
  return {
    valid: true,
    normalized,
    formatted: `${normalized.slice(0, 2)}-${normalized.slice(2, 10)}-${normalized.slice(10)}`,
    type,
    country: "AR",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BR — CPF / CNPJ
// ─────────────────────────────────────────────────────────────────────────────

function validateBR_CPF(input: string): TaxIdValidationResult {
  const normalized = (input ?? "").replace(/\D/g, "");
  if (normalized.length !== 11) {
    return failure(
      normalized,
      "CPF",
      "BR",
      `Debe tener 11 dígitos; recibí ${normalized.length}.`,
    );
  }
  // Reject all-same-digit CPFs (e.g., 11111111111) — invalid by spec
  if (/^(\d)\1{10}$/.test(normalized)) {
    return failure(normalized, "CPF", "BR", "CPF inválido (todos los dígitos iguales).");
  }
  const computeDigit = (slice: string, weights: number[]): number => {
    const sum = weights.reduce((acc, w, i) => acc + w * Number(slice[i]), 0);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  const d1 = computeDigit(normalized.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = computeDigit(
    normalized.slice(0, 10),
    [11, 10, 9, 8, 7, 6, 5, 4, 3, 2],
  );
  if (d1 !== Number(normalized[9]) || d2 !== Number(normalized[10])) {
    return failure(normalized, "CPF", "BR", "Dígitos verificadores inválidos.");
  }
  return {
    valid: true,
    normalized,
    formatted: normalized.replace(
      /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
      "$1.$2.$3-$4",
    ),
    type: "CPF",
    country: "BR",
    error: null,
  };
}

function validateBR_CNPJ(input: string): TaxIdValidationResult {
  const normalized = (input ?? "").replace(/\D/g, "");
  if (normalized.length !== 14) {
    return failure(
      normalized,
      "CNPJ",
      "BR",
      `Debe tener 14 dígitos; recibí ${normalized.length}.`,
    );
  }
  if (/^(\d)\1{13}$/.test(normalized)) {
    return failure(normalized, "CNPJ", "BR", "CNPJ inválido (todos los dígitos iguales).");
  }
  const computeDigit = (slice: string, weights: number[]): number => {
    const sum = weights.reduce((acc, w, i) => acc + w * Number(slice[i]), 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const d1 = computeDigit(normalized.slice(0, 12), w1);
  const d2 = computeDigit(normalized.slice(0, 13), w2);
  if (d1 !== Number(normalized[12]) || d2 !== Number(normalized[13])) {
    return failure(normalized, "CNPJ", "BR", "Dígitos verificadores inválidos.");
  }
  return {
    valid: true,
    normalized,
    formatted: normalized.replace(
      /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
      "$1.$2.$3/$4-$5",
    ),
    type: "CNPJ",
    country: "BR",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MX — RFC (PF: 13 chars; PM: 12 chars; structure-only validation)
// ─────────────────────────────────────────────────────────────────────────────

function validateMX_RFC(input: string): TaxIdValidationResult {
  const normalized = (input ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  // PF: 4 letters + 6 digits (YYMMDD) + 3 alphanumeric homoclave
  // PM: 3 letters + 6 digits (YYMMDD) + 3 alphanumeric homoclave
  const pfPattern = /^[A-ZÑ&]{4}\d{6}[A-Z\d]{3}$/;
  const pmPattern = /^[A-ZÑ&]{3}\d{6}[A-Z\d]{3}$/;
  if (!pfPattern.test(normalized) && !pmPattern.test(normalized)) {
    return failure(
      normalized,
      "RFC",
      "MX",
      "RFC mal formado. Persona física: 4 letras + YYMMDD + 3 alfanuméricos. Persona moral: 3 letras + YYMMDD + 3 alfanuméricos.",
    );
  }
  return {
    valid: true,
    normalized,
    formatted: normalized,
    type: "RFC",
    country: "MX",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CL — RUT (modulo-11 with K as digit)
// ─────────────────────────────────────────────────────────────────────────────

function validateCL_RUT(input: string): TaxIdValidationResult {
  const cleaned = (input ?? "").replace(/[^0-9kK]/g, "").toUpperCase();
  if (cleaned.length < 2) {
    return failure(cleaned, "RUT_CL", "CL", "RUT vacío o muy corto.");
  }
  const body = cleaned.slice(0, -1);
  const dv = cleaned.slice(-1);
  if (!/^\d+$/.test(body)) {
    return failure(cleaned, "RUT_CL", "CL", "Cuerpo del RUT debe ser numérico.");
  }
  let sum = 0;
  let multiplier = 2;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += Number(body[i]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }
  const r = 11 - (sum % 11);
  const expected = r === 11 ? "0" : r === 10 ? "K" : String(r);
  if (dv !== expected) {
    return failure(
      cleaned,
      "RUT_CL",
      "CL",
      `Dígito verificador inválido. Esperado: ${expected}, recibido: ${dv}.`,
    );
  }
  return {
    valid: true,
    normalized: cleaned,
    formatted: `${formatThousands(body)}-${dv}`,
    type: "RUT_CL",
    country: "CL",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CO — NIT (modulo-11)
// ─────────────────────────────────────────────────────────────────────────────

const CO_NIT_WEIGHTS = [3, 7, 13, 17, 19, 23, 29, 37, 41, 43, 47, 53, 59, 67, 71];

function validateCO_NIT(input: string): TaxIdValidationResult {
  const cleaned = (input ?? "").replace(/[^0-9-]/g, "");
  // Format: digits + optional check digit (e.g., "900123456-7")
  const parts = cleaned.split("-");
  if (parts.length !== 2 || !/^\d+$/.test(parts[0]!) || !/^\d$/.test(parts[1]!)) {
    return failure(
      cleaned,
      "NIT",
      "CO",
      "NIT debe tener formato: dígitos + '-' + dígito verificador.",
    );
  }
  const body = parts[0]!;
  const dv = Number(parts[1]);
  if (body.length > CO_NIT_WEIGHTS.length) {
    return failure(cleaned, "NIT", "CO", "NIT excesivamente largo.");
  }
  // Right-align the body against the weights array
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    sum += Number(body[body.length - 1 - i]) * CO_NIT_WEIGHTS[i]!;
  }
  const r = sum % 11;
  const expected = r > 1 ? 11 - r : r;
  if (dv !== expected) {
    return failure(
      cleaned,
      "NIT",
      "CO",
      `Dígito verificador inválido. Esperado: ${expected}, recibido: ${dv}.`,
    );
  }
  return {
    valid: true,
    normalized: body + parts[1],
    formatted: cleaned,
    type: "NIT",
    country: "CO",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// UY — RUT (12 digits + checksum)
// ─────────────────────────────────────────────────────────────────────────────

const UY_RUT_WEIGHTS = [4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function validateUY_RUT(input: string): TaxIdValidationResult {
  const normalized = (input ?? "").replace(/\D/g, "");
  if (normalized.length !== 12) {
    return failure(
      normalized,
      "RUT_UY",
      "UY",
      `Debe tener 12 dígitos; recibí ${normalized.length}.`,
    );
  }
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    sum += Number(normalized[i]) * UY_RUT_WEIGHTS[i]!;
  }
  const r = sum % 11;
  const expected = r === 0 ? 0 : 11 - r;
  if (Number(normalized[11]) !== expected) {
    return failure(
      normalized,
      "RUT_UY",
      "UY",
      `Dígito verificador inválido. Esperado: ${expected}, recibido: ${normalized[11]}.`,
    );
  }
  return {
    valid: true,
    normalized,
    formatted: normalized.replace(
      /^(\d{2})(\d{6})(\d{3})(\d{1})$/,
      "$1$2$3$4",
    ),
    type: "RUT_UY",
    country: "UY",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PE — RUC (11 digits + checksum)
// ─────────────────────────────────────────────────────────────────────────────

const PE_RUC_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

function validatePE_RUC(input: string): TaxIdValidationResult {
  const normalized = (input ?? "").replace(/\D/g, "");
  if (normalized.length !== 11) {
    return failure(
      normalized,
      "RUC",
      "PE",
      `Debe tener 11 dígitos; recibí ${normalized.length}.`,
    );
  }
  // First two digits must be 10, 15, 17, or 20
  const prefix = normalized.slice(0, 2);
  if (!["10", "15", "17", "20"].includes(prefix)) {
    return failure(
      normalized,
      "RUC",
      "PE",
      `Prefijo ${prefix} no válido. Debe ser 10, 15, 17 o 20.`,
    );
  }
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += Number(normalized[i]) * PE_RUC_WEIGHTS[i]!;
  }
  const r = 11 - (sum % 11);
  const expected = r === 11 ? 0 : r === 10 ? 1 : r;
  if (Number(normalized[10]) !== expected) {
    return failure(
      normalized,
      "RUC",
      "PE",
      `Dígito verificador inválido. Esperado: ${expected}, recibido: ${normalized[10]}.`,
    );
  }
  return {
    valid: true,
    normalized,
    formatted: normalized,
    type: "RUC",
    country: "PE",
    error: null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function failure(
  normalized: string,
  type: TaxIdType,
  country: TaxIdCountry,
  error: string,
): TaxIdValidationResult {
  return {
    valid: false,
    normalized,
    formatted: null,
    type,
    country,
    error,
  };
}

function formatThousands(s: string): string {
  return s.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/**
 * Convenience: try to detect the type from the input shape + country, then
 * validate. Useful when the agent doesn't know if it's a CPF or a CNPJ.
 *
 * @returns null when the input doesn't match any known type for the country
 */
export function detectAndValidate(
  input: string,
  country: TaxIdCountry,
): TaxIdValidationResult | null {
  const cleaned = input.replace(/\D/g, "");
  switch (country) {
    case "AR": {
      if (cleaned.length === 7 || cleaned.length === 8) return validateTaxId(input, "DNI");
      if (cleaned.length === 11) return validateTaxId(input, "CUIT");
      return null;
    }
    case "BR": {
      if (cleaned.length === 11) return validateTaxId(input, "CPF");
      if (cleaned.length === 14) return validateTaxId(input, "CNPJ");
      return null;
    }
    case "MX":
      return validateTaxId(input, "RFC");
    case "CL":
      return validateTaxId(input, "RUT_CL");
    case "CO":
      return validateTaxId(input, "NIT");
    case "UY":
      return validateTaxId(input, "RUT_UY");
    case "PE":
      return validateTaxId(input, "RUC");
  }
}
