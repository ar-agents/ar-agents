import { tool, type ToolSet } from "ai";
import { z } from "zod";
import {
  type AfipPadronAdapter,
  UnconfiguredAfipPadronAdapter,
} from "./afip";
import { describePersonType, parseCuit } from "./cuit";
import {
  sanitizeAfipData,
  withRegistryProvenance,
} from "./sanitize";
import type { AfipPadronResult } from "./types";

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
  /**
   * Host authorization / throttling hook for `lookup_cuit_afip`. Called AFTER
   * the CUIT passes checksum validation but BEFORE the AFIP adapter is
   * queried. Return `false` (or `{ allowed: false, reason }`) to deny the
   * lookup — the tool then returns `{ available: false, error }` WITHOUT
   * hitting AFIP, so the description's "call validate_cuit first" guidance is
   * backed by real enforcement, not just an instruction the model may ignore.
   *
   * Use it to bind lookups to an authenticated caller, enforce a per-tenant
   * allowlist, or apply a rate limit (the registry exposes name, fiscal
   * condition, monotributo category, and address, so an unthrottled public
   * agent is a PII-scraping surface). Malformed CUITs are rejected before this
   * hook runs, so you never pay an AFIP request — or a hook call — for invalid
   * input.
   *
   * @example Rate-limit + allowlist
   * ```ts
   * identityTools({
   *   afip,
   *   authorizeLookup: async ({ normalizedCuit }) => {
   *     if (!(await rateLimiter.tryAcquire())) {
   *       return { allowed: false, reason: "Rate limit exceeded, try later." };
   *     }
   *     return allowedCuits.has(normalizedCuit);
   *   },
   * });
   * ```
   */
  authorizeLookup?: (
    ctx: IdentityLookupContext,
  ) => IdentityLookupDecision | Promise<IdentityLookupDecision>;
}

/** Context passed to {@link IdentityToolsOptions.authorizeLookup}. */
export interface IdentityLookupContext {
  /** The raw CUIT string the agent passed to the tool, before normalization. */
  cuit: string;
  /** The validated, normalized 11-digit CUIT that will be sent to AFIP. */
  normalizedCuit: string;
}

/**
 * Return value of {@link IdentityToolsOptions.authorizeLookup}. `true` allows
 * the lookup; `false` denies it with a generic message; an object lets you
 * supply a caller-facing `reason` (surfaced as the tool's `error`).
 */
export type IdentityLookupDecision =
  | boolean
  | { allowed: boolean; reason?: string };

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
        // Enforce the checksum in code, not just in the tool description.
        // A malformed/hostile CUIT never reaches the adapter (or AFIP).
        const parsed = parseCuit(cuit);
        if (!parsed.valid) {
          return withRegistryProvenance({
            cuit: parsed.normalized,
            available: false,
            error: `CUIT inválido — no se consultó AFIP. ${parsed.error ?? "Formato incorrecto."} Llamá a validate_cuit primero.`,
            data: null,
          } satisfies AfipPadronResult);
        }

        // Host-provided authorization / throttling gate (authz, rate limit,
        // allowlist). Fail closed: deny if it returns false / { allowed:false }.
        if (options.authorizeLookup) {
          const decision = await options.authorizeLookup({
            cuit,
            normalizedCuit: parsed.normalized,
          });
          const allowed =
            typeof decision === "boolean" ? decision : decision.allowed;
          if (!allowed) {
            const reason =
              typeof decision === "object" ? decision.reason : undefined;
            return withRegistryProvenance({
              cuit: parsed.normalized,
              available: false,
              error:
                reason ??
                "AFIP lookup denied by the application's authorizeLookup policy (host-side authorization or rate limit). This is not an AFIP error.",
              data: null,
            } satisfies AfipPadronResult);
          }
        }

        // Query with the validated/normalized CUIT, then sanitize the
        // taxpayer-controlled free-text and tag provenance so the result
        // re-enters the agent loop as untrusted data, not instructions.
        const result = await afip.lookup(parsed.normalized);
        return withRegistryProvenance({
          ...result,
          data: sanitizeAfipData(result.data),
        });
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
