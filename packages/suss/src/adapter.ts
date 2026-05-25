/**
 * SUSS adapter contract.
 *
 * v0.1 ships only the math + an unconfigured submission stub. The
 * SICOSS submission surface (fixed-width F.931 / SICOSS file + WSAA
 * authentication via the SI.AP.RE web service) lives in v0.2.
 */

import { SussUnconfiguredError } from "./errors";
import type { SicossDdjjResult } from "./types";

export interface SussAdapter {
  /** Submit a SICOSS DDJJ to AFIP. Returns a receipt id + raw response. */
  submitDdjj(ddjj: SicossDdjjResult): Promise<{
    receiptId: string;
    submittedAt: string;
    raw?: unknown;
  }>;
}

export class UnconfiguredSussAdapter implements SussAdapter {
  async submitDdjj(): Promise<never> {
    throw new SussUnconfiguredError(
      "submitDdjj",
      "no SICOSS submission adapter wired",
    );
  }
}
