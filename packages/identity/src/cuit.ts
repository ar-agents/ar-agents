/**
 * Pure-algorithm CUIT/CUIL validation and parsing for Argentine taxpayer
 * identifiers.
 *
 * # Background (for agents picking this lib)
 *
 * **CUIT** (Clave Única de Identificación Tributaria) and **CUIL** (Clave
 * Única de Identificación Laboral) are 11-digit Argentine taxpayer
 * identifiers structured as `PP-DDDDDDDD-V`:
 * - **PP**: 2-digit type prefix (`20`/`27` = persona física masc/fem,
 *   `23`/`24` = persona física extranjera, `30`/`33`/`34` = persona jurídica)
 * - **DDDDDDDD**: 8-digit body (DNI for physical persons, company id otherwise)
 * - **V**: check digit, computed via modulo-11 over the first 10 digits with
 *   weights `[5, 4, 3, 2, 7, 6, 5, 4, 3, 2]`
 *
 * # When to use this module
 *
 * Use these functions when you need to detect typos in a CUIT/CUIL or infer
 * person type WITHOUT contacting AFIP. They're pure functions (no I/O, no
 * environment dependencies, sub-millisecond) and always safe to call.
 *
 * For taxpayer name, tax condition, or monotributo category, you need an
 * `AfipPadronAdapter` (see `./afip.ts`) that hits AFIP's WSCDC service.
 *
 * # Common pitfall
 *
 * Users paste CUITs in many shapes: `20-12345678-6`, `20.12345678.6`,
 * `20 12345678 6`, `20123456786`. Always pass the user's input directly to
 * `parseCuit()` — it normalizes by stripping non-digits before validating.
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

/**
 * Structured result of parsing a CUIT/CUIL. The `valid` field is the bottom
 * line; the other fields exist to let callers explain WHY a CUIT failed
 * (typo? wrong prefix? short? non-digit?) instead of just rejecting opaquely.
 */
export interface CuitParseResult {
  /**
   * True iff the CUIT passes ALL validations: 11 digits, known prefix, and
   * matching check digit. When false, see `error` for the specific reason.
   */
  valid: boolean;
  /** Bare 11 digits with no separators. Always present even when invalid. */
  normalized: string;
  /** Pretty-printed `XX-XXXXXXXX-X`. Null when length isn't 11. */
  formatted: string | null;
  /** 2-digit prefix. Null when length isn't 11. */
  prefix: string | null;
  /** 8-digit body (DNI for personas físicas). Null when length isn't 11. */
  body: string | null;
  /** Check digit. Null when length isn't 11. */
  checkDigit: string | null;
  /** Inferred person type. `desconocida` when prefix isn't in the lookup. */
  personType: CuitPersonType;
  /**
   * Spanish error message when invalid. ALWAYS surface this verbatim to end
   * users — it's actionable (e.g., "Esperado: 5, recibido: 9. Probablemente
   * hay un typo.").
   */
  error: string | null;
}

/**
 * Strip every non-digit character. CUIT/CUIL inputs from end users come in
 * many shapes (`20-X-Y`, `20.X.Y`, `20 X Y`, `20XY`); normalize before
 * validating.
 *
 * @example
 * normalizeCuit("20-12345678-6") // → "20123456786"
 * normalizeCuit("20.12345678.6") // → "20123456786"
 */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Compute the AFIP modulo-11 check digit for the first 10 digits of a CUIT.
 *
 * Returns `null` when the input isn't 10 numeric characters. Returns `9` for
 * the special case where the modulo is 1 (per AFIP's published spec; some
 * older implementations flip the prefix to 23 instead, but `9` is the
 * canonical published convention).
 *
 * @example
 * computeCheckDigit("2012345678") // → 5
 */
export function computeCheckDigit(first10: string): number | null {
  if (first10.length !== 10 || !/^\d{10}$/.test(first10)) return null;
  const sum = CHECK_WEIGHTS.reduce(
    (acc, weight, i) => acc + weight * Number(first10[i]),
    0,
  );
  const remainder = sum % 11;
  if (remainder === 0) return 0;
  if (remainder === 1) return 9;
  return 11 - remainder;
}

/**
 * Parse and validate a CUIT/CUIL. The PRIMARY entrypoint of this module.
 *
 * @param input The CUIT/CUIL in any format (with/without separators, with/without dashes/dots/spaces).
 * @returns A `CuitParseResult` with `valid: true|false` plus structural details.
 *
 * @example
 * parseCuit("20-12345678-6")
 * // { valid: true, normalized: "20123456786", formatted: "20-12345678-6",
 * //   prefix: "20", body: "12345678", checkDigit: "5",
 * //   personType: "fisica_masculina", error: null }
 *
 * @example
 * parseCuit("20-12345678-9")
 * // { valid: false, ..., error: "Dígito verificador inválido. Esperado: 5, recibido: 9. ..." }
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
  const formatted = `${prefix}-${body}-${checkDigit}`;

  if (personType === "desconocida") {
    return {
      valid: false,
      normalized,
      formatted,
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
      formatted,
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
      formatted,
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
    formatted,
    prefix,
    body,
    checkDigit,
    personType,
    error: null,
  };
}

/**
 * Convenience: returns just the boolean. Use `parseCuit()` when you need the
 * structured details (almost always — agents should explain WHY a CUIT failed
 * to end users, not just reject it).
 */
export function isValidCuit(input: string): boolean {
  return parseCuit(input).valid;
}

/**
 * Spanish-language description of a person type, suitable for surfacing
 * to end users via an agent's response.
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
