/**
 * Vercel AI SDK tool collection for `@ar-agents/boletin-oficial`.
 *
 * Six tools, grouped by intent:
 *
 *   Read:
 *   - bo_search           — free-text + filters → list of normas
 *   - bo_get_norma        — fetch a single norma by id
 *   - bo_today            — convenience wrapper for "today's publications"
 *
 *   Subscriptions:
 *   - bo_subscribe        — register a keyword/CUIT/sección match
 *   - bo_list_subscriptions
 *   - bo_unsubscribe
 *
 * The subscription tools accept an `owner_id` so the agent can scope
 * subscriptions to the current user/tenant. Pass the same value across
 * calls within a session.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { BoFetcher } from "./fetcher";
import {
  type BoSubscriptionAdapter,
  InMemoryBoSubscriptionAdapter,
  makeSubscriptionId,
} from "./subscriptions";
import type { BoSeccion, NormaTipo } from "./types";

export type BoToolName =
  | "bo_search"
  | "bo_get_norma"
  | "bo_today"
  | "bo_subscribe"
  | "bo_list_subscriptions"
  | "bo_unsubscribe";

export interface BoToolsOptions {
  fetcher: BoFetcher;
  /** Defaults to a process-local in-memory store. */
  subscriptions?: BoSubscriptionAdapter;
  /** Override agent-facing tool descriptions. */
  descriptions?: Partial<Record<BoToolName, string>>;
}

const DEFAULT_DESCRIPTIONS: Record<BoToolName, string> = {
  bo_search:
    "Search the Argentine Boletín Oficial. Returns a list of normas (laws, decrees, resoluciones, sociedades, contracting, judicial notices) matching free-text query + optional filters (sección, organismo, CUIT, date range). USE THIS WHEN: the user wants to find a specific publication, monitor a topic, or audit recent state activity. RETURNS at most 20 results per call by default — paginate with `cursor` for more. NOTE: the BO has no documented public API — results come from the official website's search and may be incomplete on the same-day publication.",

  bo_get_norma:
    "Fetch a single norma by its BO id. Returns the title, organismo, full text, fecha de publicación, and any CUITs mentioned. USE THIS WHEN: you have an id (from `bo_search` or a URL the user pasted) and need the full text or details. CUIT extraction is heuristic — validate any CUIT before trusting it.",

  bo_today:
    "Fetch today's publications from the Boletín Oficial, optionally filtered by sección. USE THIS WHEN: the user wants a daily summary of newly-published norms, e.g. `qué publicó el BO hoy`. Defaults to Sección Primera (legislación) — pass `seccion` to switch.",

  bo_subscribe:
    "Register a subscription on the Boletín Oficial. The matcher fires whenever a new norma matches the criteria — keyword, CUIT, organismo, sección, or tipo. USE THIS WHEN: the user wants ongoing monitoring (e.g., 'avisame cuando ARCA publique resoluciones', 'subscribir CUIT 30-12345678-9'). Returns the subscription id; pass to `bo_unsubscribe` to remove. AT LEAST ONE criterion (keyword/cuit/organismo/seccion/tipo) MUST be set — empty subscriptions are rejected.",

  bo_list_subscriptions:
    "List active subscriptions for an owner. USE THIS WHEN: the user wants to see what they've subscribed to. Pass `owner_id` to scope to a specific user/tenant.",

  bo_unsubscribe:
    "Remove a subscription by id. USE THIS WHEN: the user wants to stop a previous bo_subscribe.",
};

export function boletinOficialTools(options: BoToolsOptions): ToolSet {
  const subs = options.subscriptions ?? new InMemoryBoSubscriptionAdapter();
  const desc = (name: BoToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];
  const seccionEnum = z.enum(["primera", "segunda", "tercera", "cuarta"]);
  const tipoEnum = z.enum([
    "ley",
    "decreto",
    "resolucion",
    "disposicion",
    "comunicacion",
    "decision_administrativa",
    "sociedad",
    "contratacion",
    "edicto",
    "otro",
  ]);

  return {
    bo_search: tool({
      description: desc("bo_search"),
      inputSchema: z.object({
        query: z.string().optional().describe("Free-text query."),
        secciones: z.array(seccionEnum).optional(),
        organismo: z.string().optional(),
        cuit: z.string().optional().describe("Bare 11-digit CUIT (e.g., 30123456789)."),
        from: z.string().optional().describe("ISO date YYYY-MM-DD."),
        to: z.string().optional().describe("ISO date YYYY-MM-DD."),
        cursor: z.string().optional(),
        page_size: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const q: Parameters<BoFetcher["search"]>[0] = {};
        if (input.query !== undefined) q.query = input.query;
        if (input.secciones !== undefined) q.secciones = input.secciones as BoSeccion[];
        if (input.organismo !== undefined) q.organismo = input.organismo;
        if (input.cuit !== undefined) q.cuit = input.cuit;
        if (input.from !== undefined) q.from = input.from;
        if (input.to !== undefined) q.to = input.to;
        if (input.cursor !== undefined) q.cursor = input.cursor;
        if (input.page_size !== undefined) q.pageSize = input.page_size;
        return await options.fetcher.search(q);
      },
    }),

    bo_get_norma: tool({
      description: desc("bo_get_norma"),
      inputSchema: z.object({
        id: z.string().describe("Boletín Oficial internal id."),
      }),
      execute: async (input) => {
        const norma = await options.fetcher.getNorma(input.id);
        if (!norma) return { found: false, id: input.id };
        return { found: true, norma };
      },
    }),

    bo_today: tool({
      description: desc("bo_today"),
      inputSchema: z.object({
        seccion: seccionEnum.optional(),
      }),
      execute: async (input) => {
        const today = new Date().toISOString().slice(0, 10);
        const q: Parameters<BoFetcher["search"]>[0] = {
          from: today,
          to: today,
        };
        if (input.seccion !== undefined) q.secciones = [input.seccion as BoSeccion];
        return await options.fetcher.search(q);
      },
    }),

    bo_subscribe: tool({
      description: desc("bo_subscribe"),
      inputSchema: z.object({
        owner_id: z.string().describe("Caller's user/tenant id; subscriptions are scoped to this."),
        keyword: z.string().optional(),
        cuit: z.string().optional(),
        organismo: z.string().optional(),
        seccion: seccionEnum.optional(),
        tipo: tipoEnum.optional(),
      }),
      execute: async (input) => {
        const match = {
          ...(input.keyword !== undefined ? { keyword: input.keyword } : {}),
          ...(input.cuit !== undefined ? { cuit: input.cuit } : {}),
          ...(input.organismo !== undefined ? { organismo: input.organismo } : {}),
          ...(input.seccion !== undefined ? { seccion: input.seccion as BoSeccion } : {}),
          ...(input.tipo !== undefined ? { tipo: input.tipo as NormaTipo } : {}),
        };
        if (Object.keys(match).length === 0) {
          return {
            ok: false,
            error:
              "subscription_invalid: at least one of keyword/cuit/organismo/seccion/tipo must be set.",
          };
        }
        const id = makeSubscriptionId(input.owner_id, match);
        await subs.put({
          id,
          ownerId: input.owner_id,
          match,
          createdAt: Date.now(),
          active: true,
        });
        return { ok: true, id, match };
      },
    }),

    bo_list_subscriptions: tool({
      description: desc("bo_list_subscriptions"),
      inputSchema: z.object({
        owner_id: z.string(),
        active_only: z.boolean().optional(),
      }),
      execute: async (input) => {
        const list = await subs.list({
          ownerId: input.owner_id,
          activeOnly: input.active_only ?? true,
        });
        return { count: list.length, subscriptions: list };
      },
    }),

    bo_unsubscribe: tool({
      description: desc("bo_unsubscribe"),
      inputSchema: z.object({
        id: z.string(),
      }),
      execute: async (input) => {
        await subs.remove(input.id);
        return { ok: true, id: input.id };
      },
    }),
  };
}
