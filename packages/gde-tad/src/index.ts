/**
 * `@ar-agents/gde-tad` — TAD (Trámites a Distancia) + GDE (Gestión
 * Documental Electrónica) primitives for the Vercel AI SDK.
 *
 * The 4th pieza for sociedades-IA. Read-only today (Domicilio Electrónico
 * inbox, Mis Trámites, IGJ pre-flight validation); write-side comes
 * after RFC-001 § 3.4 lands.
 *
 * # Setup (read-only path)
 *
 * No cert needed for the algorithm-only `validate_igj_inscription` tool.
 * For DEC inbox / Mis Trámites, wire a `DomicilioAdapter` + `TramitesAdapter`
 * (per-organism integration; rolling out 2026-2027).
 *
 * ```ts
 * import { gdeTadTools } from "@ar-agents/gde-tad";
 * import { Experimental_Agent as Agent } from "ai";
 *
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4.5",
 *   tools: { ...gdeTadTools() },
 * });
 * ```
 *
 * See README.md for the full setup guide and AGENTS.md for tool selection
 * heuristics.
 */

export { gdeTadTools, type GdeTadToolsOptions, type GdeTadToolName } from "./tools";

export {
  validateIgjInscription,
  type IgjInscriptionInput,
} from "./igj-preflight";

export { computeSeverity } from "./severity";

export {
  UnconfiguredDomicilioAdapter,
  UnconfiguredTramitesAdapter,
} from "./adapters";

export {
  GdeTadError,
  GdeTadNotConfiguredError,
  GdeTadAuthError,
  GdeTadValidationError,
} from "./errors";

export type {
  TadEnv,
  TramiteStatus,
  Tramite,
  DomicilioNotification,
  DomicilioInboxResult,
  MisTramitesResult,
  IgjInscriptionPreflight,
  DomicilioAdapter,
  TramitesAdapter,
} from "./types";

export { normalizeCuit } from "./cuit";
