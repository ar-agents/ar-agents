/**
 * Drop-in tool collection for Vercel AI SDK 6+.
 *
 * Two tools — that's the whole WSCDC surface:
 *   - `wscdc_validate_comprobante`  — the real one
 *   - `wscdc_health`                — Dummy() probe for status checks
 *
 * The adapter is required for both (there's nothing to validate
 * locally). Default `UnconfiguredWscdcAdapter` throws, so an agent
 * configured without a real adapter never silently lies.
 */
import { tool } from "ai";
import { z } from "zod";
import type { WscdcAdapter } from "./adapter";
import { UnconfiguredWscdcAdapter } from "./adapter";
import type { ConstatarRequest } from "./types";

const cuitSchema = z
  .string()
  .regex(/^\d{2}-?\d{8}-?\d{1}$|^\d{11}$/)
  .describe("CUIT with or without hyphens (11 digits).");

const cbteModoEnum = z.enum(["CAE", "CAEA"]);

const dateSchema = z
  .string()
  .regex(/^\d{8}$/)
  .describe("Comprobante date as YYYYMMDD (AFIP wire format).");

const caeSchema = z
  .string()
  .regex(/^\d{14}$/)
  .describe("14-digit CAE or CAEA.");

export interface WscdcToolsOptions {
  /** Real adapter. Default: UnconfiguredWscdcAdapter (throws). */
  adapter?: WscdcAdapter;
  /** Optional subset of tools to expose. */
  include?: ReadonlyArray<WscdcToolName>;
}

export const ALL_TOOL_NAMES = [
  "wscdc_validate_comprobante",
  "wscdc_health",
] as const;

export type WscdcToolName = (typeof ALL_TOOL_NAMES)[number];

export function wscdcTools(opts: WscdcToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredWscdcAdapter();
  const wanted = new Set<WscdcToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    wscdc_validate_comprobante: tool({
      description:
        "Validate that a factura received from a supplier was actually issued by AFIP with a real CAE. Use this BEFORE ingesting any received factura into accounts payable. Returns resultado='A' (approved), 'N' (not approved — likely forged or wrong data), or 'O' (observed — exists in AFIP but a non-key field differs). Requires a WSAA-authenticated WSCDC adapter; throws WscdcUnconfiguredError otherwise.",
      inputSchema: z.object({
        cbteModo: cbteModoEnum,
        cuitEmisor: cuitSchema,
        ptoVta: z.number().int().min(1).max(99_999),
        cbteTipo: z
          .number()
          .int()
          .positive()
          .describe(
            "Comprobante type code per WSFE (1=Factura A, 6=Factura B, 11=Factura C, etc.).",
          ),
        cbteNro: z.number().int().positive(),
        cbteFch: dateSchema,
        impTotal: z
          .number()
          .nonnegative()
          .describe("Total comprobante amount (e.g. 12100.0)."),
        codAutorizacion: caeSchema,
        docTipoReceptor: z
          .number()
          .int()
          .nonnegative()
          .describe(
            "Document type code of the receptor (80=CUIT, 96=DNI, 99=Consumidor Final).",
          ),
        docNroReceptor: z
          .string()
          .describe(
            "Document number of the receptor (use '0' for Consumidor Final).",
          ),
      }),
      execute: async (input) =>
        adapter.validateComprobante(input as ConstatarRequest),
    }),

    wscdc_health: tool({
      description:
        "Ping the AFIP WSCDC service (Dummy operation). Returns AppServer/DbServer/AuthServer statuses. Use to confirm WSCDC is reachable + your WSAA token still works before a batch validation flow.",
      inputSchema: z.object({}).strict(),
      execute: async () => adapter.health(),
    }),
  } as const;

  const out: Record<string, (typeof allTools)[WscdcToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, WscdcToolName>;
}
