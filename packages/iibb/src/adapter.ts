/**
 * IIBB adapter contract.
 *
 * Each jurisdiction has its own portal / API / verification flow. The
 * adapter interface keeps the tool layer jurisdiction-agnostic; a host
 * wires in one adapter per regime they actually need.
 *
 * v0.1 ships:
 *   UnconfiguredIibbAdapter   throws on every operation. Default. Safe
 *                             for unit tests that exercise only the pure
 *                             calculation primitives.
 *   AgipAdapter (stub)        CABA. Stubbed because AGIP requires fiscal
 *                             clave + portal scraping; real adapter is
 *                             on the roadmap once the jurisdiction
 *                             exposes a documented API.
 *   ArbaAdapter (stub)        Provincia de Buenos Aires. Same story.
 *   ConvenioMultilateralAdapter (stub)  Comisión Arbitral / SIRCAR.
 *
 * Hosts can implement custom adapters by satisfying this interface
 * (e.g. a Vultur-managed adapter that proxies through Vultur's own
 * stored ARBA / AGIP credentials).
 */
import type { JurisdictionCode, Padron } from "./types";
import { IibbUnconfiguredError } from "./errors";

export interface IibbAdapter {
  /** The jurisdiction this adapter serves. */
  readonly jurisdiction: JurisdictionCode;

  /**
   * Look up a CUIT's taxpayer status in this jurisdiction. Returns null
   * if the taxpayer is not found in the padrón.
   */
  lookupPadron(cuit: string): Promise<Padron | null>;

  /**
   * Submit a monthly DDJJ to the jurisdiction's portal. Returns an
   * opaque submission receipt id. For jurisdictions without API
   * submission, this throws IibbUnconfiguredError.
   */
  submitDdjj(ddjjPayload: unknown): Promise<{ receiptId: string }>;
}

abstract class StubAdapter implements IibbAdapter {
  abstract readonly jurisdiction: JurisdictionCode;
  protected readonly label: string;

  protected constructor(label: string) {
    this.label = label;
  }

  async lookupPadron(): Promise<never> {
    throw new IibbUnconfiguredError("lookupPadron", this.label);
  }
  async submitDdjj(): Promise<never> {
    throw new IibbUnconfiguredError("submitDdjj", this.label);
  }
}

/** Default. Throws on every call. Safe for unit tests. */
export class UnconfiguredIibbAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode;

  constructor(jurisdiction: JurisdictionCode) {
    super(`unconfigured (${jurisdiction})`);
    this.jurisdiction = jurisdiction;
  }
}

/**
 * AGIP adapter for CABA (Ciudad Autónoma de Buenos Aires).
 *
 * v0.1 STUB: AGIP requires fiscal clave-based authentication via the
 * "Mis Servicios" portal; there is no public REST API at the time of
 * this release. Throws IibbUnconfiguredError on every operation, with
 * a clear message pointing operators to the manual portal flow. A real
 * adapter is on the roadmap once AGIP exposes a documented endpoint.
 */
export class AgipAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode = "CABA";

  constructor() {
    super("AGIP (CABA)");
  }
}

/**
 * ARBA adapter for Provincia de Buenos Aires.
 *
 * v0.1 STUB: ARBA uses CIT/clave-based authentication to its web
 * services and has no documented public REST API for DDJJ submission.
 * Throws IibbUnconfiguredError on every operation.
 */
export class ArbaAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode = "BSAS";

  constructor() {
    super("ARBA (Buenos Aires)");
  }
}

/**
 * Convenio Multilateral adapter (Comisión Arbitral / SIRCAR).
 *
 * v0.1 STUB: SIRCAR (Sistema de Recaudación y Control de Agentes de
 * Recaudación) exposes a SIRCREB / SIRCUPA endpoint surface that
 * requires CIT-style authentication. Throws IibbUnconfiguredError on
 * every operation.
 */
export class ConvenioMultilateralAdapter extends StubAdapter {
  readonly jurisdiction: JurisdictionCode = "CM";

  constructor() {
    super("Comisión Arbitral (Convenio Multilateral)");
  }
}
