/**
 * DNRPA types.
 *
 * Argentine vehicle plates ("patente" or "dominio"):
 *   - LLNNNLL format (post-2016, e.g. "AB123CD")
 *   - LLLNNN format (1995-2016, e.g. "FFF123")
 *   - Older series exist but are out of scope for v0.1
 */

export interface DominioLookupInput {
  /** Plate as printed on the vehicle. Hyphens stripped automatically. */
  dominio: string;
}

export interface DominioLookupResult {
  dominio: string;
  /** Did DNRPA find a record? */
  found: boolean;
  /** Vehicle type at registration. */
  tipo?: string;
  marca?: string;
  modelo?: string;
  /** Year of model. */
  anio?: number;
  /** Origin code (national / imported / mercosur). */
  origen?: "nacional" | "importado" | "mercosur";
  /** Whether a registered mortgage (prenda) is currently in force. */
  prendaActiva?: boolean;
  /** Whether the vehicle is reported as stolen / restricted. */
  baja?: boolean;
  /** Date of the last title transfer, YYYY-MM-DD. */
  ultimaTransferencia?: string;
  /** Notes returned by DNRPA. */
  note?: string;
}

/** Plate format detection. Useful before hitting an adapter. */
export type DominioFormat = "new_mercosur" | "old_argentine" | "unknown";

export function detectDominioFormat(plate: string): DominioFormat {
  const clean = plate.replace(/[\s-]/g, "").toUpperCase();
  if (/^[A-Z]{2}\d{3}[A-Z]{2}$/.test(clean)) return "new_mercosur"; // LL000LL
  if (/^[A-Z]{3}\d{3}$/.test(clean)) return "old_argentine"; // LLL000
  return "unknown";
}
