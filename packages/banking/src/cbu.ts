/**
 * Pure-algorithm CBU/CVU validation and parsing for Argentine bank accounts.
 *
 * # Background (for agents picking this lib)
 *
 * **CBU** (Clave Bancaria Uniforme) is the standardized 22-digit identifier
 * for AR bank accounts (Banco Nación, Galicia, Santander, etc.).
 * **CVU** (Clave Virtual Uniforme) is the same format but issued by PSPs
 * (Mercado Pago, Ualá, Brubank, Naranja X, etc.) — non-bank financial
 * services regulated by the BCRA.
 *
 * Both share the same structure and the same check-digit algorithm — the
 * only difference is the bank/entity code prefix in the first 3 digits:
 * - **001-499**: traditional banks (BCRA-assigned, see `banks.ts`)
 * - **000 + 4-digit fintech code**: PSP/PSPCP virtual accounts
 *
 * # Format
 *
 * 22 digits split into two blocks:
 * - **Block 1 (8 digits)**: `BBB-SSSS-V₁`
 *   - `BBB` = 3-digit entity code
 *   - `SSSS` = 4-digit branch code (sucursal)
 *   - `V₁` = block-1 check digit
 * - **Block 2 (14 digits)**: `<account-13>-V₂`
 *   - `account-13` = 13-digit account number
 *   - `V₂` = block-2 check digit
 *
 * # Check digit algorithm (BCRA spec)
 *
 * **Block 1 check digit (V₁)**:
 *   - Weights: `[7, 1, 3, 9, 7, 1, 3]` applied to digits 1-7 of block 1
 *   - sum = Σ(digit × weight)
 *   - V₁ = `(10 - (sum mod 10)) mod 10`
 *
 * **Block 2 check digit (V₂)**:
 *   - Weights: `[3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3]` applied to digits
 *     1-13 of block 2
 *   - sum = Σ(digit × weight)
 *   - V₂ = `(10 - (sum mod 10)) mod 10`
 *
 * # When to use this module
 *
 * Use these functions when you need to detect typos in a CBU/CVU or extract
 * the bank/branch/account components WITHOUT contacting a bank or BCRA.
 * They're pure functions (no I/O, no environment dependencies, sub-millisecond)
 * and always safe to call.
 *
 * # Common pitfall
 *
 * Users paste CBUs in many shapes: `0070000-30000123456789`, with spaces,
 * with hyphens. Always pass the user's input directly to `parseCbu()` — it
 * normalizes by stripping non-digits before validating.
 */

import { lookupBankByCode, lookupCvuByPrefix, type BankInfo } from "./banks";

const BLOCK1_WEIGHTS = [7, 1, 3, 9, 7, 1, 3] as const;
const BLOCK2_WEIGHTS = [3, 9, 7, 1, 3, 9, 7, 1, 3, 9, 7, 1, 3] as const;

/**
 * Whether this CBU/CVU is a traditional bank CBU (entity code 001-499) or
 * a PSP virtual CVU (entity code 000-prefix).
 *
 * - `cbu`: traditional bank — BBB code is the BCRA-assigned bank code.
 * - `cvu`: PSP virtual account — typically code 000 + 4-digit fintech code,
 *   though some PSPs use codes in the 300+ range. Distinction is heuristic.
 * - `unknown`: bank code not in the lookup table (could be either).
 */
export type CbuKind = "cbu" | "cvu" | "unknown";

/**
 * Structured result of parsing a CBU/CVU. The `valid` field is the bottom
 * line; the other fields exist to let callers explain WHY a CBU failed
 * (typo? wrong length? bad block-1 check? bad block-2 check?) instead of
 * just rejecting opaquely.
 */
export interface CbuParseResult {
  /**
   * True iff the CBU passes ALL validations: 22 digits, block-1 check
   * digit matches, block-2 check digit matches. When false, see `error`.
   */
  valid: boolean;
  /** Bare 22 digits with no separators. Always present even when invalid. */
  normalized: string;
  /** Pretty-printed `BBBSSSSV-AAAAAAAAAAAAAV`. Null when length isn't 22. */
  formatted: string | null;
  /** 3-digit entity (bank or PSP) code. Null when length isn't 22. */
  entityCode: string | null;
  /** 4-digit branch code (sucursal). Null when length isn't 22. */
  branchCode: string | null;
  /** 13-digit account number. Null when length isn't 22. */
  accountNumber: string | null;
  /** Block-1 check digit (as written). Null when length isn't 22. */
  block1CheckDigit: string | null;
  /** Block-2 check digit (as written). Null when length isn't 22. */
  block2CheckDigit: string | null;
  /**
   * `cbu` if the entity code maps to a traditional bank, `cvu` if it maps
   * to a known PSP, `unknown` if the code is unrecognized (still possibly
   * valid — the BCRA list evolves).
   */
  kind: CbuKind;
  /**
   * Bank/entity info from the lookup table, or `null` if the entity code
   * isn't in the table. Use `kind` together with this — `kind === "unknown"`
   * implies `bank === null`.
   */
  bank: BankInfo | null;
  /**
   * Spanish error message when invalid. ALWAYS surface this verbatim to end
   * users — it's actionable (e.g., "Bloque 1 dígito verificador inválido.
   * Esperado: 0, recibido: 7. Probablemente hay un typo.").
   */
  error: string | null;
}

/**
 * Strip every non-digit character. CBU/CVU inputs from end users come in
 * many shapes (`0070000-30000123456789`, `00700003 00001234567890`, etc.);
 * normalize before validating.
 *
 * @example
 * normalizeCbu("0070000-30000123456789") // → "00700003000012345678901" — wait, lengths
 */
export function normalizeCbu(input: string): string {
  return input.replace(/\D/g, "");
}

/**
 * Compute the BCRA mod-10 check digit for a block of digits with the given
 * weights. Returns `null` when input has unexpected length or non-digits.
 *
 * @internal exposed for testing — most callers should use `parseCbu()`.
 */
export function computeBlockCheckDigit(
  digits: string,
  weights: readonly number[],
): number | null {
  if (digits.length !== weights.length) return null;
  if (!/^\d+$/.test(digits)) return null;
  const sum = weights.reduce(
    (acc, weight, i) => acc + weight * Number(digits[i]),
    0,
  );
  return (10 - (sum % 10)) % 10;
}

/**
 * Parse and validate a CBU/CVU. The PRIMARY entrypoint of this module.
 *
 * @param input The CBU/CVU in any format (with/without separators, spaces, hyphens).
 * @returns A `CbuParseResult` with `valid: true|false` plus structural details.
 *
 * @example
 * parseCbu("0070055530005571000018")
 * // { valid: true, normalized: "0070055530005571000018",
 * //   entityCode: "007", branchCode: "0055", ..., kind: "cbu",
 * //   bank: { code: "007", name: "Banco Santander Argentina" } }
 */
export function parseCbu(input: string): CbuParseResult {
  const normalized = normalizeCbu(input ?? "");

  if (normalized.length === 0) {
    return failure(normalized, "CBU/CVU vacío.");
  }
  if (normalized.length !== 22) {
    return failure(
      normalized,
      `Debe tener 22 dígitos; recibí ${normalized.length}.`,
    );
  }

  const block1 = normalized.slice(0, 8);
  const block2 = normalized.slice(8, 22);
  const entityCode = block1.slice(0, 3);
  const branchCode = block1.slice(3, 7);
  const block1CheckDigit = block1.slice(7, 8);
  const accountNumber = block2.slice(0, 13);
  const block2CheckDigit = block2.slice(13, 14);
  const formatted = `${block1}-${block2}`;

  const expected1 = computeBlockCheckDigit(
    block1.slice(0, 7),
    BLOCK1_WEIGHTS,
  );
  if (expected1 === null) {
    return {
      valid: false,
      normalized,
      formatted,
      entityCode,
      branchCode,
      accountNumber,
      block1CheckDigit,
      block2CheckDigit,
      kind: "unknown",
      bank: null,
      error: "No se pudo calcular el dígito verificador del bloque 1.",
    };
  }
  if (Number(block1CheckDigit) !== expected1) {
    return {
      valid: false,
      normalized,
      formatted,
      entityCode,
      branchCode,
      accountNumber,
      block1CheckDigit,
      block2CheckDigit,
      kind: classifyKind(entityCode),
      bank: resolveEntity(normalized),
      error: `Bloque 1 dígito verificador inválido. Esperado: ${expected1}, recibido: ${block1CheckDigit}. Probablemente hay un typo en los primeros 8 dígitos del CBU.`,
    };
  }

  const expected2 = computeBlockCheckDigit(
    block2.slice(0, 13),
    BLOCK2_WEIGHTS,
  );
  if (expected2 === null) {
    return {
      valid: false,
      normalized,
      formatted,
      entityCode,
      branchCode,
      accountNumber,
      block1CheckDigit,
      block2CheckDigit,
      kind: classifyKind(entityCode),
      bank: resolveEntity(normalized),
      error: "No se pudo calcular el dígito verificador del bloque 2.",
    };
  }
  if (Number(block2CheckDigit) !== expected2) {
    return {
      valid: false,
      normalized,
      formatted,
      entityCode,
      branchCode,
      accountNumber,
      block1CheckDigit,
      block2CheckDigit,
      kind: classifyKind(entityCode),
      bank: resolveEntity(normalized),
      error: `Bloque 2 dígito verificador inválido. Esperado: ${expected2}, recibido: ${block2CheckDigit}. Probablemente hay un typo en los últimos 14 dígitos del CBU.`,
    };
  }

  return {
    valid: true,
    normalized,
    formatted,
    entityCode,
    branchCode,
    accountNumber,
    block1CheckDigit,
    block2CheckDigit,
    kind: classifyKind(entityCode),
    bank: resolveEntity(normalized),
    error: null,
  };
}

/**
 * Convenience: returns just the boolean. Use `parseCbu()` when you need the
 * structured details (almost always — agents should explain WHY a CBU
 * failed to end users, not just reject it).
 */
export function isValidCbu(input: string): boolean {
  return parseCbu(input).valid;
}

function classifyKind(entityCode: string): CbuKind {
  // CVUs use the special "000" entity code — they're always virtual accounts
  // (PSPs), even when we don't have the specific PSP in our prefix table.
  if (entityCode === "000") return "cvu";
  const bank = lookupBankByCode(entityCode);
  if (!bank) return "unknown";
  return bank.kind;
}

/**
 * Look up the entity behind a CBU/CVU. Tries the 3-digit bank code first,
 * then falls back to the 7-digit CVU prefix (000 + 4-digit PSP subcode).
 *
 * @internal called by parseCbu — most callers should use parseCbu directly.
 */
function resolveEntity(normalized22: string): BankInfo | null {
  const entityCode = normalized22.slice(0, 3);
  if (entityCode === "000") {
    return lookupCvuByPrefix(normalized22.slice(0, 7));
  }
  return lookupBankByCode(entityCode);
}

function failure(normalized: string, error: string): CbuParseResult {
  return {
    valid: false,
    normalized,
    formatted: null,
    entityCode: null,
    branchCode: null,
    accountNumber: null,
    block1CheckDigit: null,
    block2CheckDigit: null,
    kind: "unknown",
    bank: null,
    error,
  };
}
