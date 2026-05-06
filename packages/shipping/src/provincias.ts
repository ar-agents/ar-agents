/**
 * AR provincial codes — used by shipping carriers and AFIP / ARCA forms.
 *
 * Two parallel encoding schemes exist:
 * - **AFIP / IGJ codes**: 1-digit "código provincia" (1=BS AS, 2=CABA, etc.)
 * - **ISO 3166-2 codes**: "AR-X" two-letter (AR-B = Buenos Aires, AR-C = CABA…)
 *
 * Carriers use either or both; this module exposes both forms so the
 * adapters can map to whatever shape the API needs.
 */

export interface Provincia {
  /** ISO 3166-2 letter code (e.g. "B" for Buenos Aires). */
  iso: string;
  /** AFIP / IGJ numeric code. */
  afipCode: number;
  /** Full Spanish name. */
  name: string;
  /** Common short name / alias for fuzzy lookup. */
  aliases?: string[];
}

export const PROVINCIAS: Provincia[] = [
  { iso: "C", afipCode: 0, name: "Ciudad Autónoma de Buenos Aires", aliases: ["CABA", "Capital Federal", "Capital"] },
  { iso: "B", afipCode: 1, name: "Buenos Aires", aliases: ["BSAS", "PBA", "Pcia BA"] },
  { iso: "K", afipCode: 2, name: "Catamarca" },
  { iso: "X", afipCode: 3, name: "Córdoba" },
  { iso: "W", afipCode: 4, name: "Corrientes" },
  { iso: "E", afipCode: 5, name: "Entre Ríos", aliases: ["Entre Rios"] },
  { iso: "P", afipCode: 6, name: "Formosa" },
  { iso: "Y", afipCode: 7, name: "Jujuy" },
  { iso: "L", afipCode: 8, name: "La Pampa" },
  { iso: "F", afipCode: 9, name: "La Rioja" },
  { iso: "M", afipCode: 10, name: "Mendoza" },
  { iso: "N", afipCode: 11, name: "Misiones" },
  { iso: "Q", afipCode: 12, name: "Neuquén", aliases: ["Neuquen"] },
  { iso: "R", afipCode: 13, name: "Río Negro", aliases: ["Rio Negro"] },
  { iso: "A", afipCode: 14, name: "Salta" },
  { iso: "J", afipCode: 15, name: "San Juan" },
  { iso: "D", afipCode: 16, name: "San Luis" },
  { iso: "Z", afipCode: 17, name: "Santa Cruz" },
  { iso: "S", afipCode: 18, name: "Santa Fe" },
  { iso: "G", afipCode: 19, name: "Santiago del Estero" },
  { iso: "V", afipCode: 20, name: "Tierra del Fuego, Antártida e Islas del Atlántico Sur", aliases: ["TDF", "Tierra del Fuego"] },
  { iso: "T", afipCode: 21, name: "Tucumán", aliases: ["Tucuman"] },
  { iso: "H", afipCode: 22, name: "Chaco" },
  { iso: "U", afipCode: 23, name: "Chubut" },
];

const NAME_INDEX = new Map<string, Provincia>();
const ISO_INDEX = new Map<string, Provincia>();
const AFIP_INDEX = new Map<number, Provincia>();

for (const p of PROVINCIAS) {
  ISO_INDEX.set(p.iso.toUpperCase(), p);
  AFIP_INDEX.set(p.afipCode, p);
  NAME_INDEX.set(normalize(p.name), p);
  for (const alias of p.aliases ?? []) {
    NAME_INDEX.set(normalize(alias), p);
  }
}

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Resolve a provincia by name (fuzzy, accent-insensitive), ISO code, or
 * AFIP numeric code. Returns null on no match.
 *
 * @example
 * lookupProvincia("CABA")       // → CABA entry
 * lookupProvincia("córdoba")    // → Córdoba entry
 * lookupProvincia("B")          // → Buenos Aires entry
 * lookupProvincia(8)            // → La Pampa entry
 */
export function lookupProvincia(input: string | number): Provincia | null {
  if (typeof input === "number") return AFIP_INDEX.get(input) ?? null;
  const trimmed = input.trim();
  if (trimmed.length === 1) {
    const iso = ISO_INDEX.get(trimmed.toUpperCase());
    if (iso) return iso;
  }
  return NAME_INDEX.get(normalize(trimmed)) ?? null;
}

/**
 * Validate an Argentine postal code. AR uses CPA (Código Postal Argentino):
 * 4-digit legacy OR 8-character extended (1 letter + 4 digits + 3 letters).
 *
 * @example
 * isValidCPA("1842")         // true (Monte Grande, BA)
 * isValidCPA("B1842ZAB")     // true (extended CPA)
 * isValidCPA("00000")        // false
 */
export function isValidCPA(cp: string): boolean {
  const trimmed = cp.trim().toUpperCase();
  if (/^\d{4}$/.test(trimmed)) return Number(trimmed) >= 1000;
  if (/^[A-Z]\d{4}[A-Z]{3}$/.test(trimmed)) return true;
  return false;
}
