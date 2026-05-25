/**
 * IVA retention adapter contract.
 *
 * v0.1 ships only the contract + an unconfigured default. SIRE
 * submission (IVA retentions are filed via SIRE alongside Ganancias
 * retentions) is XML over WSAA and lives in the host's territory.
 */
import { IvaRetentionUnconfiguredError } from "./errors";
import type { RetentionDdjjResult } from "./types";

export interface IvaRetentionAdapter {
  /** Submit a SIRE retention DDJJ. */
  submitDdjj(ddjj: RetentionDdjjResult): Promise<{
    receiptId: string;
    submittedAt: string;
    raw?: unknown;
  }>;
}

export class UnconfiguredIvaRetentionAdapter implements IvaRetentionAdapter {
  async submitDdjj(): Promise<never> {
    throw new IvaRetentionUnconfiguredError(
      "submitDdjj",
      "no SIRE submission adapter wired",
    );
  }
}
