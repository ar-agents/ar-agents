/**
 * Domain types + zod schemas shared by the BIND adapter contract and the
 * tool layer.
 *
 * Provenance of field names (HONESTY CONTRACT, see README + AGENTS.md):
 *
 *   VERIFIED against the public apidoc (sandbox.bind.com.ar/apidoc,
 *   APIBank SandBox v1.7.15, fetched 2026-06-12):
 *     login (POST /login/jwt: username/password -> token + expires_in),
 *     accounts list, account movements (transactions), CBU/CVU/alias
 *     ownership lookup, TRANSFER transaction-requests, DEBIN
 *     transaction-requests, CHECK (echeq) listing.
 *
 *   Schemas are written `.loose()`-by-hand: every object keeps only the
 *   fields named in the public docs as typed members; unknown upstream
 *   fields survive in `extras` so a consumer pinned to v0.1 cannot break
 *   when BIND adds optional fields.
 *
 * Amounts: BIND uses DECIMAL PESOS (e.g. `"amount": 10.0` = ARS 10),
 * NOT centavos. This differs from @ar-agents/uala and @ar-agents/mercadopago.
 */

import { z } from "zod";

/** Result envelope every adapter method resolves to. The unconfigured
 * adapter resolves `{ ok: false, code: "unconfigured" }` instead of
 * throwing, so tool output stays structured for the LLM. */
export type BindResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string; status?: number };

export function bindOk<T>(data: T): BindResult<T> {
  return { ok: true, data };
}

export function bindErr<T = never>(
  code: string,
  message: string,
  status?: number,
): BindResult<T> {
  return { ok: false, code, message, ...(status !== undefined ? { status } : {}) };
}

// ── Routing primitives (verified shapes) ────────────────────────

export const accountRoutingSchema = z.object({
  scheme: z.string().describe("Routing scheme, e.g. CBU or CVU."),
  address: z.string().describe("The CBU/CVU number itself."),
});

export const accountOwnerSchema = z.object({
  id: z.string().describe("Owner tax id (CUIT/CUIL)."),
  display_name: z.string().describe("Owner display name."),
  id_type: z.string().optional().describe("Id type, e.g. CUIT."),
  is_physical_person: z.boolean().optional(),
});

// ── Accounts (verified: GET /banks/:bank_id/accounts/:view_id) ──

export const bindAccountSchema = z.object({
  id: z
    .string()
    .describe("BIND account code, format XX-X-XXXX-X-X. Used as account_id in every other call."),
  label: z.string().optional(),
  number: z.string().optional(),
  type: z.string().optional().describe("e.g. Caja de Ahorro, Cuenta Corriente."),
  status: z.string().optional().describe("e.g. NORMAL."),
  owners: z.array(accountOwnerSchema).optional(),
  balance: z
    .object({
      currency: z.string(),
      amount: z.number().describe("Balance in decimal pesos."),
    })
    .optional(),
  bank_id: z.string().optional(),
  account_routing: accountRoutingSchema.optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type BindAccount = z.infer<typeof bindAccountSchema>;

// ── Movements (verified: GET .../transactions) ──────────────────

export const bindMovementSchema = z.object({
  id: z.string(),
  counterparty: z
    .object({
      id: z.string().optional(),
      name: z.string().optional(),
      id_type: z.string().optional(),
      bank_routing: z.object({ scheme: z.string(), address: z.string().nullable() }).optional(),
      account_routing: z.object({ scheme: z.string(), address: z.string().nullable() }).optional(),
    })
    .optional(),
  details: z
    .object({
      type: z.string().optional().describe("Movement category, e.g. OTROS_CREDITOS."),
      description: z.string().optional(),
      posted: z.string().optional().describe("ISO 8601."),
      completed: z.string().optional().describe("ISO 8601."),
      value: z.object({ currency: z.string(), amount: z.number() }).optional(),
      motive: z.string().optional(),
      reference_number: z.string().optional(),
      new_balance: z.object({ currency: z.string(), amount: z.number() }).optional(),
    })
    .optional(),
  metadata: z.object({ tags: z.array(z.string()).optional() }).optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type BindMovement = z.infer<typeof bindMovementSchema>;

export interface GetMovementsArgs {
  accountId: string;
  fromDate?: string | undefined; // ISO date, e.g. 2026-01-01
  toDate?: string | undefined;
  limit?: number | undefined; // page size
  offset?: number | undefined; // page number, 1-based
}

// ── CBU/CVU/alias ownership (verified: GET /accounts/cbu/:cbu_cvu
//    and GET /accounts/alias/:alias) ──────────────────────────────

export const cbuOwnershipSchema = z.object({
  owners: z.array(accountOwnerSchema),
  type: z.string().optional().describe("Account type, e.g. CC / CA."),
  is_active: z.boolean().optional(),
  currency: z.string().optional(),
  label: z.string().optional(),
  account_routing: accountRoutingSchema.optional(),
  bank_routing: z
    .object({
      scheme: z.string().optional(),
      address: z.string().optional().describe("Bank name."),
      code: z.string().optional().describe("BCRA bank code, e.g. 322."),
    })
    .optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type CbuOwnership = z.infer<typeof cbuOwnershipSchema>;

export interface GetCbuOwnerArgs {
  /** 22-digit CBU or CVU. Mutually exclusive with `alias`. */
  cbuCvu?: string | undefined;
  /** Alias CBU. Mutually exclusive with `cbuCvu`. */
  alias?: string | undefined;
}

// ── Transfers (verified: POST .../TRANSFER/transaction-requests) ─

export const bindTransferRequestSchema = z.object({
  origin_id: z
    .string()
    .max(15)
    .describe(
      "Caller-defined unique transaction id, max 15 chars. Re-sending an existing origin_id returns the original transfer (natural idempotency key).",
    ),
  to: z
    .object({
      cbu: z.string().optional().describe("Destination CBU or CVU."),
      label: z.string().optional().describe("Destination alias CBU."),
      cuit: z
        .string()
        .optional()
        .describe("Destination CUIT. Optional but recommended by BIND."),
    })
    .describe("Destination: exactly one of cbu or label is required."),
  value: z.object({
    currency: z.string().describe("e.g. ARS."),
    amount: z.number().positive().describe("Amount in decimal pesos, NOT centavos."),
  }),
  description: z.string().max(100).optional(),
  concept: z.string().describe("Transfer concept code, e.g. VAR."),
  emails: z
    .array(z.string())
    .optional()
    .describe("Recipient emails for the transfer receipt."),
});
export type BindTransferRequest = z.infer<typeof bindTransferRequestSchema>;

export const bindTransferResultSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  from: z.object({ bank_id: z.string(), account_id: z.string() }).optional(),
  counterparty: z
    .object({
      id_type: z.string().optional(),
      account_routing: z
        .object({ scheme: z.string().optional(), address: z.string().optional() })
        .optional(),
    })
    .optional(),
  details: z.object({ origin_id: z.string().optional() }).optional(),
  transaction_ids: z.array(z.string()).optional(),
  status: z.string().describe("e.g. PENDING / COMPLETED / ERROR."),
  status_description: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  charge: z
    .object({
      summary: z.string().optional(),
      value: z.object({ currency: z.string(), amount: z.number() }).optional(),
    })
    .optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type BindTransferResult = z.infer<typeof bindTransferResultSchema>;

// ── DEBIN (verified: POST .../DEBIN/transaction-requests) ────────

export const bindDebinRequestSchema = z.object({
  origin_id: z.string().max(15).describe("Caller-defined unique id, max 15 chars. Idempotent."),
  to: z
    .object({
      cbu: z.string().optional().describe("Buyer CBU or CVU. Required if no alias."),
      label: z.string().optional().describe("Buyer alias. Required if no cbu."),
    })
    .describe("Buyer account to debit (they must approve the DEBIN)."),
  value: z.object({
    currency: z.string().describe("e.g. ARS."),
    amount: z.number().positive().describe("Amount in decimal pesos."),
  }),
  concept: z.string().describe("DEBIN concept code, e.g. VAR / EXP."),
  description: z.string().max(100).optional(),
  provision: z
    .string()
    .optional()
    .describe("Pre-approved recurring provision name, when charging a DEBIN subscription."),
  expiration: z
    .number()
    .int()
    .positive()
    .max(4320)
    .describe("Minutes until the DEBIN request expires (max 4320 = 3 days)."),
});
export type BindDebinRequest = z.infer<typeof bindDebinRequestSchema>;

export const bindDebinResultSchema = z.object({
  id: z.string(),
  type: z.string().optional(),
  from: z.object({ bank_id: z.string(), account_id: z.string() }).optional(),
  details: z
    .object({
      origin_id: z.string().optional(),
      buyer: z
        .object({
          cuit: z.string().optional(),
          alias: z.string().nullable().optional(),
          cbu: z.string().nullable().optional(),
          name: z.string().optional(),
          bank_code: z.string().optional(),
          bank_description: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  transaction_ids: z.array(z.string()).optional(),
  status: z.string().describe("e.g. PENDING."),
  status_description: z.string().optional().describe("e.g. AWAITING_CONFIRMATION."),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  charge: z
    .object({
      summary: z.string().optional(),
      value: z.object({ currency: z.string(), amount: z.number() }).optional(),
    })
    .optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type BindDebinResult = z.infer<typeof bindDebinResultSchema>;

// ── Echeq (verified: GET .../CHECK; detail fields partially listed
//    in public docs, kept loose) ──────────────────────────────────

export const bindEcheqSchema = z.object({
  id: z.string(),
  type: z.string().optional().describe("CHECK."),
  from: z.object({ bank_id: z.string(), account_id: z.string() }).optional(),
  details: z
    .object({
      check: z
        .object({
          type: z.string().optional().describe("e.g. CPD (cheque de pago diferido)."),
          issued_to: z
            .object({
              document_number: z.string().optional(),
              name: z.string().optional(),
              document_type: z.string().optional(),
            })
            .optional(),
          possible_actions: z.array(z.object({ action: z.string() })).optional(),
          has_endorsment_chain: z.boolean().optional(),
          payment_date_due: z.boolean().optional(),
        })
        .loose()
        .optional(),
    })
    .optional(),
  status: z.string().optional(),
  extras: z.record(z.string(), z.unknown()).optional(),
});
export type BindEcheq = z.infer<typeof bindEcheqSchema>;

/** Echeq status filter values per the public docs (obp_status header). */
export interface GetEcheqsArgs {
  accountId: string;
  /** Echeq status filter (required by BIND), e.g. ACTIVE, ACCREDIT, CUSTODY, REJECTED. */
  status: string;
  /** ISSUER or RECEIVER perspective. */
  mode?: string | undefined;
  limit?: number | undefined; // 5 to 20 per page
  offset?: number | undefined; // 1-based page number
  issuedFromDate?: string | undefined; // ISO date
  issuedToDate?: string | undefined;
}

export interface ListAccountsArgs {
  // No args today; reserved for future filters.
}
