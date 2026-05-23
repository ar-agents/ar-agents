/**
 * IVA perception adapter contract.
 *
 * v0.1 ships only the contract + an unconfigured default. The math
 * layer (calc.ts) is pure and doesn't need an adapter. SIRE
 * submission (IVA perceptions are filed via SIRE, the unified
 * retentions+perceptions filing surface) is XML over WSAA and the
 * host's territory.
 */
import { IvaPerceptionUnconfiguredError } from "./errors";
import type { PerceptionDdjjResult } from "./types";

export interface IvaPerceptionAdapter {
  /** Submit a SIRE perception DDJJ. */
  submitDdjj(ddjj: PerceptionDdjjResult): Promise<{
    receiptId: string;
    submittedAt: string;
    raw?: unknown;
  }>;
}

export class UnconfiguredIvaPerceptionAdapter implements IvaPerceptionAdapter {
  async submitDdjj(): Promise<never> {
    throw new IvaPerceptionUnconfiguredError(
      "submitDdjj",
      "no SIRE submission adapter wired",
    );
  }
}
