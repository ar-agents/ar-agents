import { z } from "zod";
import { tool } from "ai";
import type { InpiAdapter } from "./adapter";
import { UnconfiguredInpiAdapter } from "./adapter";
import { InpiValidationError } from "./errors";

export const ALL_TOOL_NAMES = [
  "inpi_search_trademark",
  "inpi_get_trademark",
] as const;
export type InpiToolName = (typeof ALL_TOOL_NAMES)[number];

export interface InpiToolsOptions {
  adapter?: InpiAdapter;
}

export function inpiTools(opts: InpiToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredInpiAdapter();
  return {
    inpi_search_trademark: tool({
      description:
        "Search INPI trademarks by name (buscar marcas registradas en INPI), case-insensitive substring. Returns the matching registrations with their Nice class, status (presentada/publicada/oposicion/concedida/rechazada/abandonada/extinguida/en_renovacion), holder, and key dates. Optional filters by Nice class (1-45) and status. Use this BEFORE filing a new mark to spot conflicts.",
      inputSchema: z.object({
        q: z
          .string()
          .min(2)
          .describe("Denomination substring. Minimum 2 chars."),
        niceClass: z
          .number()
          .int()
          .min(1)
          .max(45)
          .optional()
          .describe("Filter to one Nice class (1-45)."),
        status: z
          .enum([
            "presentada",
            "publicada",
            "oposicion",
            "concedida",
            "rechazada",
            "abandonada",
            "extinguida",
            "en_renovacion",
          ])
          .optional(),
        limit: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        if (input.q.trim().length < 2) {
          throw new InpiValidationError("q", "must be at least 2 chars");
        }
        return adapter.search(input);
      },
    }),

    inpi_get_trademark: tool({
      description:
        "Look up an INPI trademark by registration number (consultar una marca por acta) (registration number, e.g. '3792456'). Returns the full record or null if not found.",
      inputSchema: z.object({
        acta: z.string().min(1).describe("INPI registration number / acta."),
      }),
      execute: async (input) => adapter.getByActa(input.acta),
    }),
  } as const;
}
