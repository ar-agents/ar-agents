import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { parseCbu } from "./cbu";
import {
  type BcraDeudaAdapter,
  UnconfiguredBcraAdapter,
} from "./bcra";
import {
  type BcraVarsAdapter,
  BCRA_VARIABLE_IDS,
  UnconfiguredBcraVarsAdapter,
} from "./bcra-vars";
import { describeSituation } from "./types";
import { listBanks, listPsps, lookupBankByCode, lookupCvuByPrefix } from "./banks";

/**
 * Optional configuration for `bankingTools()`. All fields are optional;
 * when omitted, sensible defaults apply that keep the tools always callable
 * (algorithm tools always work; BCRA lookup returns a clear "not configured"
 * message via `UnconfiguredBcraAdapter`).
 */
export interface BankingToolsOptions {
  /**
   * BCRA Central de Deudores lookup backend. When omitted, a default adapter
   * is used that always returns `available: false` with setup instructions,
   * so the `lookup_credit_situation` tool stays safe to call without crashing.
   *
   * Pass `new BcraPublicApiAdapter()` for the production backend (no auth
   * required, hits BCRA's public REST endpoint).
   */
  bcra?: BcraDeudaAdapter;
  /**
   * BCRA Principales Variables backend (tipo de cambio, CER, UVA,
   * reservas, etc.). When omitted, returns "not configured" via
   * `UnconfiguredBcraVarsAdapter`. Pass `new BcraVarsPublicApiAdapter()`
   * to enable, no auth required.
   */
  bcraVars?: BcraVarsAdapter;
  /**
   * Override the agent-facing tool descriptions. Pass an object with keys
   * matching tool names; values replace the default description. Useful
   * when the agent's primary language isn't English/Spanish.
   */
  descriptions?: Partial<Record<BankingToolName, string>>;
}

export type BankingToolName =
  | "validate_cbu"
  | "lookup_bank_by_code"
  | "list_banks"
  | "list_psps"
  | "lookup_credit_situation"
  | "list_bcra_variables"
  | "get_bcra_variable"
  | "get_usd_oficial"
  | "get_uva"
  | "get_cer"
  | "get_reservas_bcra";

/**
 * Default tool descriptions. These are the strings agents read when picking
 * tools, so they're written for LLM consumption: explicit about WHEN to use
 * each tool, what each tool returns, side effects, and constraints.
 */
const DEFAULT_DESCRIPTIONS: Record<BankingToolName, string> = {
  validate_cbu:
    "Validate an Argentine CBU or CVU bank account number (validar CBU, validar CVU). CBU = Clave Bancaria Uniforme (traditional bank account), CVU = Clave Virtual Uniforme (fintech wallet account), checked via the BCRA dual mod-10 check-digit algorithm. PURE FUNCTION: no API call, no environment dependencies, sub-millisecond latency, free. Returns whether the input is mathematically valid PLUS the bank/PSP identification (e.g., '007 → Banco Galicia', '0000031 → Mercado Pago'), the branch code, and the account number. USE THIS WHEN: the user pastes a CBU/CVU and you need to detect typos, identify the issuing bank/wallet, or extract the account components before submitting a transfer or alias setup. Always call this BEFORE any transfer-related action, invalid CBUs cause hard failures downstream and chargebacks. Distinguishes CBU vs CVU automatically via the entity-code prefix.",

  lookup_bank_by_code:
    "Identify the Argentine bank or PSP behind an entity code (de qué banco es este CBU, código de entidad BCRA). PURE FUNCTION: in-memory lookup, free, sub-millisecond. Returns the entity's full legal name, short brand name, and kind (cbu = traditional bank, cvu = fintech). USE THIS WHEN: you have a bank code (e.g., from a CBU you've already parsed, from a user's input dropdown, from a transaction record) and need its human-readable name. For CVU prefixes (0000031 etc.), pass the 7-digit prefix; for traditional banks pass the 3-digit code. Returns null when the code isn't in the lookup table, the table is BCRA-published but updated periodically, so newer fintechs may be missing.",

  list_banks:
    "List Argentine banks (listar bancos argentinos) with their BCRA codes. USE THIS WHEN: you need to render a dropdown of banks for the user to pick from, or need to enumerate available entities for a workflow. Sorted by BCRA code. Returns array of `{ code, name, shortName, kind }`.",

  list_psps:
    "List Argentine fintech wallets / PSPs (listar billeteras virtuales, Mercado Pago, Ualá, Naranja X, Personal Pay, etc.) with their CVU prefixes. USE THIS WHEN: you need to render a dropdown of fintech wallets for the user to pick from, or need to enumerate PSPs for a workflow. Returns array of `{ code, name, shortName, kind }` where `code` is the 7-digit CVU prefix.",

  lookup_credit_situation:
    "Check a CUIT's credit standing in the BCRA Central de Deudores (consultar deudores BCRA, situación crediticia). Returns the worst situation code (1=normal, 2=low risk <90 days, 3=medium risk 90-180 days, 4=high risk 180-365 days, 5=irrecoverable, 6=irrecoverable by admin disposition), total outstanding debt across all entities, and per-entity breakdown. USE THIS WHEN: the user is assessing counterparty risk before extending credit, factoring invoices, or onboarding a B2B supplier. DO NOT USE for routine billing decisions, Mercado Pago handles credit risk on the SaaS's behalf for normal subscription flows. REQUIRES: a `BcraDeudaAdapter` configured at app boot. The default `BcraPublicApiAdapter` hits BCRA's public REST API (no auth required). When NOT configured, returns `{ available: false, error: <setup instructions> }` instead of crashing, surface the error verbatim. ALWAYS call `validate_cuit` (from @ar-agents/identity) first to confirm format before hitting BCRA.",

  list_bcra_variables:
    "List BCRA monetary indicators (principales variables del BCRA) with their current latest value and ID. Returns variables like Reservas Internacionales, Tipo de Cambio Minorista USD, Tipo de Cambio Mayorista USD, Tasa de Política Monetaria, BADLAR, CER día, UVA día, Inflación mensual / interanual. USE THIS WHEN: the user wants to discover what indicators are available, or asks 'qué variables publica el BCRA'. Returns array of `{ idVariable, descripcion, valor, fecha, cadencia }`.",

  get_bcra_variable:
    "Fetch the historical series of a BCRA indicator (serie histórica de una variable del BCRA) by id. USE THIS WHEN: the user wants historical values of a specific variable (cotización USD, CER, UVA, inflación). Optional `from`/`to` ISO dates filter the range. Returns `{ idVariable, datapoints: [{ fecha, valor }, ...] }`. PREFER the convenience tools (`get_usd_oficial`, `get_uva`, `get_cer`, `get_reservas_bcra`) when the user asks for one of those specifically, they pre-fill the id.",

  get_usd_oficial:
    "Get the official USD exchange rate (dólar oficial, a cuánto está el dólar, cotización USD; Tipo de Cambio Minorista, BCRA variable id 4). Returns the current value + date + the most recent N daily datapoints. USE THIS WHEN: the user asks 'a cuánto está el dólar oficial', 'cotización USD', 'tipo de cambio'. Pass `lookback_days` to control the time window (default 30).",

  get_uva:
    "Get the current UVA value (valor UVA hoy; Unidad de Valor Adquisitivo, BCRA variable id 31). UVA is the inflation-adjusted unit used for AR mortgages, fixed-term deposits, and rentals. USE THIS WHEN: the user asks about UVA value, mortgage adjustments, or inflation-linked instruments. Returns the latest value + date + recent datapoints.",

  get_cer:
    "Get the current CER coefficient (coeficiente CER hoy, ajuste por inflación; BCRA variable id 30). CER is the official inflation-tracking coefficient used to adjust regulated debt and contracts. USE THIS WHEN: the user asks about CER, contract adjustments, or 'ajuste por inflación'.",

  get_reservas_bcra:
    "Get BCRA international reserves (reservas del BCRA, Reservas Internacionales; variable id 1). USE THIS WHEN: the user asks about reservas, USD reserves, or BCRA balance sheet. Returns the latest value + date + recent datapoints. Reservas are reported in millions of USD.",
};

/**
 * Build the agent tool collection for `@ar-agents/banking`. Drop directly
 * into `Experimental_Agent`'s `tools` option, or merge with other tool sets
 * (e.g., from `@ar-agents/identity` and `@ar-agents/mercadopago`).
 *
 * @example Algorithm-only (default, BCRA lookup returns "not configured")
 * ```ts
 * import { Experimental_Agent as Agent, stepCountIs } from "ai";
 * import { bankingTools } from "@ar-agents/banking";
 *
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4-6",
 *   tools: bankingTools(),
 *   stopWhen: stepCountIs(6),
 * });
 * ```
 *
 * @example With a real BCRA adapter
 * ```ts
 * import { bankingTools, BcraPublicApiAdapter } from "@ar-agents/banking";
 *
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4-6",
 *   tools: bankingTools({ bcra: new BcraPublicApiAdapter() }),
 *   stopWhen: stepCountIs(6),
 * });
 * ```
 */
export function bankingTools(options: BankingToolsOptions = {}): ToolSet {
  const bcra = options.bcra ?? new UnconfiguredBcraAdapter();
  const bcraVars = options.bcraVars ?? new UnconfiguredBcraVarsAdapter();
  const desc = (name: BankingToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  async function fetchSeriesWithLookback(
    idVariable: number,
    lookbackDays: number,
  ): Promise<{
    idVariable: number;
    latest: { fecha: string; valor: number } | null;
    datapoints: Array<{ fecha: string; valor: number }>;
  }> {
    const to = new Date().toISOString().slice(0, 10);
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - lookbackDays);
    const from = fromDate.toISOString().slice(0, 10);
    const datapoints = await bcraVars.getVariable(idVariable, { from, to });
    const latest = datapoints.length > 0 ? datapoints[datapoints.length - 1]! : null;
    return { idVariable, latest, datapoints };
  }

  return {
    validate_cbu: tool({
      description: desc("validate_cbu"),
      inputSchema: z.object({
        cbu: z
          .string()
          .min(1)
          .describe(
            "The CBU/CVU to validate. Accepts any format with or without separators: 0070055530005571000018, 00700555-30005571000018, with spaces, etc. The function normalizes by stripping non-digit characters before validating.",
          ),
      }),
      execute: async ({ cbu }) => {
        return parseCbu(cbu);
      },
    }),

    lookup_bank_by_code: tool({
      description: desc("lookup_bank_by_code"),
      inputSchema: z.object({
        code: z
          .string()
          .min(3)
          .max(7)
          .describe(
            "The BCRA entity code. For traditional banks pass the 3-digit code (e.g., '007' for Galicia, '011' for Nación). For PSPs/fintechs pass the 7-digit prefix (e.g., '0000031' for Mercado Pago, '0000007' for Ualá).",
          ),
      }),
      execute: async ({ code }) => {
        const bank = code.length === 3 ? lookupBankByCode(code) : null;
        const psp = code.length === 7 ? lookupCvuByPrefix(code) : null;
        return {
          code,
          found: bank !== null || psp !== null,
          entity: bank ?? psp ?? null,
        };
      },
    }),

    list_banks: tool({
      description: desc("list_banks"),
      inputSchema: z.object({}),
      execute: async () => {
        return { banks: listBanks() };
      },
    }),

    list_psps: tool({
      description: desc("list_psps"),
      inputSchema: z.object({}),
      execute: async () => {
        return { psps: listPsps() };
      },
    }),

    lookup_credit_situation: tool({
      description: desc("lookup_credit_situation"),
      inputSchema: z.object({
        cuit: z
          .string()
          .describe(
            "The CUIT to look up against BCRA Central de Deudores. Pass the 11-digit normalized form (output of validate_cuit.normalized from @ar-agents/identity).",
          ),
      }),
      execute: async ({ cuit }) => {
        const result = await bcra.lookup(cuit);
        return {
          ...result,
          worstSituationDescription: result.data
            ? describeSituation(result.data.worstSituation)
            : null,
        };
      },
    }),

    list_bcra_variables: tool({
      description: desc("list_bcra_variables"),
      inputSchema: z.object({}),
      execute: async () => {
        const variables = await bcraVars.listVariables();
        return { variables };
      },
    }),

    get_bcra_variable: tool({
      description: desc("get_bcra_variable"),
      inputSchema: z.object({
        id_variable: z.number().int().min(1).describe("BCRA variable id (e.g., 4 for USD oficial)."),
        from: z.string().optional().describe("ISO date YYYY-MM-DD lower bound (inclusive)."),
        to: z.string().optional().describe("ISO date YYYY-MM-DD upper bound (inclusive)."),
      }),
      execute: async (input) => {
        const range: { from?: string; to?: string } = {};
        if (input.from !== undefined) range.from = input.from;
        if (input.to !== undefined) range.to = input.to;
        const datapoints = await bcraVars.getVariable(input.id_variable, range);
        return {
          idVariable: input.id_variable,
          datapoints,
          latest: datapoints.length > 0 ? datapoints[datapoints.length - 1] : null,
        };
      },
    }),

    get_usd_oficial: tool({
      description: desc("get_usd_oficial"),
      inputSchema: z.object({
        lookback_days: z
          .number()
          .int()
          .min(1)
          .max(365)
          .optional()
          .describe("How many days back to fetch. Default 30."),
      }),
      execute: async (input) =>
        fetchSeriesWithLookback(
          BCRA_VARIABLE_IDS.TIPO_CAMBIO_MINORISTA_USD,
          input.lookback_days ?? 30,
        ),
    }),

    get_uva: tool({
      description: desc("get_uva"),
      inputSchema: z.object({
        lookback_days: z.number().int().min(1).max(365).optional(),
      }),
      execute: async (input) =>
        fetchSeriesWithLookback(BCRA_VARIABLE_IDS.UVA_DIA, input.lookback_days ?? 30),
    }),

    get_cer: tool({
      description: desc("get_cer"),
      inputSchema: z.object({
        lookback_days: z.number().int().min(1).max(365).optional(),
      }),
      execute: async (input) =>
        fetchSeriesWithLookback(BCRA_VARIABLE_IDS.CER_DIA, input.lookback_days ?? 30),
    }),

    get_reservas_bcra: tool({
      description: desc("get_reservas_bcra"),
      inputSchema: z.object({
        lookback_days: z.number().int().min(1).max(365).optional(),
      }),
      execute: async (input) =>
        fetchSeriesWithLookback(
          BCRA_VARIABLE_IDS.RESERVAS_INTERNACIONALES,
          input.lookback_days ?? 30,
        ),
    }),
  } satisfies ToolSet;
}
