/**
 * Drop-in tool collection for Vercel AI SDK 6+.
 *
 * Five tools:
 *   - `fecred_check_obligation`  pure read
 *   - `fecred_list_received`     pure read
 *   - `fecred_accept_invoice`    IRREVERSIBLE, HITL-gated via description
 *   - `fecred_reject_invoice`    IRREVERSIBLE, HITL-gated via description
 *   - `fecred_health`            dummy probe
 *
 * The adapter is required for everything. Default
 * `UnconfiguredFecredAdapter` throws, so an agent configured without a
 * real adapter never silently lies.
 */
import { tool } from "ai";
import { z } from "zod";
import type { FecredAdapter } from "./adapter";
import { UnconfiguredFecredAdapter } from "./adapter";
import {
  acceptInvoiceInputSchema,
  checkObligationInputSchema,
  estadoCmpEnum,
  cuitSchema,
  isoDateSchema,
  rejectInvoiceInputSchema,
  rolEnum,
  tipoFechaEnum,
} from "./types";
import type { ListComprobantesInput } from "./types";

export interface FecredToolsOptions {
  /** Real adapter. Default: UnconfiguredFecredAdapter (throws). */
  adapter?: FecredAdapter;
  /** Optional subset of tools to expose. */
  include?: ReadonlyArray<FecredToolName>;
}

export const ALL_TOOL_NAMES = [
  "fecred_check_obligation",
  "fecred_list_received",
  "fecred_accept_invoice",
  "fecred_reject_invoice",
  "fecred_health",
] as const;

export type FecredToolName = (typeof ALL_TOOL_NAMES)[number];

export function fecredTools(opts: FecredToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredFecredAdapter();
  const wanted = new Set<FecredToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    fecred_check_obligation: tool({
      description:
        "Check if an invoice to a given CUIT must be a Factura de Credito Electronica MiPyME (FCE). Use BEFORE issuing a factura to a large buyer: if obligado=true and the invoice total is at or above montoDesde (the regime threshold, returned live by AFIP; updated periodically, around ARS 5.5M since Apr 2026), you must issue an FCE type (201/206/211) instead of a regular factura via @ar-agents/facturacion. PURE READ, no side effects.",
      inputSchema: checkObligationInputSchema,
      execute: async (input) => adapter.checkObligation(input),
    }),

    fecred_list_received: tool({
      description:
        "List Facturas de Credito Electronica (FCE) received or emitted by the represented CUIT. Default rol='Receptor' + estadoCmp='Recepcionado' lists FCEs awaiting your acceptance or rejection. IMPORTANT: a received FCE not rejected within the legal window (15 corridos days from puesta a disposicion) is TACITLY ACCEPTED, so run this regularly. PURE READ, no side effects. Server paginates: when hayMas=true, call again with nroPagina+1.",
      inputSchema: z.object({
        rol: rolEnum.optional().describe("Default 'Receptor' (FCEs you received)."),
        cuitContraparte: cuitSchema.optional(),
        estadoCmp: estadoCmpEnum
          .optional()
          .describe("'Recepcionado' = awaiting accept/reject. Omit for all states."),
        codTipoCmp: z.number().int().positive().optional(),
        fechaDesde: isoDateSchema.optional(),
        fechaHasta: isoDateSchema.optional(),
        fechaTipo: tipoFechaEnum.optional(),
        nroPagina: z.number().int().min(1).optional(),
      }),
      execute: async (input) =>
        adapter.listComprobantes({
          rol: input.rol ?? "Receptor",
          fechaTipo: input.fechaTipo ?? "Emision",
          ...(input.cuitContraparte !== undefined
            ? { cuitContraparte: input.cuitContraparte }
            : {}),
          ...(input.estadoCmp !== undefined ? { estadoCmp: input.estadoCmp } : {}),
          ...(input.codTipoCmp !== undefined ? { codTipoCmp: input.codTipoCmp } : {}),
          ...(input.fechaDesde !== undefined ? { fechaDesde: input.fechaDesde } : {}),
          ...(input.fechaHasta !== undefined ? { fechaHasta: input.fechaHasta } : {}),
          ...(input.nroPagina !== undefined ? { nroPagina: input.nroPagina } : {}),
        } as ListComprobantesInput),
    }),

    fecred_accept_invoice: tool({
      description:
        "Accept a received electronic credit invoice (Factura de Credito Electronica MiPyME) and its cuenta corriente balance. **IRREVERSIBLE LEGAL ACT: confirm with the user before calling. Restate the emisor CUIT, comprobante (tipo/ptoVta/nro), and saldoAceptado, then ask explicit confirmation ('si, acepta' or equivalent). Once accepted, the FCE becomes a negotiable credit title the supplier can transfer or discount; there is no undo via this web service.** Use fecred_list_received first to see what is pending.",
      inputSchema: acceptInvoiceInputSchema,
      execute: async (input) => adapter.acceptInvoice(input),
    }),

    fecred_reject_invoice: tool({
      description:
        "Reject a received electronic credit invoice (Factura de Credito Electronica MiPyME), with at least one motivo de rechazo plus justification. **IRREVERSIBLE LEGAL ACT: confirm with the user before calling. Restate the emisor CUIT, comprobante (tipo/ptoVta/nro), and the rejection reasons, then ask explicit confirmation ('si, rechaza' or equivalent). Rejection must happen within the legal window (15 corridos days from puesta a disposicion); after that the FCE is tacitly accepted.**",
      inputSchema: rejectInvoiceInputSchema,
      execute: async (input) => adapter.rejectInvoice(input),
    }),

    fecred_health: tool({
      description:
        "Ping the AFIP WSFECred service (dummy operation). Returns appServer/dbServer/authServer statuses. Use to confirm WSFECred is reachable + your WSAA token still works before a batch flow.",
      inputSchema: z.object({}).strict(),
      execute: async () => adapter.health(),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[FecredToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, FecredToolName>;
}
