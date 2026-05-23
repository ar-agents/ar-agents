/**
 * SICORE adapter contract.
 *
 * The math layer (calc.ts) is pure and doesn't need any adapter. The
 * adapter exists for downstream operations that touch AFIP/ARCA's
 * SICORE upload surface — namely, submitting a monthly DDJJ.
 *
 * SICORE submission is XML-based and requires an AFIP-signed token
 * (WSAA) plus a series of jurisdiction-specific quirks. This package
 * does NOT bundle a default real adapter because:
 *   (a) credentials live in the host, never the lib
 *   (b) the upload surface is significantly more complex than the math
 *   (c) most users will want to file via their accountant's tool, not
 *       directly from agent code
 *
 * v0.1 ships only the contract + an unconfigured default.
 */
import { SicoreUnconfiguredError } from "./errors";
import type { SicoreDdjjResult } from "./types";

export interface SicoreAdapter {
  /**
   * Submit a SICORE DDJJ to AFIP/ARCA. Returns an opaque receipt id
   * (typically the F.997 / F.744 acuse de recibo number) and the raw
   * AFIP response so the host can persist the audit trail.
   */
  submitDdjj(ddjj: SicoreDdjjResult): Promise<{
    receiptId: string;
    submittedAt: string;
    raw?: unknown;
  }>;
}

/** Default. Throws on every submission attempt. Safe for unit tests. */
export class UnconfiguredSicoreAdapter implements SicoreAdapter {
  async submitDdjj(): Promise<never> {
    throw new SicoreUnconfiguredError(
      "submitDdjj",
      "no SICORE submission adapter wired",
    );
  }
}
