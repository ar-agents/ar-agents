/**
 * Default unconfigured adapters. Drop-in stand-ins so calling
 * `gdeTadTools()` without explicit adapters still returns something
 * actionable instead of throwing at construction time.
 *
 * Wire a real adapter when you have a TAD-issued cert + the agency-
 * specific contract live. Until then, every read returns
 * `available: false` with a helpful pointer.
 */

import type {
  DomicilioAdapter,
  DomicilioInboxResult,
  MisTramitesResult,
  TramitesAdapter,
} from "./types";
import { normalizeCuit } from "./cuit";

const SETUP_HINT =
  "Wire a real DomicilioAdapter / TramitesAdapter via gdeTadTools({ domicilio, tramites }). The official TAD/GDE B2G surface is rolling out per organism — see RFC-001 § 3.4.";

export class UnconfiguredDomicilioAdapter implements DomicilioAdapter {
  async list(cuit: string): Promise<DomicilioInboxResult> {
    return {
      cuit: normalizeCuit(cuit),
      available: false,
      error: `Domicilio Electrónico adapter no está configurado. ${SETUP_HINT}`,
      notifications: [],
    };
  }
}

export class UnconfiguredTramitesAdapter implements TramitesAdapter {
  async list(cuit: string): Promise<MisTramitesResult> {
    return {
      cuit: normalizeCuit(cuit),
      available: false,
      error: `Mis Trámites adapter no está configurado. ${SETUP_HINT}`,
      tramites: [],
    };
  }
}
