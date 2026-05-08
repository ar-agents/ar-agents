/**
 * `@ar-agents/gde-tad/testing` — fixtures + mock adapters for tests.
 *
 *   - **`MockDomicilioAdapter`** — drop-in for `DomicilioAdapter`. Seed
 *     CUIT → DomicilioInboxResult mappings; `.calls` records every lookup.
 *   - **`MockTramitesAdapter`** — drop-in for `TramitesAdapter`.
 *   - **Factories** for the result shapes:
 *     `mockNotification`, `mockCriticalIntimacionArca`,
 *     `mockInfoCircularBcra`, `mockTramite`, `mockTramiteResuelto`.
 */

import { computeSeverity } from "./severity";
import type {
  DomicilioAdapter,
  DomicilioInboxResult,
  DomicilioNotification,
  MisTramitesResult,
  Tramite,
  TramitesAdapter,
} from "./types";

const todayIso = (offsetDays = 0): string => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString();
};

const synthId = (seed: string): string =>
  `NOT-${new Date().getFullYear()}-${seed}-APN-DEC`;

// ─────────────────────────────────────────────────────────────────────────────
// Notification factories
// ─────────────────────────────────────────────────────────────────────────────

export function mockNotification(
  overrides: Partial<DomicilioNotification> = {},
): DomicilioNotification {
  const subject = overrides.subject ?? "Notificación de cortesía";
  const organism = overrides.organism ?? "ARCA";
  const responseDueBy = overrides.responseDueBy ?? null;
  return {
    id: overrides.id ?? synthId(Math.floor(Math.random() * 100000).toString()),
    organism,
    subject,
    notifiedAt: overrides.notifiedAt ?? todayIso(0),
    responseDueBy,
    body: overrides.body ?? "—",
    acknowledged: overrides.acknowledged ?? false,
    severity:
      overrides.severity ?? computeSeverity({ organism, subject, responseDueBy }),
  };
}

export function mockCriticalIntimacionArca(
  overrides: Partial<DomicilioNotification> = {},
): DomicilioNotification {
  return mockNotification({
    organism: "ARCA",
    subject:
      "Intimación por incumplimiento de deber formal — Resolución General 4291",
    notifiedAt: todayIso(-2),
    responseDueBy: todayIso(15),
    body:
      "Se intima al contribuyente a presentar la declaración jurada de IVA del período 2026-04 en un plazo de 15 días corridos, bajo apercibimiento de aplicar las sanciones previstas en la ley 11.683.",
    ...overrides,
  });
}

export function mockInfoCircularBcra(
  overrides: Partial<DomicilioNotification> = {},
): DomicilioNotification {
  return mockNotification({
    organism: "BCRA",
    subject: "Circular informativa — Modificación de tasas de referencia",
    notifiedAt: todayIso(-5),
    responseDueBy: null,
    body:
      "El BCRA informa que a partir del próximo período mensual modificará las tasas de referencia. Notificación de cortesía — no requiere acción.",
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Trámite factories
// ─────────────────────────────────────────────────────────────────────────────

export function mockTramite(overrides: Partial<Tramite> = {}): Tramite {
  return {
    numero:
      overrides.numero ??
      `EX-${new Date().getFullYear()}-${Math.floor(Math.random() * 100000)}-APN-DGD#MI`,
    type: overrides.type ?? "Inscripción de Sociedad",
    organism: overrides.organism ?? "IGJ",
    status: overrides.status ?? "tramitacion",
    startedAt: overrides.startedAt ?? todayIso(-15),
    lastUpdatedAt: overrides.lastUpdatedAt ?? todayIso(-1),
    lastStatusNote:
      overrides.lastStatusNote ?? "En análisis por el área de inscripciones.",
    publicUrl: overrides.publicUrl ?? null,
  };
}

export function mockTramiteResuelto(overrides: Partial<Tramite> = {}): Tramite {
  return mockTramite({
    status: "resuelto-favorable",
    lastStatusNote:
      "Trámite resuelto favorablemente. Se emite el documento correspondiente.",
    lastUpdatedAt: todayIso(-3),
    ...overrides,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock adapters
// ─────────────────────────────────────────────────────────────────────────────

export class MockDomicilioAdapter implements DomicilioAdapter {
  private readonly store = new Map<string, DomicilioInboxResult>();
  /** Append-only log of every list call. */
  readonly calls: string[] = [];

  seed(cuit: string, result: DomicilioInboxResult): this {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.store.set(normalized, { ...result, cuit: normalized });
    return this;
  }

  seedNotifications(cuit: string, notifications: DomicilioNotification[]): this {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.store.set(normalized, {
      cuit: normalized,
      available: true,
      error: null,
      notifications,
    });
    return this;
  }

  reset(): this {
    this.calls.length = 0;
    return this;
  }

  clear(): this {
    this.store.clear();
    this.calls.length = 0;
    return this;
  }

  async list(cuit: string): Promise<DomicilioInboxResult> {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.calls.push(normalized);
    const seeded = this.store.get(normalized);
    if (seeded) return seeded;
    return {
      cuit: normalized,
      available: true,
      error: null,
      notifications: [],
    };
  }
}

export class MockTramitesAdapter implements TramitesAdapter {
  private readonly store = new Map<string, MisTramitesResult>();
  readonly calls: string[] = [];

  seed(cuit: string, result: MisTramitesResult): this {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.store.set(normalized, { ...result, cuit: normalized });
    return this;
  }

  seedTramites(cuit: string, tramites: Tramite[]): this {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.store.set(normalized, {
      cuit: normalized,
      available: true,
      error: null,
      tramites,
    });
    return this;
  }

  reset(): this {
    this.calls.length = 0;
    return this;
  }

  clear(): this {
    this.store.clear();
    this.calls.length = 0;
    return this;
  }

  async list(cuit: string): Promise<MisTramitesResult> {
    const normalized = cuit.replace(/[^\d]/g, "");
    this.calls.push(normalized);
    const seeded = this.store.get(normalized);
    if (seeded) return seeded;
    return {
      cuit: normalized,
      available: true,
      error: null,
      tramites: [],
    };
  }
}
