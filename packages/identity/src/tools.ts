import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  type AfipPadronAdapter,
  UnconfiguredAfipPadronAdapter,
} from "./afip";
import { describePersonType, parseCuit } from "./cuit";

/**
 * Optional configuration for `identityTools()`. All fields are optional;
 * when omitted, sensible defaults apply that keep the tools always callable
 * (algorithm always works; AFIP lookup returns a clear "not configured"
 * message via `UnconfiguredAfipPadronAdapter`).
 */
export interface IdentityToolsOptions {
  /**
   * AFIP padron lookup backend. When omitted, a default adapter is used
   * that always returns `available: false` with setup instructions, so the
   * `lookup_cuit_afip` tool stays safe to call without crashing.
   */
  afip?: AfipPadronAdapter;
  /**
   * Override the agent-facing tool descriptions. Pass an object with keys
   * matching tool names; values replace the default description. Useful
   * when the agent's primary language isn't English/Spanish and you want
   * descriptions in another language for better tool-selection scoring.
   */
  descriptions?: Partial<Record<IdentityToolName, string>>;
}

export type IdentityToolName = "validate_cuit" | "lookup_cuit_afip";

/**
 * Default tool descriptions. These are the strings agents read when picking
 * tools, so they're written for LLM consumption: explicit about WHEN to use
 * each tool, what each tool returns, side effects, and constraints.
 *
 * Override per-deployment via `IdentityToolsOptions.descriptions`.
 */
const DEFAULT_DESCRIPTIONS: Record<IdentityToolName, string> = {
  validate_cuit:
    "Validate a CUIT/CUIL Argentine tax ID (validar CUIT, verificar CUIT/CUIL) via the AFIP modulo-11 check digit algorithm. PURE FUNCTION: no API call, no environment dependencies, sub-millisecond latency, free. Returns whether the input is mathematically valid plus the inferred person type (persona física vs jurídica). USE THIS WHEN: the user pastes a CUIT/CUIL and you need to detect typos, infer person type from the prefix, or normalize formatting before downstream operations. DO NOT USE WHEN: the user wants the taxpayer's name, tax condition, or monotributo category, call `lookup_cuit_afip` for that. Always call `validate_cuit` first; if it returns invalid, do NOT call `lookup_cuit_afip` (you already know the answer is no, and you'd waste an AFIP request).",

  lookup_cuit_afip:
    "Look up a CUIT/CUIL in the AFIP/ARCA taxpayer registry (consultar CUIT en AFIP, datos del contribuyente, padrón). Returns taxpayer name, tax condition (Monotributo / Responsable Inscripto / etc.), monotributo category if applicable, and registered address. REQUIRES an `AfipPadronAdapter` configured at app boot, typically wired to AFIP's WSAA + WSCDC SOAP integration which itself requires an X.509 cert registered with AFIP. WHEN NOT CONFIGURED: this tool returns `{ available: false, error: <setup instructions> }` instead of crashing. SURFACE the error message verbatim to the user, it contains the actionable steps to enable the lookup. DO NOT make up taxpayer info if available is false. USE THIS WHEN: the user asks for the taxpayer's name, tax condition, monotributo category, registered address, or activities. ALWAYS call `validate_cuit` first to confirm the format is sound, there's no point hitting AFIP for a malformed CUIT.",
};

/**
 * Build the agent tool collection for `@ar-agents/identity`. Drop directly
 * into `Experimental_Agent`'s `tools` option, or merge with other tool sets.
 *
 * @example Algorithm-only (default, AFIP lookup returns "not configured")
 * ```ts
 * import { Experimental_Agent as Agent, stepCountIs } from "ai";
 * import { identityTools } from "@ar-agents/identity";
 *
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4-6",
 *   tools: identityTools(),
 *   stopWhen: stepCountIs(6),
 * });
 * ```
 *
 * @example With a real AFIP adapter
 * ```ts
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4-6",
 *   tools: identityTools({ afip: new MyWsaaAfipAdapter() }),
 *   stopWhen: stepCountIs(6),
 * });
 * ```
 */
export function identityTools(options: IdentityToolsOptions = {}): ToolSet {
  const afip = options.afip ?? new UnconfiguredAfipPadronAdapter();
  const desc = (name: IdentityToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    validate_cuit: tool({
      description: desc("validate_cuit"),
      inputSchema: z.object({
        cuit: z
          .string()
          .min(1)
          .describe(
            "The CUIT/CUIL to validate. Accepts any format with or without separators: 20-12345678-6, 20.12345678.6, 20 12345678 6, 20123456786. The function normalizes by stripping non-digit characters before validating.",
          ),
      }),
      execute: async ({ cuit }) => {
        const result = parseCuit(cuit);
        return {
          ...result,
          personTypeDescription: describePersonType(result.personType),
        };
      },
    }),

    lookup_cuit_afip: tool({
      description: desc("lookup_cuit_afip"),
      inputSchema: z.object({
        cuit: z
          .string()
          .describe(
            "The CUIT/CUIL to look up. Pass the validated/normalized form (output of `validate_cuit.normalized`).",
          ),
      }),
      execute: async ({ cuit }) => {
        const result = await afip.lookup(cuit);
        return result;
      },
    }),
  } satisfies ToolSet;
}

/**
 * Standalone `validate_cuit` tool, for callers who only want the algorithm
 * tool without the AFIP one. Equivalent to `identityTools().validate_cuit`,
 * but cleaner when composing tool sets manually.
 */
export const validateCuitTool = identityTools().validate_cuit;
