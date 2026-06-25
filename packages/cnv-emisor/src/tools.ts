import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { CnvAdapter } from "./adapter";
import { UnconfiguredCnvAdapter } from "./adapter";

export const ALL_TOOL_NAMES = [
  "cnv_get_issuer",
  "cnv_list_hechos_relevantes",
  "cnv_list_financial_statements",
] as const;
export type CnvToolName = (typeof ALL_TOOL_NAMES)[number];

export interface CnvToolsOptions {
  adapter?: CnvAdapter;
}

export function cnvTools(opts: CnvToolsOptions = {}): ToolSet {
  const adapter = opts.adapter ?? new UnconfiguredCnvAdapter();
  return {
    cnv_get_issuer: tool({
      description:
        "Look up a CNV-registered securities issuer (consultar emisora CNV) by their stable code (e.g. 'YPF', 'GGAL', 'TXAR'). Returns denominación, CUIT, categoría, sector classification, and active status. Returns null if no issuer exists with that code.",
      inputSchema: z.object({
        code: z.string().min(1).describe("CNV issuer code, e.g. 'YPF'."),
      }),
      execute: async (input) => adapter.getIssuer(input.code),
    }),

    cnv_list_hechos_relevantes: tool({
      description:
        "List 'hechos relevantes' (material facts) filed by an issuer in the CNV AIF. Filter by category (asamblea / dividendo / estado_financiero / oferta_publica / cambio_control / garantia / otro) and/or since-date (ISO timestamp). Each entry carries the publication timestamp, title, and a URL to the underlying document.",
      inputSchema: z.object({
        issuerCode: z.string().min(1).describe("CNV issuer code."),
        sinceIso: z.string().datetime().optional().describe("ISO 8601 timestamp; only return hechos published on or after."),
        category: z
          .enum([
            "asamblea",
            "dividendo",
            "estado_financiero",
            "oferta_publica",
            "cambio_control",
            "garantia",
            "otro",
          ])
          .optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => adapter.listHechosRelevantes(input),
    }),

    cnv_list_financial_statements: tool({
      description:
        "List financial statements filed with CNV (estados financieros presentados en CNV): annual / quarterly / intermediate, in the AIF. Each entry carries the period end, submitted timestamp, kind, and AIF folder URL.",
      inputSchema: z.object({
        issuerCode: z.string().min(1).describe("CNV issuer code."),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => adapter.listFinancialStatements(input),
    }),
  } as const;
}
