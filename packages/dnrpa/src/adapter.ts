/**
 * Adapter contract for DNRPA.
 *
 * DNRPA's public consulta-de-dominio form sits behind a captcha at
 * www.dnrpa.gov.ar. There is NO free REST API; v0.1 ships:
 *
 *   - UnconfiguredDnrpaAdapter — throws on call (safe default for tests).
 *   - InMemoryDnrpaAdapter — accepts seed data for unit tests.
 *
 * For production lookups, users wire a BrowserDnrpaAdapter on top of a
 * browse runtime (browserbase/skills, Playwright, etc.). That adapter
 * lives outside this package because it depends on the browse runtime
 * of choice.
 */

import { DnrpaUnconfiguredError } from "./errors";
import type { DominioLookupInput, DominioLookupResult } from "./types";

export interface DnrpaAdapter {
  lookupDominio(input: DominioLookupInput): Promise<DominioLookupResult>;
}

export class UnconfiguredDnrpaAdapter implements DnrpaAdapter {
  async lookupDominio(): Promise<never> {
    throw new DnrpaUnconfiguredError("lookupDominio");
  }
}

export interface InMemoryDnrpaSeed {
  dominios?: DominioLookupResult[];
}

export class InMemoryDnrpaAdapter implements DnrpaAdapter {
  constructor(private readonly seed: InMemoryDnrpaSeed = {}) {}
  async lookupDominio(input: DominioLookupInput): Promise<DominioLookupResult> {
    const clean = input.dominio.replace(/[\s-]/g, "").toUpperCase();
    const match = (this.seed.dominios ?? []).find(
      (d) => d.dominio.replace(/[\s-]/g, "").toUpperCase() === clean,
    );
    return match ?? { dominio: clean, found: false };
  }
}
