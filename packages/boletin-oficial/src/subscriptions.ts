/**
 * Subscription store + matcher for the Boletín Oficial firehose.
 *
 * The pattern: a user / tenant declares "notify me when a norma matches
 * keyword X / CUIT Y / sección Z". The matcher runs each new norma
 * against active subscriptions and emits a `BoMatch` per hit.
 *
 * Adapters: `InMemoryBoSubscriptionAdapter` for dev/tests; implement the
 * `BoSubscriptionAdapter` contract against your DB for production.
 */

import type { BoMatch, BoSubscription, Norma } from "./types";

export interface BoSubscriptionAdapter {
  put(sub: BoSubscription): Promise<void>;
  get(id: string): Promise<BoSubscription | null>;
  list(filter?: { ownerId?: string; activeOnly?: boolean }): Promise<BoSubscription[]>;
  remove(id: string): Promise<void>;
}

export class InMemoryBoSubscriptionAdapter implements BoSubscriptionAdapter {
  private map = new Map<string, BoSubscription>();

  async put(sub: BoSubscription): Promise<void> {
    this.map.set(sub.id, sub);
  }
  async get(id: string): Promise<BoSubscription | null> {
    return this.map.get(id) ?? null;
  }
  async list(filter: { ownerId?: string; activeOnly?: boolean } = {}): Promise<BoSubscription[]> {
    return Array.from(this.map.values()).filter((s) => {
      if (filter.ownerId && s.ownerId !== filter.ownerId) return false;
      if (filter.activeOnly && !s.active) return false;
      return true;
    });
  }
  async remove(id: string): Promise<void> {
    this.map.delete(id);
  }
}

/**
 * Pure-function matcher. Given a norma + a list of active subscriptions,
 * return the matches. No side effects; safe to compose with any storage
 * backend.
 *
 * Match semantics:
 * - **keyword**: case-insensitive substring against title + texto.
 * - **cuit**: exact match against `cuitsMencionados`.
 * - **organismo**: case-insensitive substring against `organismo`.
 * - **seccion**: exact match.
 * - **tipo**: exact match.
 *
 * A subscription with multiple criteria requires ALL to match (AND).
 */
export function matchNorma(norma: Norma, subscriptions: BoSubscription[]): BoMatch[] {
  const matches: BoMatch[] = [];
  for (const sub of subscriptions) {
    if (!sub.active) continue;
    const reasons: string[] = [];
    const m = sub.match;

    if (m.keyword) {
      const haystack = `${norma.titulo}\n${norma.texto ?? ""}`.toLowerCase();
      if (!haystack.includes(m.keyword.toLowerCase())) continue;
      reasons.push(`keyword "${m.keyword}"`);
    }
    if (m.cuit) {
      if (!(norma.cuitsMencionados ?? []).includes(m.cuit)) continue;
      reasons.push(`CUIT ${m.cuit}`);
    }
    if (m.organismo) {
      const o = (norma.organismo ?? "").toLowerCase();
      if (!o.includes(m.organismo.toLowerCase())) continue;
      reasons.push(`organismo "${m.organismo}"`);
    }
    if (m.seccion && norma.seccion !== m.seccion) continue;
    if (m.seccion) reasons.push(`sección ${m.seccion}`);
    if (m.tipo && norma.tipo !== m.tipo) continue;
    if (m.tipo) reasons.push(`tipo ${m.tipo}`);

    // Skip subscriptions with no criteria — those would match everything.
    if (reasons.length === 0) continue;

    matches.push({
      subscription: sub,
      norma,
      reason: reasons.join(" + "),
    });
  }
  return matches;
}

/** Generate a stable subscription id from owner + criteria. */
export function makeSubscriptionId(
  ownerId: string,
  match: BoSubscription["match"],
): string {
  const parts = [
    `o=${ownerId}`,
    match.keyword ? `k=${match.keyword}` : null,
    match.cuit ? `c=${match.cuit}` : null,
    match.organismo ? `org=${match.organismo}` : null,
    match.seccion ? `s=${match.seccion}` : null,
    match.tipo ? `t=${match.tipo}` : null,
  ].filter(Boolean);
  return parts.join("|");
}
