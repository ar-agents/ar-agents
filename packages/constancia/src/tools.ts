/**
 * Vercel AI SDK tool collection for `@ar-agents/constancia`.
 *
 *   - constancia_inscripcion, CUIT → official ARCA Constancia de
 *     Inscripción: parsed fields + the PDF artifact.
 *
 * Browser-backed: the default fetcher is `UnconfiguredConstanciaFetcher`
 * so the tool is always safe to call. Pass a `BrowseSkillConstanciaFetcher`
 * (wired to a `browse` runtime) for real lookups, or any custom
 * `ConstanciaFetcher`.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  type ConstanciaFetcher,
  UnconfiguredConstanciaFetcher,
} from "./fetcher";

export type ConstanciaToolName = "constancia_inscripcion";

export interface ConstanciaToolsOptions {
  /** Defaults to `UnconfiguredConstanciaFetcher` (safe, no browser). */
  fetcher?: ConstanciaFetcher;
  /** Override agent-facing tool descriptions. */
  descriptions?: Partial<Record<ConstanciaToolName, string>>;
}

const DEFAULT_DESCRIPTIONS: Record<ConstanciaToolName, string> = {
  constancia_inscripcion:
    "Get the official AFIP/ARCA registration certificate for a CUIT (constancia de inscripción, obtené la Constancia de Inscripción de ARCA, ex-AFIP): el régimen (monotributo + categoría / responsable inscripto / exento), domicilio fiscal, actividades CLAE, impuestos, fecha de inscripción Y el documento PDF oficial con su código verificador. USE THIS WHEN: the user needs the official PDF document (alta de proveedor, KYC, expediente, licitación) or needs the tax data WITHOUT an AFIP X.509 cert (this drives the PUBLIC web form, no Clave Fiscal). DO NOT USE WHEN: you only need the tax data AND `@ar-agents/identity` is configured with a cert, `lookup_cuit_afip` is faster and needs no browser. BROWSER-BACKED: each call drives a real browser via the `afip-constancia` runtime; expect seconds, not milliseconds, and transient failures. Returns `available:false` with an actionable `error` when not configured, the CUIT is not registered, or the lookup is blocked, never throws. Validate the CUIT with `@ar-agents/identity` `validate_cuit` first.",
};

export function constanciaTools(
  options: ConstanciaToolsOptions = {},
): ToolSet {
  const fetcher = options.fetcher ?? new UnconfiguredConstanciaFetcher();
  const desc = (name: ConstanciaToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    constancia_inscripcion: tool({
      description: desc("constancia_inscripcion"),
      inputSchema: z.object({
        cuit: z
          .string()
          .min(1)
          .describe(
            "CUIT/CUIL to look up. Accepts dashed (20-12345678-6) or bare (20123456786), normalized to 11 digits. Shape-checked only; verify the check digit with @ar-agents/identity validate_cuit first.",
          ),
      }),
      execute: async ({ cuit }) => {
        return await fetcher.getConstancia(cuit);
      },
    }),
  } satisfies ToolSet;
}
