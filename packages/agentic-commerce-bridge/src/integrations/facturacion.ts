// AR-fiscal compliance — auto-emit AFIP/ARCA Factura A/B/C/E on order
// confirmation, embed CAE in order metadata.
//
// This is the moat of the LATAM bridge: when the agent completes an
// ACP checkout against a monotributista or RI seller, the host emits a
// proper electronic invoice automatically — no third-party dependency, no
// scheduled job, just a hook on `onOrderConfirmed`.
//
// Duck-typed: the host provides:
//   1. A `wsfeClient` (or a function) that talks to AFIP WSFE — typically
//      `@ar-agents/facturacion`'s `WsfeClient`.
//   2. An `arcaPadronLookup` (or a function) that resolves CUIT → condition
//      IVA — typically `@ar-agents/identity`'s `ws_sr_constancia_inscripcion`.
//   3. A `seller` config (CUIT, punto de venta, regime — A/B/C/E).
//
// The factura type is auto-selected from the buyer's IVA condition:
//   - Buyer is RI       → Factura A (or B if seller is monotributo)
//   - Buyer is consumer → Factura B (or C if seller is monotributo)
//   - Cross-border      → Factura E
// Legacy edge cases (exempt, monotributo-buyer) handled per the matrix below.

import type {
  FacilitatorHooks,
  CheckoutSession,
  Order,
} from "../handlers/types";
import type { Metadata } from "../schemas/common";

/** Seller's fiscal regime per AFIP. */
export type SellerRegime =
  | "monotributo" // Régimen Simplificado
  | "responsable_inscripto"
  | "exento";

/** Buyer's IVA condition resolved via ARCA padrón lookup. */
export type BuyerIvaCondition =
  | "responsable_inscripto"
  | "monotributista"
  | "exento"
  | "consumidor_final"
  | "no_categorizado"
  | "extranjero" // CBT / cross-border buyer
  | "iva_no_alcanzado";

/** Factura type per AFIP. */
export type FacturaType = "A" | "B" | "C" | "E";

/**
 * Buyer fiscal data, normalized. Looked up via ARCA padrón when the buyer
 * provides a CUIT/CUIL; otherwise treated as `consumidor_final`.
 */
export interface BuyerFiscal {
  iva_condition: BuyerIvaCondition;
  /** CUIT/CUIL/DNI/PASSPORT etc. */
  doc_type?: "CUIT" | "CUIL" | "DNI" | "PASSPORT" | "OTHER";
  doc_number?: string;
  legal_name?: string;
}

/** Seller fiscal data — comes from facilitator config. */
export interface SellerFiscal {
  cuit: string;
  /** AFIP punto de venta. */
  punto_venta: number;
  regime: SellerRegime;
  /** Optional human-readable seller name (printed on receipt). */
  legal_name?: string;
}

/**
 * Rule matrix mapping (seller regime, buyer condition) → factura type.
 *
 * Non-AR sellers / buyers fall through to `null` (no factura emitted).
 */
export function selectFacturaType(
  sellerRegime: SellerRegime,
  buyerCondition: BuyerIvaCondition,
): FacturaType | null {
  if (buyerCondition === "extranjero") return "E";

  if (sellerRegime === "monotributo") {
    // Cat A monotributistas always emit Factura C (regardless of buyer).
    return "C";
  }

  if (sellerRegime === "responsable_inscripto") {
    if (
      buyerCondition === "responsable_inscripto" ||
      buyerCondition === "monotributista"
    ) {
      return "A";
    }
    if (buyerCondition === "exento" || buyerCondition === "iva_no_alcanzado") {
      return "B"; // strictly should be A in some cases; defer to host override
    }
    // consumidor_final, no_categorizado → B
    return "B";
  }

  if (sellerRegime === "exento") {
    return "B";
  }

  return null;
}

/**
 * Minimal duck-typed WSFE client shape — matches `@ar-agents/facturacion`'s
 * `WsfeClient.solicitarCAE` plus what we need from it.
 */
export interface WsfeAuthorizeRequest {
  factura_type: FacturaType;
  punto_venta: number;
  cuit_emisor: string;
  importe_neto: number; // major units
  importe_iva: number; // major units
  importe_total: number; // major units
  currency: string; // uppercase ISO 4217
  fecha: string; // YYYYMMDD
  doc_tipo?: number; // 80 = CUIT, 86 = CUIL, 96 = DNI, 99 = "consumidor final"
  doc_numero?: string;
  concepto?: number; // 1 = productos, 2 = servicios, 3 = ambos
  iva_alicuotas?: Array<{ id: number; base: number; importe: number }>;
}

export interface WsfeAuthorizeResponse {
  cae: string;
  vencimiento_cae: string; // YYYYMMDD
  numero_comprobante: number;
  resultado: "A" | "R"; // Aprobado / Rechazado
  observaciones?: string[];
}

export interface WsfeClientLike {
  solicitarCAE(req: WsfeAuthorizeRequest): Promise<WsfeAuthorizeResponse>;
}

/**
 * Minimal duck-typed ARCA padrón shape. Matches the response of
 * `@ar-agents/identity`'s `ws_sr_constancia_inscripcion` adapter — the
 * canonical lookup that returns `condicionIVA`, `monotributo`, etc.
 */
export interface ArcaPadronLookupResult {
  cuit: string;
  legal_name?: string;
  iva_condition?: BuyerIvaCondition;
  monotributo_category?: string | null;
}

export type ArcaPadronLookup = (
  cuit: string,
) => Promise<ArcaPadronLookupResult | null>;

export interface FacturacionHookOptions {
  /** Static seller fiscal data. */
  seller: SellerFiscal;
  /** WSFE client. */
  wsfe: WsfeClientLike;
  /** Optional padron lookup for buyer condition resolution by CUIT. */
  arcaPadronLookup?: ArcaPadronLookup;
  /**
   * Override: explicit buyer-fiscal resolver. If set, wins over padron
   * lookup. Useful when the agent already provides fiscal data via session
   * metadata.
   */
  resolveBuyer?: (session: CheckoutSession) => Promise<BuyerFiscal | null>;
  /**
   * IVA percent per the seller's regime. Default behavior:
   *   - `monotributo` → 0 (factura C has no IVA breakdown)
   *   - `responsable_inscripto` → 21 (default Argentine IVA rate)
   *   - `exento` → 0
   * Override for items at 10.5% or 27%.
   */
  ivaPercent?: number;
  /**
   * Override the factura type selection (e.g. for special cases).
   */
  selectFacturaType?: (
    seller: SellerRegime,
    buyer: BuyerIvaCondition,
  ) => FacturaType | null;
  /**
   * Hook to log emission attempts (success or fail). Useful for telemetry.
   */
  onEmission?: (event: {
    success: boolean;
    session_id: string;
    order_id: string;
    cae?: string;
    factura_type?: FacturaType;
    error?: string;
  }) => void | Promise<void>;
  /**
   * Major-unit divisor per ACP minor units. Default: 100 (most LATAM
   * currencies are 2-decimal). Override for CLP/PYG (1).
   */
  divisor?: number;
}

const DEFAULT_DIVISOR = 100;

const DOC_TYPE_MAP: Record<NonNullable<BuyerFiscal["doc_type"]>, number> = {
  CUIT: 80,
  CUIL: 86,
  DNI: 96,
  PASSPORT: 94,
  OTHER: 99,
};

/**
 * Build a `FacilitatorHooks` object that auto-emits Factura A/B/C/E on order
 * confirmation. Returned hooks include `onOrderConfirmed`, which the bridge
 * invokes after payment authorization but before persisting the order. The
 * resulting `metadata` is merged into `Order.metadata`.
 *
 * Failure mode: if WSFE rejects or padron lookup fails, the order STILL
 * persists (payment was already authorized). The error is captured in
 * `order.metadata.factura_error` and the seller can re-emit out-of-band.
 */
export function createFacturacionHook(
  options: FacturacionHookOptions,
): FacilitatorHooks {
  const divisor = options.divisor ?? DEFAULT_DIVISOR;
  const ivaPercent = resolveIvaPercent(options);
  const choose = options.selectFacturaType ?? selectFacturaType;

  return {
    onOrderConfirmed: async ({ session, order }) => {
      const buyer = await resolveBuyerFiscal(session, options);
      if (!buyer) {
        return {
          metadata: {
            factura_skipped: "no_buyer_fiscal_resolved",
          },
        };
      }
      const facturaType = choose(options.seller.regime, buyer.iva_condition);
      if (!facturaType) {
        return {
          metadata: {
            factura_skipped: "no_applicable_factura_type",
          },
        };
      }

      const totalMinor =
        session.totals.find((t) => t.type === "total")?.amount ?? 0;
      const importeTotal = totalMinor / divisor;
      const importeNeto =
        ivaPercent > 0 ? importeTotal / (1 + ivaPercent / 100) : importeTotal;
      const importeIva = importeTotal - importeNeto;

      const wsfeReq: WsfeAuthorizeRequest = {
        factura_type: facturaType,
        punto_venta: options.seller.punto_venta,
        cuit_emisor: options.seller.cuit,
        importe_neto: round2(importeNeto),
        importe_iva: round2(importeIva),
        importe_total: round2(importeTotal),
        currency: session.currency.toUpperCase(),
        fecha: yyyyMMdd(new Date()),
        concepto: 1,
        ...(buyer.doc_type !== undefined
          ? { doc_tipo: DOC_TYPE_MAP[buyer.doc_type] }
          : {}),
        ...(buyer.doc_number !== undefined
          ? { doc_numero: buyer.doc_number }
          : {}),
      };

      try {
        const result = await options.wsfe.solicitarCAE(wsfeReq);
        if (result.resultado !== "A") {
          await options.onEmission?.({
            success: false,
            session_id: session.id,
            order_id: order.id,
            factura_type: facturaType,
            error: `WSFE rejected: ${result.observaciones?.join("; ") ?? "no detail"}`,
          });
          return {
            metadata: buildErrorMetadata(
              facturaType,
              `WSFE rejected: ${result.observaciones?.join("; ") ?? "no detail"}`,
            ),
          };
        }
        await options.onEmission?.({
          success: true,
          session_id: session.id,
          order_id: order.id,
          cae: result.cae,
          factura_type: facturaType,
        });
        const meta: Metadata = {
          factura_type: facturaType,
          factura_cae: result.cae,
          factura_cae_vencimiento: result.vencimiento_cae,
          factura_numero: result.numero_comprobante,
          factura_punto_venta: options.seller.punto_venta,
          factura_cuit_emisor: options.seller.cuit,
          factura_importe_neto: round2(importeNeto),
          factura_importe_iva: round2(importeIva),
          factura_importe_total: round2(importeTotal),
          ...(buyer.legal_name !== undefined
            ? { factura_buyer_legal_name: buyer.legal_name }
            : {}),
          ...(buyer.doc_number !== undefined
            ? { factura_buyer_doc: buyer.doc_number }
            : {}),
        };
        return { metadata: meta };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await options.onEmission?.({
          success: false,
          session_id: session.id,
          order_id: order.id,
          factura_type: facturaType,
          error: message,
        });
        return {
          metadata: buildErrorMetadata(facturaType, message),
        };
      }
    },
  };
}

function resolveIvaPercent(options: FacturacionHookOptions): number {
  if (options.ivaPercent !== undefined) return options.ivaPercent;
  if (options.seller.regime === "responsable_inscripto") return 21;
  return 0;
}

async function resolveBuyerFiscal(
  session: CheckoutSession,
  options: FacturacionHookOptions,
): Promise<BuyerFiscal | null> {
  if (options.resolveBuyer) {
    const r = await options.resolveBuyer(session);
    if (r) return r;
  }

  // Attempt padron lookup if buyer.company.tax_id is a CUIT.
  const taxId = session.buyer?.company?.tax_id;
  if (taxId && options.arcaPadronLookup) {
    const cuit = taxId.replace(/[^0-9]/g, "");
    if (cuit.length === 11) {
      const padron = await options.arcaPadronLookup(cuit);
      if (padron?.iva_condition) {
        return {
          iva_condition: padron.iva_condition,
          doc_type: "CUIT",
          doc_number: cuit,
          ...(padron.legal_name !== undefined
            ? { legal_name: padron.legal_name }
            : {}),
        };
      }
    }
  }

  // Default: consumidor final.
  if (session.buyer?.email) {
    return { iva_condition: "consumidor_final" };
  }
  return null;
}

function buildErrorMetadata(
  facturaType: FacturaType,
  error: string,
): Metadata {
  return {
    factura_type: facturaType,
    factura_error: error,
  };
}

function yyyyMMdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
