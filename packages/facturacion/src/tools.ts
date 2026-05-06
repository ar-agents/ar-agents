import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { WsfeClient } from "./wsfe-client";
import { describeCbteTipo, type CbteTipoCode } from "./catalogs";
import { validateSolicitarCae } from "./validator";
import type { SolicitarCaeInput } from "./types";

export interface FacturacionToolsOptions {
  /**
   * The configured `WsfeClient`. If you don't pass one, the tools return
   * `{ available: false, error: <setup instructions> }` instead of crashing.
   * Useful for stub deployments or local dev without a cert.
   */
  wsfe?: WsfeClient;
  /**
   * Override the agent-facing tool descriptions. Useful when the agent's
   * primary language isn't English/Spanish.
   */
  descriptions?: Partial<Record<FacturacionToolName, string>>;
  /**
   * Default punto de venta. When set, agents can omit `ptoVta` from inputs.
   * Most SaaS issue from a single PtoVta — passing it once at boot avoids
   * the agent having to remember it.
   */
  defaultPtoVta?: number;
}

export type FacturacionToolName =
  | "emitir_factura"
  | "consultar_ultimo_comprobante"
  | "consultar_factura_emitida"
  | "obtener_tipos_comprobante"
  | "obtener_tipos_documento"
  | "obtener_alicuotas_iva"
  | "obtener_tipos_concepto"
  | "obtener_tipos_moneda"
  | "obtener_cotizacion"
  | "health_check_afip";

const DEFAULT_DESCRIPTIONS: Record<FacturacionToolName, string> = {
  emitir_factura:
    "Emitir una factura electrónica vía AFIP/ARCA WSFE. Solicita el CAE (Código de Autorización Electrónico) que valida la factura ante AFIP. RETURNS: el CAE (14 dígitos), su fecha de vencimiento, y el número de comprobante asignado, o errors/observaciones si AFIP rechazó. SIDE EFFECT: el CAE queda registrado en AFIP — NO se puede deshacer; para anular, emitir Nota de Crédito. PRE-FLIGHT: validate_cuit (del receptor) + consultar_ultimo_comprobante para obtener el próximo número. CONSTRAINTS: ImpTotal = ImpNeto + ImpIVA + ImpOpEx + ImpTrib + ImpTotConc (AFIP error 10048 si no). Para Factura C (monotributista), ImpIVA debe ser 0 y no incluir filas iva. Para Servicios, fchServDesde/Hasta/VtoPago obligatorios. Para Notas de Crédito/Débito, cbtesAsoc obligatorio referenciando el comprobante original. The lib pre-valida estas reglas localmente antes del round-trip a AFIP.",

  consultar_ultimo_comprobante:
    "Consultar el último número de comprobante autorizado para un (PtoVta, CbteTipo) — i.e. cuál fue el número del último Factura C emitido desde el punto de venta 1. USE BEFORE emitir_factura para obtener el próximo número (último + 1). Returns 0 si nunca se emitió un comprobante de ese tipo desde ese PtoVta — entonces el próximo es 1. PURE READ: no side effects.",

  consultar_factura_emitida:
    "Consultar los detalles completos de una factura ya emitida (CAE, fecha, importes, doc receptor). USE WHEN: necesitás verificar que un CAE es válido y matchea con tu base de datos, o estás migrando de otro sistema y querés re-cargar facturas históricas. PURE READ: no side effects.",

  obtener_tipos_comprobante:
    "Listar los tipos de comprobante disponibles según AFIP (Factura A=1, B=6, C=11, Nota Crédito A=3, etc.). USE WHEN: necesitás mostrar al usuario la lista actualizada (puede haber tipos nuevos que no están en los catalogs hard-coded del lib). HEAVY: hace network round-trip a AFIP — para flujos comunes preferí los constants de `CbteTipo` en `@ar-agents/facturacion`.",

  obtener_tipos_documento:
    "Listar los tipos de documento que AFIP acepta (CUIT=80, DNI=96, Pasaporte=94, Consumidor Final=99, etc.). HEAVY: round-trip a AFIP. Preferí los constants de `DocTipo` para flujos comunes.",

  obtener_alicuotas_iva:
    "Listar las alícuotas de IVA disponibles según AFIP (21%=5, 10.5%=4, 27%=6, 0%=3, etc.). USE WHEN: el usuario necesita ver las opciones para construir una factura B o A. HEAVY: round-trip a AFIP. Preferí `AlicuotaIva` constants para flujos comunes.",

  obtener_tipos_concepto:
    "Listar los tipos de concepto: Productos (1), Servicios (2), Productos y Servicios (3). HEAVY: round-trip a AFIP. Preferí `Concepto` constants.",

  obtener_tipos_moneda:
    "Listar las monedas que WSFE acepta para emitir facturas (PES = Pesos, DOL = Dólar, 060 = Euro, 012 = Real, etc.). USE WHEN: el usuario quiere emitir Factura E (exportación) o multi-moneda. HEAVY: round-trip a AFIP.",

  obtener_cotizacion:
    "Obtener la cotización oficial AFIP de una moneda extranjera vs ARS. REQUIRED antes de emitir cualquier factura no-PES (AFIP rechaza si la cotización está desactualizada). Devuelve el monCotiz a usar en `emitir_factura`. PURE READ.",

  health_check_afip:
    "Health check de AFIP WSFE — devuelve el status de los servidores app, db, y auth. Use as a /health endpoint o como pre-flight rápido antes de emitir muchas facturas. PURE READ, latencia < 200ms.",
};

export function facturacionTools(
  options: FacturacionToolsOptions = {},
): ToolSet {
  const wsfe = options.wsfe;
  const desc = (name: FacturacionToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];
  const dPv = options.defaultPtoVta;

  const requireWsfe = (): WsfeClient | { _notConfigured: true } => {
    if (!wsfe) return { _notConfigured: true };
    return wsfe;
  };

  const notConfiguredResult = (op: string) => ({
    available: false,
    error: `WSFE no está configurado en este agente (${op} requiere un WsfeClient). Pasale uno a facturacionTools({ wsfe: new WsfeClient({...}) }). Necesitás cert + key X.509 emitidos por ARCA y autorizados para el servicio "wsfe".`,
    data: null,
  });

  return {
    emitir_factura: tool({
      description: desc("emitir_factura"),
      inputSchema: z.object({
        ptoVta: z.number().int().positive().optional().describe(
          "Punto de venta (1-99999). Omitible si pasaste defaultPtoVta al construir las tools.",
        ),
        cbteTipo: z
          .union([
            // A-series (responsables inscriptos, IVA discriminado)
            z.literal(1).describe("Factura A"),
            z.literal(2).describe("Nota de Débito A"),
            z.literal(3).describe("Nota de Crédito A"),
            z.literal(4).describe("Recibo A"),
            z.literal(5).describe("Nota de Venta al Contado A"),
            // B-series (consumidor final / no inscriptos, IVA incluido)
            z.literal(6).describe("Factura B"),
            z.literal(7).describe("Nota de Débito B"),
            z.literal(8).describe("Nota de Crédito B"),
            z.literal(9).describe("Recibo B"),
            z.literal(10).describe("Nota de Venta al Contado B"),
            // C-series (monotributo)
            z.literal(11).describe("Factura C"),
            z.literal(12).describe("Nota de Débito C"),
            z.literal(13).describe("Nota de Crédito C"),
            z.literal(15).describe("Recibo C"),
            // E-series (exportación)
            z.literal(19).describe("Factura E (exportación)"),
            z.literal(20).describe("Nota de Débito E"),
            z.literal(21).describe("Nota de Crédito E"),
            // M-series (monotributistas con renta presunta)
            z.literal(51).describe("Factura M"),
            z.literal(52).describe("Nota de Débito M"),
            z.literal(53).describe("Nota de Crédito M"),
            z.literal(54).describe("Recibo M"),
            // FCE MiPyMEs (RG 4367/2018)
            z.literal(201).describe("FCE MiPyMEs Factura A"),
            z.literal(202).describe("FCE MiPyMEs Nota de Débito A"),
            z.literal(203).describe("FCE MiPyMEs Nota de Crédito A"),
            z.literal(206).describe("FCE MiPyMEs Factura B"),
            z.literal(207).describe("FCE MiPyMEs Nota de Débito B"),
            z.literal(208).describe("FCE MiPyMEs Nota de Crédito B"),
            z.literal(211).describe("FCE MiPyMEs Factura C"),
            z.literal(212).describe("FCE MiPyMEs Nota de Débito C"),
            z.literal(213).describe("FCE MiPyMEs Nota de Crédito C"),
          ])
          .describe(
            "Tipo de comprobante AFIP. Lista cerrada — debe coincidir con CbteTipo en catalogs.ts. Si AFIP agrega nuevos códigos, agregalos a CbteTipo y a este union juntos.",
          ),
        concepto: z
          .union([
            z.literal(1).describe("Productos"),
            z.literal(2).describe("Servicios"),
            z.literal(3).describe("Productos y Servicios"),
          ])
          .describe("1 = Productos, 2 = Servicios, 3 = Productos y Servicios."),
        docTipo: z
          .union([
            z.literal(80).describe("CUIT"),
            z.literal(86).describe("CUIL"),
            z.literal(87).describe("CDI (Cédula de Identificación)"),
            z.literal(89).describe("LE (Libreta de Enrolamiento)"),
            z.literal(90).describe("LC (Libreta Cívica)"),
            z.literal(91).describe("CI Extranjera"),
            z.literal(92).describe("En Trámite"),
            z.literal(93).describe("Acta de Nacimiento"),
            z.literal(94).describe("Pasaporte"),
            z.literal(95).describe("CI Buenos Aires (RNP)"),
            z.literal(96).describe("DNI"),
            z.literal(99).describe("Consumidor Final (DocNro: 0)"),
          ])
          .describe(
            "Tipo de documento del receptor — lista cerrada AFIP. Debe coincidir con DocTipo en catalogs.ts.",
          ),
        docNro: z.union([z.string(), z.number()]).describe(
          "Número de documento del receptor. Para Consumidor Final pasá 0.",
        ),
        cbteFch: z.string().regex(/^\d{8}$/).describe(
          'Fecha del comprobante en formato YYYYMMDD (ej: "20260506"). Debe estar dentro de ±5 días de hoy (servicios: ±10).',
        ),
        impTotal: z.number().nonnegative().finite().describe(
          "Importe total de la factura. Debe ser igual a impNeto + impIVA + impOpEx + impTrib + impTotConc.",
        ),
        impNeto: z.number().nonnegative().finite().describe(
          "Importe neto gravado (subtotal antes de IVA).",
        ),
        impIVA: z.number().nonnegative().finite().describe(
          "Importe IVA. Para Factura C debe ser 0. Para A/B = sum(iva[].importe).",
        ),
        impTotConc: z.number().nonnegative().finite().optional().describe(
          "Importe neto no gravado. Default 0.",
        ),
        impOpEx: z.number().nonnegative().finite().optional().describe(
          "Importe operaciones exentas. Default 0.",
        ),
        impTrib: z.number().nonnegative().finite().optional().describe(
          "Importe total de tributos (provinciales/municipales). Default 0.",
        ),
        cbteDesde: z.number().int().positive().describe(
          "Número del comprobante a emitir. Obtenelo con consultar_ultimo_comprobante() + 1.",
        ),
        fchServDesde: z.string().regex(/^\d{8}$/).optional().describe(
          "Servicios: fecha de inicio del período (YYYYMMDD).",
        ),
        fchServHasta: z.string().regex(/^\d{8}$/).optional().describe(
          "Servicios: fecha de fin del período (YYYYMMDD).",
        ),
        fchVtoPago: z.string().regex(/^\d{8}$/).optional().describe(
          "Servicios: fecha de vencimiento del pago (YYYYMMDD).",
        ),
        monId: z.string().optional().describe(
          'Moneda. Default "PES". Otras: "DOL", "060" (Euro), "012" (Real).',
        ),
        monCotiz: z.number().optional().describe(
          "Cotización vs ARS. Default 1 para PES. Para otras monedas obtenelo con obtener_cotizacion().",
        ),
        iva: z
          .array(
            z.object({
              id: z
                .union([
                  z.literal(3).describe("0%"),
                  z.literal(4).describe("10.5%"),
                  z.literal(5).describe("21%"),
                  z.literal(6).describe("27%"),
                  z.literal(8).describe("5%"),
                  z.literal(9).describe("2.5%"),
                ])
                .describe("Alícuota IVA (lista cerrada AFIP)."),
              baseImp: z.number().nonnegative().finite().describe("Importe sobre el que se calcula el IVA."),
              importe: z.number().nonnegative().finite().describe("Importe del IVA (= baseImp × alícuota)."),
            }),
          )
          .optional()
          .describe("Filas de discriminación IVA. Requerido para Factura A/B con impIVA > 0; vacío para Factura C."),
        cbtesAsoc: z
          .array(
            z.object({
              tipo: z.number().int().positive().describe("Tipo del comprobante asociado (mismo enum que cbteTipo)."),
              ptoVta: z.number().int().positive().max(99999).describe("Punto de venta del comprobante asociado."),
              nro: z.number().int().positive().describe("Número del comprobante asociado."),
              cuit: z.string().optional(),
              fecha: z.string().optional(),
            }),
          )
          .optional()
          .describe("Comprobantes asociados (requerido para Notas de Crédito/Débito)."),
      }),
      execute: async (input) => {
        const w = requireWsfe();
        if ("_notConfigured" in w) return notConfiguredResult("emitir_factura");
        const ptoVta = input.ptoVta ?? dPv;
        if (!ptoVta) {
          return {
            available: false,
            error:
              "Falta ptoVta. Pasalo en el input o configura defaultPtoVta al crear las tools.",
            data: null,
          };
        }
        // Build input with conditional spread to satisfy exactOptionalPropertyTypes.
        const fullInput: SolicitarCaeInput = {
          ptoVta,
          cbteTipo: input.cbteTipo as CbteTipoCode,
          concepto: input.concepto as SolicitarCaeInput["concepto"],
          docTipo: input.docTipo as SolicitarCaeInput["docTipo"],
          docNro: input.docNro,
          cbteDesde: input.cbteDesde,
          cbteHasta: input.cbteDesde,
          cbteFch: input.cbteFch,
          impTotal: input.impTotal,
          impNeto: input.impNeto,
          impIVA: input.impIVA,
          ...(input.impTotConc !== undefined ? { impTotConc: input.impTotConc } : {}),
          ...(input.impOpEx !== undefined ? { impOpEx: input.impOpEx } : {}),
          ...(input.impTrib !== undefined ? { impTrib: input.impTrib } : {}),
          ...(input.fchServDesde !== undefined ? { fchServDesde: input.fchServDesde } : {}),
          ...(input.fchServHasta !== undefined ? { fchServHasta: input.fchServHasta } : {}),
          ...(input.fchVtoPago !== undefined ? { fchVtoPago: input.fchVtoPago } : {}),
          ...(input.monId !== undefined ? { monId: input.monId } : {}),
          ...(input.monCotiz !== undefined ? { monCotiz: input.monCotiz } : {}),
          ...(input.iva !== undefined
            ? {
                iva: input.iva.map((i) => ({
                  id: i.id as SolicitarCaeInput["iva"] extends (infer U)[] | undefined
                    ? U extends { id: infer V }
                      ? V
                      : never
                    : never,
                  baseImp: i.baseImp,
                  importe: i.importe,
                })),
              }
            : {}),
          ...(input.cbtesAsoc !== undefined
            ? {
                cbtesAsoc: input.cbtesAsoc.map((c) => ({
                  tipo: c.tipo as CbteTipoCode,
                  ptoVta: c.ptoVta,
                  nro: c.nro,
                  ...(c.cuit !== undefined ? { cuit: c.cuit } : {}),
                  ...(c.fecha !== undefined ? { fecha: c.fecha } : {}),
                })),
              }
            : {}),
        };
        const v = validateSolicitarCae(fullInput);
        if (!v.valid) {
          return {
            available: true,
            ok: false,
            error: `Validación local falló: ${v.errors.map((e) => `[${e.field}] ${e.message}`).join("; ")}`,
            errors: v.errors,
            data: null,
          };
        }
        const result = await w.solicitarCAE(fullInput);
        return {
          available: true,
          ok: result.resultado === "A",
          ...result,
          tipoComprobanteDescripcion: describeCbteTipo(result.cbteTipo),
        };
      },
    }),

    consultar_ultimo_comprobante: tool({
      description: desc("consultar_ultimo_comprobante"),
      inputSchema: z.object({
        ptoVta: z.number().int().positive().optional(),
        cbteTipo: z.number().int(),
      }),
      execute: async ({ ptoVta, cbteTipo }) => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("consultar_ultimo_comprobante");
        const pv = ptoVta ?? dPv;
        if (!pv) {
          return { available: false, error: "Falta ptoVta.", data: null };
        }
        const result = await w.consultarUltimoAutorizado(
          pv,
          cbteTipo as CbteTipoCode,
        );
        return {
          available: true,
          ...result,
          tipoComprobanteDescripcion: describeCbteTipo(result.cbteTipo),
          proximoNumero: result.cbteNro + 1,
        };
      },
    }),

    consultar_factura_emitida: tool({
      description: desc("consultar_factura_emitida"),
      inputSchema: z.object({
        ptoVta: z.number().int().positive().optional(),
        cbteTipo: z.number().int(),
        cbteNro: z.number().int().positive(),
      }),
      execute: async ({ ptoVta, cbteTipo, cbteNro }) => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("consultar_factura_emitida");
        const pv = ptoVta ?? dPv;
        if (!pv) {
          return { available: false, error: "Falta ptoVta.", data: null };
        }
        const result = await w.consultarComprobante(
          pv,
          cbteTipo as CbteTipoCode,
          cbteNro,
        );
        return {
          available: true,
          ...result,
          tipoComprobanteDescripcion: describeCbteTipo(result.cbteTipo),
        };
      },
    }),

    obtener_tipos_comprobante: tool({
      description: desc("obtener_tipos_comprobante"),
      inputSchema: z.object({}),
      execute: async () => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("obtener_tipos_comprobante");
        return { available: true, items: await w.getTiposCbte() };
      },
    }),

    obtener_tipos_documento: tool({
      description: desc("obtener_tipos_documento"),
      inputSchema: z.object({}),
      execute: async () => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("obtener_tipos_documento");
        return { available: true, items: await w.getTiposDoc() };
      },
    }),

    obtener_alicuotas_iva: tool({
      description: desc("obtener_alicuotas_iva"),
      inputSchema: z.object({}),
      execute: async () => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("obtener_alicuotas_iva");
        return { available: true, items: await w.getTiposIva() };
      },
    }),

    obtener_tipos_concepto: tool({
      description: desc("obtener_tipos_concepto"),
      inputSchema: z.object({}),
      execute: async () => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("obtener_tipos_concepto");
        return { available: true, items: await w.getTiposConcepto() };
      },
    }),

    obtener_tipos_moneda: tool({
      description: desc("obtener_tipos_moneda"),
      inputSchema: z.object({}),
      execute: async () => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("obtener_tipos_moneda");
        return { available: true, items: await w.getTiposMonedas() };
      },
    }),

    obtener_cotizacion: tool({
      description: desc("obtener_cotizacion"),
      inputSchema: z.object({
        monId: z.string().describe(
          'Código de moneda. Ej: "DOL" (USD), "060" (Euro), "012" (Real).',
        ),
      }),
      execute: async ({ monId }) => {
        const w = requireWsfe();
        if ("_notConfigured" in w) return notConfiguredResult("obtener_cotizacion");
        return { available: true, ...(await w.getCotizacion(monId)) };
      },
    }),

    health_check_afip: tool({
      description: desc("health_check_afip"),
      inputSchema: z.object({}),
      execute: async () => {
        const w = requireWsfe();
        if ("_notConfigured" in w)
          return notConfiguredResult("health_check_afip");
        const r = await w.dummy();
        return {
          available: true,
          ...r,
          ok: r.appServer === "OK" && r.dbServer === "OK" && r.authServer === "OK",
        };
      },
    }),
  } satisfies ToolSet;
}
