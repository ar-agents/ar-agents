// Client-side CUIT (Clave Única de Identificación Tributaria) validation:
// format (11 digits) plus the standard mod-11 check digit AFIP uses. Pure, no
// I/O, so both the constitution form and its tests call it directly. The
// server independently re-validates (docs/CONTRACT.md); this only saves a
// round trip for an obviously malformed CUIT and gives instant field
// feedback.

const CHECK_MULTIPLIERS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/** Strips everything but ASCII digits (spaces, dots, hyphens the user may
 *  type or paste, e.g. "20-12345678-6"). */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

/** 11 digits, nothing more. Does not check the verifier digit. */
export function isCuitFormatValid(input: string): boolean {
  return /^\d{11}$/.test(normalizeCuit(input));
}

/**
 * Mod-11 check digit, the algorithm AFIP uses for CUIT/CUIL. Multiplies the
 * first 10 digits by a fixed sequence, sums, and derives the expected 11th
 * digit as `11 - (sum % 11)`, with the standard fallbacks: 11 -> 0, 10 -> 9
 * (a raw remainder of 10 never occurs on a correctly-issued CUIT; treating it
 * as 9 is the fallback every AFIP-adjacent checksum implementation uses).
 */
function checkDigit(first10: string): number {
  const sum = CHECK_MULTIPLIERS.reduce(
    (acc, mult, i) => acc + mult * Number(first10[i]),
    0,
  );
  const rest = 11 - (sum % 11);
  if (rest === 11) return 0;
  if (rest === 10) return 9;
  return rest;
}

/** Full validation: exactly 11 digits AND a matching mod-11 check digit. */
export function isValidCuit(input: string): boolean {
  const digits = normalizeCuit(input);
  if (!/^\d{11}$/.test(digits)) return false;
  return checkDigit(digits.slice(0, 10)) === Number(digits[10]);
}

/** Formats 11 raw digits as XX-XXXXXXXX-X for display; returns the input
 *  unchanged if it is not exactly 11 digits. */
export function formatCuit(input: string): string {
  const digits = normalizeCuit(input);
  if (digits.length !== 11) return input;
  return `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`;
}
