import { z } from "zod";
import { tool } from "ai";
import type { AduanaAdapter } from "./adapter";
import { UnconfiguredAduanaAdapter } from "./adapter";
import { AduanaValidationError } from "./errors";
import type { AduanaIdKind } from "./types";

export const ALL_TOOL_NAMES = [
  "aduana_lookup_despacho",
  "aduana_lookup_ncm",
] as const;

export type AduanaToolName = (typeof ALL_TOOL_NAMES)[number];

export interface AduanaToolsOptions {
  adapter?: AduanaAdapter;
}

/**
 * Vercel AI SDK tool collection for ARCA Aduana.
 *
 *   import { aduanaTools } from "@ar-agents/aduana";
 *   import { HttpAduanaAdapter } from "@ar-agents/aduana";
 *
 *   const tools = aduanaTools({ adapter: new HttpAduanaAdapter() });
 */
export function aduanaTools(opts: AduanaToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredAduanaAdapter();

  return {
    aduana_lookup_despacho: tool({
      description:
        "Look up an Argentine customs declaration (consultar despacho aduanero) by its SUSI, KIM, or OM number. Returns current status (registrado / canalizado_verde / naranja / rojo / libre_disponibilidad / anulado), operation kind, NCM, registration date, and Aduana office. Returns `{found: false}` for unknown numbers, that is not an error, just no record.",
      inputSchema: z.object({
        kind: z.enum(["SUSI", "KIM", "OM"]).describe(
          "Identifier type. SUSI is the most common modern format; KIM/OM appear on older declarations.",
        ),
        value: z
          .string()
          .min(1)
          .describe("Number value as printed on the despacho."),
      }),
      execute: async (input) => {
        const kind = input.kind as AduanaIdKind;
        if (!input.value.trim()) {
          throw new AduanaValidationError("value", "must not be empty");
        }
        return adapter.lookupDespacho({ kind, value: input.value.trim() });
      },
    }),

    aduana_lookup_ncm: tool({
      description:
        "Look up an Argentine NCM tariff code (consultar posición arancelaria NCM). Returns the official description, whether it is currently in force, and its AEC (Mercosur common external tariff) + DIE (imports tax) percentages when published. Pass the full 8-digit code; partial matches are not yet supported in v0.1.",
      inputSchema: z.object({
        code: z
          .string()
          .regex(/^\d{8}$/)
          .describe("NCM code, exactly 8 digits, e.g. '84713010' for laptops."),
      }),
      execute: async (input) => {
        const result = await adapter.lookupNcm(input.code);
        return result ?? { code: input.code, found: false };
      },
    }),
  } as const;
}
