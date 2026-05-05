/**
 * Pure-algorithm CUIT/CUIL validation and parsing.
 *
 * CUIT (Clave Única de Identificación Tributaria) and CUIL (Clave Única de
 * Identificación Laboral) are 11-digit Argentine taxpayer identifiers with
 * the structure: PP-DDDDDDDD-V where:
 *   - PP is a 2-digit type prefix (20/23/24/27 = persona física, 30/33/34 =
 *     persona jurídica, plus a few less common cases)
 *   - DDDDDDDD is the 8-digit DNI (for personas físicas) or company id
 *   - V is the check digit, computed via modulo-11 over the first 10 digits
 *
 * No AFIP webservice is consulted here — the algorithm is sufficient to
 * detect typos and clearly malformed inputs. For the actual taxpayer name +
 * monotributo category + tax condition, an AFIP cert + WSAA + WSCDC
 * integration is required (see TODO in src/lib/afip-stub.ts).
 */

export type CuitPersonType =
  | "fisica_masculina" //  20
  | "fisica_femenina" //   27
  | "fisica_extranjera" // 23, 24
  | "juridica" //          30
  | "juridica_alternativa" // 33, 34
  | "desconocida";

const PREFIX_TO_TYPE: Record<string, CuitPersonType> = {
  "20": "fisica_masculina",
  "27": "fisica_femenina",
  "23": "fisica_extranjera",
  "24": "fisica_extranjera",
  "30": "juridica",
  "33": "juridica_alternativa",
  "34": "juridica_alternativa",
};

const CHECK_WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

export interface CuitParseResult {
  /** True when the CUIT passes ALL validations: format + length + check digit. */
  valid: boolean;
  /** Normalized 11-digit string with no separators. Always present even if invalid. */
  normalized: string;
  /** Pretty-printed `XX-XXXXXXXX-X` form. Only present when length is 11. */
  formatted: string | null;
  /** 2-digit prefix. Only present when length is 11. */
  prefix: string | null;
  /** 8-digit body (the DNI for personas físicas). Only present when length is 11. */
  body: string | null;
  /** Check digit. Only present when length is 11. */
  checkDigit: string | null;
  /** Inferred person type from the prefix. */
  personType: CuitPersonType;
  /** Reason the CUIT is invalid, when applicable. */
  error: string | null;
}

/**
 * Strip any non-digit characters and return only the bare digits. Useful
 * because users paste CUITs in many formats: `20-41758101-5`, `20.41758101.5`,
 * `20 41758101 5`, `20417581015`.
 */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

/** Compute the modulo-11 check digit for the first 10 digits of a CUIT. */
export function computeCheckDigit(first10: string): number | null {
  if (first10.length !== 10 || !/^\d{10}$/.test(first10)) return null;
  const sum = CHECK_WEIGHTS.reduce(
    (acc, weight, i) => acc + weight * Number(first10[i]),
    0,
  );
  const remainder = sum % 11;
  if (remainder === 0) return 0;
  if (remainder === 1) {
    // Per AFIP spec: when remainder is 1, the digit is 9 if prefix is 23
    // (extranjeras), otherwise convention is to flip the prefix to 23. For
    // pure validation we just return the canonical "9" — callers that care
    // about the prefix-flip nuance should special-case it.
    return 9;
  }
  return 11 - remainder;
}

/**
 * Parse and validate a CUIT/CUIL. Returns a structured result indicating
 * whether the input is valid and, if so, the inferred person type and the
 * formatted form.
 */
export function parseCuit(input: string): CuitParseResult {
  const normalized = normalizeCuit(input ?? "");

  if (normalized.length === 0) {
    return {
      valid: false,
      normalized,
      formatted: null,
      prefix: null,
      body: null,
      checkDigit: null,
      personType: "desconocida",
      error: "CUIT vacío.",
    };
  }
  if (normalized.length !== 11) {
    return {
      valid: false,
      normalized,
      formatted: null,
      prefix: null,
      body: null,
      checkDigit: null,
      personType: "desconocida",
      error: `Debe tener 11 dígitos; recibí ${normalized.length}.`,
    };
  }

  const prefix = normalized.slice(0, 2);
  const body = normalized.slice(2, 10);
  const checkDigit = normalized.slice(10);
  const personType = PREFIX_TO_TYPE[prefix] ?? "desconocida";

  if (personType === "desconocida") {
    return {
      valid: false,
      normalized,
      formatted: `${prefix}-${body}-${checkDigit}`,
      prefix,
      body,
      checkDigit,
      personType,
      error: `Prefijo ${prefix} no es válido. Esperado: 20/23/24/27 (persona física) o 30/33/34 (persona jurídica).`,
    };
  }

  const expected = computeCheckDigit(normalized.slice(0, 10));
  if (expected === null) {
    return {
      valid: false,
      normalized,
      formatted: `${prefix}-${body}-${checkDigit}`,
      prefix,
      body,
      checkDigit,
      personType,
      error: "No se pudo calcular el dígito verificador (input no numérico).",
    };
  }
  if (Number(checkDigit) !== expected) {
    return {
      valid: false,
      normalized,
      formatted: `${prefix}-${body}-${checkDigit}`,
      prefix,
      body,
      checkDigit,
      personType,
      error: `Dígito verificador inválido. Esperado: ${expected}, recibido: ${checkDigit}. Probablemente hay un typo en el CUIT.`,
    };
  }

  return {
    valid: true,
    normalized,
    formatted: `${prefix}-${body}-${checkDigit}`,
    prefix,
    body,
    checkDigit,
    personType,
    error: null,
  };
}

/**
 * Convenience boolean: true iff the CUIT is fully valid (format + check
 * digit). Most callers want either this or `parseCuit()` for structured info.
 */
export function isValidCuit(input: string): boolean {
  return parseCuit(input).valid;
}

/**
 * Human-friendly description of the person type, useful for explaining
 * results to end users in Spanish.
 */
export function describePersonType(type: CuitPersonType): string {
  switch (type) {
    case "fisica_masculina":
      return "Persona física (masculino).";
    case "fisica_femenina":
      return "Persona física (femenino).";
    case "fisica_extranjera":
      return "Persona física (extranjero o caso especial).";
    case "juridica":
      return "Persona jurídica.";
    case "juridica_alternativa":
      return "Persona jurídica (prefijo alternativo).";
    case "desconocida":
      return "Tipo de persona desconocido.";
  }
}
