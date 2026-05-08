/**
 * `@ar-agents/identity/testing` — fixtures + a mock AFIP padrón adapter.
 *
 * What you get:
 *
 *   - **`MockAfipPadronAdapter`** — drop-in replacement for the live
 *     WSAA-backed adapter. Backed by an in-memory map; tests preload the
 *     CUITs they care about and the lookup returns deterministic results
 *     without a network call.
 *
 *   - **Factories** for the result shape: `mockAfipPadronAvailable`
 *     (constancia found), `mockAfipPadronUnavailable` (CUIT not in
 *     register), and `mockAfipPadronError` (transient AFIP failure).
 *
 * Why a subpath: keeps the dev-only mock out of the production bundle.
 *
 * @example
 * ```ts
 * import { identityTools } from "@ar-agents/identity";
 * import { MockAfipPadronAdapter, mockAfipPadronAvailable } from "@ar-agents/identity/testing";
 *
 * const afip = new MockAfipPadronAdapter();
 * afip.seed("20-12345678-9", mockAfipPadronAvailable({
 *   nombre: "Acme SRL",
 *   condicion: "RESPONSABLE_INSCRIPTO",
 * }));
 * const tools = identityTools({ afip });
 * ```
 */

import type { AfipPadronAdapter } from "./afip";
import type { AfipPadronData, AfipPadronResult } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Factories
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DATA: AfipPadronData = {
  nombre: "Test Persona",
  apellido: null,
  razonSocial: null,
  condicion: "RESPONSABLE_INSCRIPTO",
  tipoClave: "CUIT",
  estadoClave: "ACTIVO",
  fechaInscripcion: "2010-01-01",
  monotributoCategoria: null,
  monotributoActividad: null,
  monotributoFechaIngreso: null,
  monotributoMotivoBaja: null,
  monotributoFechaBaja: null,
  domicilioFiscal: {
    direccion: "Calle Falsa 123",
    localidad: "Buenos Aires",
    provincia: "CABA",
    codigoPostal: "1000",
  },
  domicilioReal: null,
  actividadPrincipal: {
    codigo: "620100",
    descripcion: "Servicios de consultores en informática",
    periodo: "201801",
  },
  impuestos: [],
  raw: null,
} as unknown as AfipPadronData;

/** Return shape: a CUIT that's registered and active in AFIP/ARCA. */
export function mockAfipPadronAvailable(
  overrides: Partial<AfipPadronData> = {},
  cuit = "20123456789",
): AfipPadronResult {
  return {
    cuit,
    available: true,
    error: null,
    data: { ...DEFAULT_DATA, ...overrides } as AfipPadronData,
  };
}

/** Return shape: AFIP responded but the CUIT isn't in the register. */
export function mockAfipPadronUnavailable(
  cuit = "20999999999",
  reason = "La Clave (CUIT/CUIL) consultada es inexistente",
): AfipPadronResult {
  return { cuit, available: false, error: reason, data: null };
}

/** Return shape: AFIP threw a transient error (5xx, timeout, certificate untrusted). */
export function mockAfipPadronError(
  cuit = "20123456789",
  reason = "AFIP returned HTTP 503 (Service Unavailable). Retry in 30 seconds.",
): AfipPadronResult {
  return { cuit, available: false, error: reason, data: null };
}

/** Convenience: a monotributista with category + actividad. */
export function mockMonotributista(
  args: { cuit?: string; categoria?: string; actividad?: string } = {},
): AfipPadronResult {
  return mockAfipPadronAvailable(
    {
      condicion: "MONOTRIBUTISTA",
      monotributoCategoria: args.categoria ?? "A",
      monotributoActividad: args.actividad ?? "SERVICIOS",
      monotributoFechaIngreso: "2020-06-01",
    } as Partial<AfipPadronData>,
    args.cuit ?? "20987654321",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MockAfipPadronAdapter
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Implements `AfipPadronAdapter` against an in-memory store. Seed with the
 * CUITs your test needs. Unknown CUITs return `available: false` with a
 * "no seeded result" error so failures are loud.
 */
export class MockAfipPadronAdapter implements AfipPadronAdapter {
  private readonly store = new Map<string, AfipPadronResult>();
  /** Append-only log of every lookup call — handy for `expect(adapter.calls).toContain(…)`. */
  readonly calls: string[] = [];

  /** Pre-load a result keyed by normalized CUIT (11 digits, no dashes). */
  seed(cuit: string, result: AfipPadronResult): this {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.store.set(normalized, { ...result, cuit: normalized });
    return this;
  }

  /** Pre-load several at once. */
  seedMany(entries: Record<string, AfipPadronResult>): this {
    for (const [cuit, result] of Object.entries(entries)) {
      this.seed(cuit, result);
    }
    return this;
  }

  /** Reset the call log between tests. Keeps seeded data — call `clear()` for a full reset. */
  reset(): this {
    this.calls.length = 0;
    return this;
  }

  /** Wipe both seeded data and call log. */
  clear(): this {
    this.store.clear();
    this.calls.length = 0;
    return this;
  }

  async lookup(cuit: string): Promise<AfipPadronResult> {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.calls.push(normalized);
    const seeded = this.store.get(normalized);
    if (seeded) return seeded;
    return {
      cuit: normalized,
      available: false,
      error: `MockAfipPadronAdapter: no seeded result for CUIT ${normalized}. Call adapter.seed(cuit, mockAfipPadronAvailable({...})) before the lookup.`,
      data: null,
    };
  }
}
