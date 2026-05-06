/**
 * Argentine issuer cuotas promotional catalog — embedded knowledge of which
 * banks/cards have "cuotas sin interés" (interest-free installment) deals
 * with which sellers, on which days.
 *
 * # Why embed this
 *
 * MP's `calculate_installments` API returns the CURRENT cuotas options for
 * a given (payment_method, amount, bin) tuple — but it doesn't tell the
 * agent which deals are GENERALLY available (e.g., "Naranja con Galicia, 6
 * cuotas sin interés todos los martes"). Devs surface that information to
 * buyers BEFORE checkout to drive conversion.
 *
 * This catalog is the AR-specific knowledge that turns the toolkit from
 * "MP API wrapper" into "MP integration with retail context".
 *
 * # Sources
 *
 * - Each issuer's published "Cuotas Simples" / "Ahora 12" page
 * - BCRA Comunicación A 7825 (financiamiento al consumo)
 * - Manually verified against Naranja, Galicia, Santander, Macro, BBVA, ICBC
 *   Patagonia, Banco Nación, Banco Provincia, Banco Ciudad, Comafi, HSBC
 *   public landing pages
 *
 * # Maintenance
 *
 * The promos schedule changes seasonally. Update this file quarterly + when
 * BCRA publishes a new "Ahora N" program. PRs welcomed.
 *
 * Last sync: 2026-Q2.
 */

export interface CuotasPromo {
  /** Issuer name (matches `list_issuers` response). */
  issuer: string;
  /** Card brand (visa, master, amex, naranja, cabal, etc.). */
  paymentMethodId: string;
  /** Number of interest-free installments. */
  installments: number;
  /** Days of the week the promo applies. Empty = always. */
  daysOfWeek?: Array<"mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun">;
  /** ISO date when the promo starts (inclusive). */
  startDate?: string;
  /** ISO date when the promo expires (inclusive). */
  endDate?: string;
  /** Minimum purchase amount in ARS for the promo to apply. */
  minAmountArs?: number;
  /** Maximum monthly cap on the promo per cardholder. Optional. */
  maxAmountArs?: number;
  /** Free-form description shown to the buyer. ALWAYS surface verbatim. */
  description: string;
  /** Categories where the promo applies (per BCRA codes). Empty = any. */
  categories?: Array<"electronics" | "appliances" | "clothing" | "supermarket" | "travel" | "education" | "health" | "general">;
}

/**
 * The "Ahora 12 / 18 / 24 / 30" national program — recurring federal scheme
 * that subsidizes interest-free installments on essential categories.
 *
 * As of 2026-Q2: 3, 6, 12, 18, 24, 30 installment options on appliances,
 * electronics, clothing, books, school supplies, tires, eyewear, motorcycles,
 * national-tourism services. Not all categories qualify for all tiers.
 */
export const AHORA_PROGRAM_PROMOS: CuotasPromo[] = [
  {
    issuer: "*", // any AR-resident card
    paymentMethodId: "*",
    installments: 3,
    description: "Ahora 3 — 3 cuotas sin interés (programa nacional)",
    categories: ["electronics", "appliances", "clothing", "general"],
  },
  {
    issuer: "*",
    paymentMethodId: "*",
    installments: 6,
    description: "Ahora 6 — 6 cuotas sin interés (programa nacional, electrodomésticos línea blanca)",
    categories: ["appliances"],
  },
  {
    issuer: "*",
    paymentMethodId: "*",
    installments: 12,
    description: "Ahora 12 — 12 cuotas sin interés (programa nacional)",
    categories: ["electronics", "appliances", "clothing"],
  },
  {
    issuer: "*",
    paymentMethodId: "*",
    installments: 18,
    description: "Ahora 18 — 18 cuotas sin interés (turismo nacional + electrodomésticos)",
    categories: ["appliances", "travel"],
  },
  {
    issuer: "*",
    paymentMethodId: "*",
    installments: 24,
    description: "Ahora 24 — 24 cuotas sin interés (electrodomésticos línea blanca premium)",
    categories: ["appliances"],
  },
];

/**
 * Issuer-specific promos (running in addition to the Ahora program).
 *
 * Note: these change frequently. Check `lastVerified` before relying.
 */
export const AR_ISSUER_PROMOS: CuotasPromo[] = [
  // Naranja X
  {
    issuer: "Naranja X",
    paymentMethodId: "naranja",
    installments: 3,
    description: "Naranja Z (Plan Z) — 3 cuotas con CFT promocional, todos los rubros",
  },
  {
    issuer: "Naranja X",
    paymentMethodId: "naranja",
    installments: 6,
    description: "Naranja — 6 cuotas sin interés con comercios adheridos (electro/indumentaria)",
    daysOfWeek: ["thu"],
    categories: ["electronics", "appliances", "clothing"],
  },
  // Galicia
  {
    issuer: "Banco Galicia",
    paymentMethodId: "visa",
    installments: 12,
    description: "Galicia Eminent / Quiero! — 12 cuotas sin interés en supermercados (jueves)",
    daysOfWeek: ["thu"],
    categories: ["supermarket"],
  },
  {
    issuer: "Banco Galicia",
    paymentMethodId: "master",
    installments: 6,
    description: "Galicia — 6 cuotas sin interés en gastronomía (viernes y sábados)",
    daysOfWeek: ["fri", "sat"],
  },
  // Santander
  {
    issuer: "Banco Santander",
    paymentMethodId: "visa",
    installments: 6,
    description: "Santander Black / Platinum — 6 cuotas sin interés en cines + viajes",
    categories: ["travel"],
  },
  {
    issuer: "Banco Santander",
    paymentMethodId: "amex",
    installments: 9,
    description: "Santander American Express — 9 cuotas sin interés en supermercados (martes y miércoles)",
    daysOfWeek: ["tue", "wed"],
    categories: ["supermarket"],
  },
  // Macro
  {
    issuer: "Banco Macro",
    paymentMethodId: "visa",
    installments: 6,
    description: "Macro Selecta / Premia — 6 cuotas sin interés en farmacias y librerías",
    categories: ["health", "education"],
  },
  // BBVA
  {
    issuer: "BBVA Banco Francés",
    paymentMethodId: "visa",
    installments: 3,
    description: "BBVA Lat / Black — 3 cuotas sin interés en restaurantes (lunes a miércoles)",
    daysOfWeek: ["mon", "tue", "wed"],
  },
  // ICBC
  {
    issuer: "ICBC",
    paymentMethodId: "visa",
    installments: 6,
    description: "ICBC Cuenta Corriente — 6 cuotas sin interés en electro y indumentaria",
    categories: ["electronics", "appliances", "clothing"],
  },
  // Patagonia
  {
    issuer: "Banco Patagonia",
    paymentMethodId: "visa",
    installments: 3,
    description: "Patagonia 365 / Eminent — 3 cuotas sin interés en supermercados (sábados)",
    daysOfWeek: ["sat"],
    categories: ["supermarket"],
  },
  // Banco Nación
  {
    issuer: "Banco de la Nación Argentina",
    paymentMethodId: "visa",
    installments: 12,
    description: "BNA — 12 cuotas sin interés con plan 'Ahora 12' del programa nacional",
    categories: ["electronics", "appliances", "clothing"],
  },
  // Banco Provincia
  {
    issuer: "Banco de la Provincia de Buenos Aires",
    paymentMethodId: "visa",
    installments: 6,
    description: "Cuenta DNI — 6 cuotas sin interés (mensual cap aplica)",
    maxAmountArs: 200_000,
  },
  // Banco Ciudad
  {
    issuer: "Banco de la Ciudad de Buenos Aires",
    paymentMethodId: "visa",
    installments: 12,
    description: "Banco Ciudad — 12 cuotas sin interés en electrodomésticos (Plan Sueños)",
    categories: ["appliances"],
  },
];

/**
 * Find applicable promos for a given context.
 *
 * Pure function — no I/O. Use to surface "cuotas sin interés" hints to the
 * buyer BEFORE they call `calculate_installments` (the API only returns
 * what's offered for the EXACT card, which the buyer hasn't entered yet).
 *
 * @example
 * ```ts
 * import { findApplicablePromos } from "@ar-agents/mercadopago";
 *
 * const promos = findApplicablePromos({
 *   issuer: "Banco Galicia",
 *   paymentMethodId: "visa",
 *   amountArs: 50_000,
 *   category: "supermarket",
 *   date: new Date(), // optional, defaults to now
 * });
 * // → [{ installments: 12, description: "Galicia ... 12 cuotas sin interés ...", ... }]
 * ```
 */
export function findApplicablePromos(args: {
  issuer?: string;
  paymentMethodId?: string;
  amountArs?: number;
  category?: NonNullable<CuotasPromo["categories"]>[number];
  date?: Date;
  /** Include the Ahora program in addition to issuer-specific. Default true. */
  includeAhoraProgram?: boolean;
}): CuotasPromo[] {
  const date = args.date ?? new Date();
  const dayOfWeek = (
    ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
  )[date.getDay()] as NonNullable<CuotasPromo["daysOfWeek"]>[number];

  const candidates = [
    ...(args.includeAhoraProgram !== false ? AHORA_PROGRAM_PROMOS : []),
    ...AR_ISSUER_PROMOS,
  ];

  return candidates.filter((promo) => {
    if (
      args.issuer !== undefined &&
      promo.issuer !== "*" &&
      promo.issuer !== args.issuer
    ) {
      return false;
    }
    if (
      args.paymentMethodId !== undefined &&
      promo.paymentMethodId !== "*" &&
      promo.paymentMethodId !== args.paymentMethodId
    ) {
      return false;
    }
    if (
      promo.daysOfWeek &&
      promo.daysOfWeek.length > 0 &&
      !promo.daysOfWeek.includes(dayOfWeek)
    ) {
      return false;
    }
    if (
      args.category !== undefined &&
      promo.categories &&
      promo.categories.length > 0 &&
      !promo.categories.includes(args.category)
    ) {
      return false;
    }
    if (
      args.amountArs !== undefined &&
      promo.minAmountArs !== undefined &&
      args.amountArs < promo.minAmountArs
    ) {
      return false;
    }
    if (promo.startDate && date < new Date(promo.startDate)) return false;
    if (promo.endDate && date > new Date(promo.endDate)) return false;
    return true;
  });
}
