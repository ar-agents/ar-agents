import { z } from "zod";
import { tool, type ToolSet } from "ai";
import type { DnrpaAdapter } from "./adapter";
import { UnconfiguredDnrpaAdapter } from "./adapter";
import { DnrpaValidationError } from "./errors";
import { detectDominioFormat } from "./types";

export const ALL_TOOL_NAMES = ["dnrpa_lookup_dominio"] as const;
export type DnrpaToolName = (typeof ALL_TOOL_NAMES)[number];

export interface DnrpaToolsOptions {
  adapter?: DnrpaAdapter;
}

export function dnrpaTools(opts: DnrpaToolsOptions = {}): ToolSet {
  const adapter = opts.adapter ?? new UnconfiguredDnrpaAdapter();
  return {
    dnrpa_lookup_dominio: tool({
      description:
        "Look up an Argentine vehicle plate (dominio/patente) against DNRPA. Accepts both new Mercosur format (LL000LL like 'AB123CD') and the old Argentine format (LLL000 like 'FFF123'). Returns marca/modelo/año, mortgage (prenda) status, theft/restriction flags, and last title transfer date. `{found: false}` for unknown plates is not an error. NOTE: DNRPA does not expose a free REST API; this tool requires a BrowserDnrpaAdapter wired to a browse runtime that drives the public form.",
      inputSchema: z.object({
        dominio: z
          .string()
          .min(6)
          .max(8)
          .describe("Plate, with or without hyphens, e.g. 'AB123CD' or 'FFF-123'."),
      }),
      execute: async (input) => {
        const fmt = detectDominioFormat(input.dominio);
        if (fmt === "unknown") {
          throw new DnrpaValidationError(
            "dominio",
            "format not recognized (expected LL000LL or LLL000)",
          );
        }
        return adapter.lookupDominio({ dominio: input.dominio });
      },
    }),
  } as const;
}
