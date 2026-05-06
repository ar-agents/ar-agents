/**
 * BCRA-published list of Argentine banks and PSPs (Proveedores de Servicios
 * de Pago) keyed by their 3-digit entity code (the first 3 digits of a
 * CBU/CVU).
 *
 * # Maintenance
 *
 * BCRA periodically updates the list (new fintechs join, banks merge or
 * rebrand). When a code in the wild isn't in this map, `lookupBankByCode()`
 * returns `null` and `parseCbu()` reports `kind: "unknown"` — the CBU may
 * still be structurally valid (the check-digit algorithm is independent of
 * this table). Submit a PR to extend the table when you encounter gaps.
 *
 * # Sources
 *
 * - BCRA "Tabla de Entidades Financieras" (annex to its CBU normative)
 * - BCRA "Listado de Proveedores de Servicios de Pago — Cuentas de Pago"
 * - Manually verified against issued CBUs/CVUs from each entity
 */

export type EntityKind = "cbu" | "cvu";

export interface BankInfo {
  /** 3-digit BCRA-assigned code (first 3 digits of the CBU/CVU). */
  code: string;
  /** Full Spanish entity name as published by BCRA. */
  name: string;
  /** `cbu` for traditional banks, `cvu` for PSPs / virtual accounts. */
  kind: EntityKind;
  /**
   * Optional brand/short name (e.g., "Mercado Pago" for the PSP whose legal
   * name is "Mercado Pago S.R.L."). Use this in user-facing surfaces; use
   * `name` for compliance / receipts.
   */
  shortName?: string;
}

const BANKS: BankInfo[] = [
  // Public / national banks
  { code: "007", name: "Banco de Galicia y Buenos Aires S.A.U.", kind: "cbu", shortName: "Banco Galicia" },
  { code: "011", name: "Banco de la Nación Argentina", kind: "cbu", shortName: "Banco Nación" },
  { code: "014", name: "Banco de la Provincia de Buenos Aires", kind: "cbu", shortName: "Banco Provincia" },
  { code: "015", name: "Industrial and Commercial Bank of China (Argentina) S.A.", kind: "cbu", shortName: "ICBC" },
  { code: "016", name: "Citibank N.A.", kind: "cbu", shortName: "Citibank" },
  { code: "017", name: "BBVA Banco Francés S.A.", kind: "cbu", shortName: "BBVA" },
  { code: "018", name: "The Bank of Tokyo-Mitsubishi UFJ, Ltd.", kind: "cbu", shortName: "MUFG" },
  { code: "020", name: "Banco de la Provincia de Córdoba S.A.", kind: "cbu", shortName: "Bancor" },
  { code: "027", name: "Banco Supervielle S.A.", kind: "cbu", shortName: "Supervielle" },
  { code: "029", name: "Banco de la Ciudad de Buenos Aires", kind: "cbu", shortName: "Banco Ciudad" },
  { code: "030", name: "Central de la República Argentina", kind: "cbu", shortName: "BCRA" },
  { code: "034", name: "Banco Patagonia S.A.", kind: "cbu", shortName: "Patagonia" },
  { code: "044", name: "Banco Hipotecario S.A.", kind: "cbu", shortName: "Hipotecario" },
  { code: "045", name: "Banco de San Juan S.A.", kind: "cbu", shortName: "Banco San Juan" },
  { code: "046", name: "Banco do Brasil S.A.", kind: "cbu", shortName: "Banco do Brasil" },
  { code: "060", name: "Banco del Tucumán S.A.", kind: "cbu", shortName: "Banco Tucumán" },
  { code: "065", name: "Banco Municipal de Rosario", kind: "cbu", shortName: "BMR" },
  { code: "072", name: "Banco Santander Argentina S.A.", kind: "cbu", shortName: "Santander" },
  { code: "083", name: "Banco del Chubut S.A.", kind: "cbu", shortName: "Banco Chubut" },
  { code: "086", name: "Banco de Santa Cruz S.A.", kind: "cbu", shortName: "Banco Santa Cruz" },
  { code: "093", name: "Banco de la Pampa Sociedad de Economía Mixta", kind: "cbu", shortName: "Banco Pampa" },
  { code: "094", name: "Banco de Corrientes S.A.", kind: "cbu", shortName: "Banco Corrientes" },
  { code: "097", name: "Banco Provincia del Neuquén S.A.", kind: "cbu", shortName: "BPN" },
  { code: "143", name: "Brubank S.A.U.", kind: "cbu", shortName: "Brubank" },
  { code: "147", name: "Banco Interfinanzas S.A.", kind: "cbu", shortName: "Interfinanzas" },
  { code: "150", name: "HSBC Bank Argentina S.A.", kind: "cbu", shortName: "HSBC" },
  { code: "165", name: "JP Morgan Chase Bank N.A.", kind: "cbu", shortName: "JPMorgan" },
  { code: "191", name: "Banco Credicoop Cooperativo Limitado", kind: "cbu", shortName: "Credicoop" },
  { code: "198", name: "Banco de Valores S.A.", kind: "cbu", shortName: "Banco Valores" },
  { code: "247", name: "Banco Roela S.A.", kind: "cbu", shortName: "Roela" },
  { code: "254", name: "Banco Mariva S.A.", kind: "cbu", shortName: "Mariva" },
  { code: "259", name: "Banco Itaú Argentina S.A.", kind: "cbu", shortName: "Itaú" },
  { code: "262", name: "Bank of America N.A.", kind: "cbu", shortName: "BofA" },
  { code: "266", name: "BNP Paribas", kind: "cbu", shortName: "BNP Paribas" },
  { code: "268", name: "Banco Provincia de Tierra del Fuego", kind: "cbu", shortName: "BPTF" },
  { code: "269", name: "Banco de la República Oriental del Uruguay", kind: "cbu", shortName: "BROU" },
  { code: "277", name: "Banco Sáenz S.A.", kind: "cbu", shortName: "Sáenz" },
  { code: "281", name: "Banco Meridian S.A.", kind: "cbu", shortName: "Meridian" },
  { code: "285", name: "Banco Macro S.A.", kind: "cbu", shortName: "Macro" },
  { code: "295", name: "American Express Bank Ltd. S.A.", kind: "cbu", shortName: "American Express" },
  { code: "299", name: "Banco Comafi S.A.", kind: "cbu", shortName: "Comafi" },
  { code: "300", name: "Banco de Inversión y Comercio Exterior S.A.", kind: "cbu", shortName: "BICE" },
  { code: "301", name: "Banco Piano S.A.", kind: "cbu", shortName: "Piano" },
  { code: "305", name: "Banco Julio S.A.", kind: "cbu", shortName: "Julio" },
  { code: "309", name: "Nuevo Banco de la Rioja S.A.", kind: "cbu", shortName: "Nuevo Banco La Rioja" },
  { code: "310", name: "Banco del Sol S.A.", kind: "cbu", shortName: "Banco del Sol" },
  { code: "311", name: "Nuevo Banco del Chaco S.A.", kind: "cbu", shortName: "Nuevo Banco Chaco" },
  { code: "312", name: "Banco VOII S.A.", kind: "cbu", shortName: "Voii" },
  { code: "315", name: "Banco de Formosa S.A.", kind: "cbu", shortName: "Banco Formosa" },
  { code: "319", name: "Banco CMF S.A.", kind: "cbu", shortName: "CMF" },
  { code: "321", name: "Banco de Santiago del Estero S.A.", kind: "cbu", shortName: "Banco Santiago del Estero" },
  { code: "322", name: "Banco Industrial S.A.", kind: "cbu", shortName: "Industrial" },
  { code: "330", name: "Nuevo Banco de Santa Fe S.A.", kind: "cbu", shortName: "Nuevo Banco Santa Fe" },
  { code: "331", name: "Banco Cetelem Argentina S.A.", kind: "cbu", shortName: "Cetelem" },
  { code: "332", name: "Banco de Servicios Financieros S.A.", kind: "cbu", shortName: "BSF" },
  { code: "336", name: "Banco Bradesco Argentina S.A.U.", kind: "cbu", shortName: "Bradesco" },
  { code: "338", name: "Banco de Servicios y Transacciones S.A.", kind: "cbu", shortName: "BST" },
  { code: "339", name: "RCI Banque S.A.", kind: "cbu", shortName: "RCI Banque" },
  { code: "340", name: "BACS Banco de Crédito y Securitización S.A.", kind: "cbu", shortName: "BACS" },
  { code: "341", name: "Banco Más Ventas S.A.", kind: "cbu", shortName: "Más Ventas" },
  { code: "384", name: "Wilobank S.A.", kind: "cbu", shortName: "Wilobank" },
  { code: "386", name: "Nuevo Banco de Entre Ríos S.A.", kind: "cbu", shortName: "Nuevo Banco Entre Ríos" },
  { code: "389", name: "Banco Columbia S.A.", kind: "cbu", shortName: "Columbia" },
  { code: "405", name: "Form S.A.", kind: "cbu", shortName: "Form" },
  { code: "426", name: "Banco Bica S.A.", kind: "cbu", shortName: "Bica" },
  { code: "431", name: "Banco Coinag S.A.", kind: "cbu", shortName: "Coinag" },
  { code: "432", name: "Banco de Comercio S.A.", kind: "cbu", shortName: "Comercio" },
  { code: "434", name: "Banco Reba S.A.", kind: "cbu", shortName: "Reba" },
  { code: "437", name: "Banco Provincial de la Provincia de Salta", kind: "cbu", shortName: "Banco Salta" },
  { code: "438", name: "Compañía Financiera Argentina S.A. (Efectivo Sí)", kind: "cbu", shortName: "Efectivo Sí" },
  { code: "439", name: "Banco Rombo S.A.", kind: "cbu", shortName: "Rombo" },
  { code: "440", name: "Banco Piano S.A.", kind: "cbu", shortName: "Piano" },
  { code: "441", name: "Banco Julio S.A.", kind: "cbu", shortName: "Julio" },
  { code: "443", name: "Banco Cofidis S.A.", kind: "cbu", shortName: "Cofidis" },
  { code: "445", name: "Banco Cordial S.A.", kind: "cbu", shortName: "Cordial" },
  { code: "448", name: "Banco Dino S.A.", kind: "cbu", shortName: "Dino" },
  { code: "453", name: "Banco PSA Finance Argentina S.A.", kind: "cbu", shortName: "PSA Finance" },
  { code: "515", name: "Banco Toyota Compañía Financiera S.A.", kind: "cbu", shortName: "Toyota" },

  // PSPs / Fintechs (CVU codes — heuristic; BCRA list of payment service providers)
  { code: "143", name: "Brubank S.A.U.", kind: "cvu", shortName: "Brubank" }, // also bank
  { code: "384", name: "Wilobank S.A.", kind: "cvu", shortName: "Wilobank" }, // also bank
  // Note: most PSPs use CVUs that start with "000" + a 4-digit subcode. The
  // first 3 digits (the "code" field of this table) is "000" for those, and
  // the discriminating prefix is the 4-digit subcode at positions 3-7. We
  // detect those via `lookupCvuByPrefix()` instead.
];

/**
 * PSPs (CVU issuers) keyed by the FULL first-7-digit prefix of the CVU
 * (entity 000 + 4-digit fintech subcode). Use `lookupCvuByPrefix()` to find
 * the issuer for a given CVU; standard `lookupBankByCode()` won't help
 * because every PSP shares entity code 000.
 */
const PSPS_BY_PREFIX: Record<string, BankInfo> = {
  "0000003": { code: "0000003", name: "Mercado Pago S.R.L.", kind: "cvu", shortName: "Mercado Pago" },
  "0000031": { code: "0000031", name: "Mercado Pago S.R.L.", kind: "cvu", shortName: "Mercado Pago" },
  "0000007": { code: "0000007", name: "Ualá (Bancar Technologies S.A.)", kind: "cvu", shortName: "Ualá" },
  "0000058": { code: "0000058", name: "Naranja X (Tarjeta Naranja S.A.U.)", kind: "cvu", shortName: "Naranja X" },
  "0000074": { code: "0000074", name: "Personal Pay (Telecom Argentina S.A.)", kind: "cvu", shortName: "Personal Pay" },
  "0000075": { code: "0000075", name: "Cuenta DNI (Banco Provincia)", kind: "cvu", shortName: "Cuenta DNI" },
  "0000172": { code: "0000172", name: "Belo (BeloCoin S.A.)", kind: "cvu", shortName: "Belo" },
  "0000273": { code: "0000273", name: "Prex (Prex Argentina S.A.)", kind: "cvu", shortName: "Prex" },
};

const BANKS_BY_CODE: Map<string, BankInfo> = (() => {
  const map = new Map<string, BankInfo>();
  // Iterate in order; the first occurrence wins (so traditional bank entries
  // beat duplicate-code CVU entries). Brubank is duplicated intentionally for
  // both kinds; downstream `parseCbu()` distinguishes via prefix lookup too.
  for (const bank of BANKS) {
    if (!map.has(bank.code)) map.set(bank.code, bank);
  }
  return map;
})();

/**
 * Look up a bank/PSP by its 3-digit entity code (the first 3 digits of a
 * CBU). Returns `null` when the code isn't in the table.
 *
 * For CVUs (entity code 000), this returns null — use `lookupCvuByPrefix()`
 * with the 7-digit prefix (000 + 4-digit fintech subcode) instead.
 */
export function lookupBankByCode(code: string): BankInfo | null {
  return BANKS_BY_CODE.get(code) ?? null;
}

/**
 * Look up a CVU issuer (PSP/fintech) by the 7-digit prefix of the CVU,
 * which is `000` plus the 4-digit fintech subcode. Use this to identify
 * which PSP issued a CVU starting with `000`.
 *
 * Returns `null` when the prefix isn't in the table — the CVU may still be
 * structurally valid (BCRA's PSP list evolves quickly).
 *
 * @example
 * lookupCvuByPrefix("0000031") // → { name: "Mercado Pago...", kind: "cvu", ... }
 */
export function lookupCvuByPrefix(prefix7: string): BankInfo | null {
  return PSPS_BY_PREFIX[prefix7] ?? null;
}

/**
 * Returns all known banks/entities. Useful for UIs that render a select
 * dropdown of banks. Sorted by code.
 */
export function listBanks(): BankInfo[] {
  return [...BANKS_BY_CODE.values()].sort((a, b) =>
    a.code.localeCompare(b.code),
  );
}

/**
 * Returns all known PSP issuers (keyed by 7-digit prefix). Useful for UIs
 * that render a select dropdown of fintech wallets.
 */
export function listPsps(): BankInfo[] {
  return Object.values(PSPS_BY_PREFIX).sort((a, b) =>
    a.code.localeCompare(b.code),
  );
}
