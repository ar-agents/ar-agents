/**
 * Vercel AI SDK tool collection for `@ar-agents/igj`.
 *
 * Six tools, all read-only:
 *
 *   - `igj_search_entities`    , search the IGJ entity dataset.
 *   - `igj_get_entity`         , fetch one entity by id.
 *   - `igj_get_domicilios`     , domicilios for an entity.
 *   - `igj_get_autoridades`    , directors/officers for an entity.
 *   - `igj_get_balances`       , filed balances for an entity.
 *   - `igj_get_asambleas`      , asambleas for an entity.
 *
 * Every result includes a `coverageNote` field, the IGJ open dataset
 * is a SAMPLE, not real-time. Surface that note when the user might be
 * making decisions about whether an entity exists.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { IgjFetcher } from "./fetcher";
import type { IgjEntityType } from "./types";

export type IgjToolName =
  | "igj_search_entities"
  | "igj_get_entity"
  | "igj_get_domicilios"
  | "igj_get_autoridades"
  | "igj_get_balances"
  | "igj_get_asambleas";

export interface IgjToolsOptions {
  fetcher: IgjFetcher;
  descriptions?: Partial<Record<IgjToolName, string>>;
}

const DEFAULT_DESCRIPTIONS: Record<IgjToolName, string> = {
  igj_search_entities:
    "Search IGJ-registered Argentine entities (buscar sociedades en IGJ; sociedades, asociaciones, fundaciones) via the public CKAN open data at datos.jus.gob.ar. Returns matching entities + a `coverageNote` (the dataset is SAMPLE/muestreo, not real-time). USE THIS WHEN: you need to find entities by name, CUIT, type, or date range. ALWAYS surface `coverageNote` so users know the data isn't authoritative, use the IGJ portal for live verification.",

  igj_get_entity:
    "Fetch a single IGJ entity by its dataset id (consultar una entidad IGJ). Returns the entity record including razón social, CUIT (when present), tipo de entidad, fecha de inscripción, matrícula. Returns `null` when not found. USE THIS WHEN: you have an entity id from `igj_search_entities` and need the full record.",

  igj_get_domicilios:
    "Fetch the registered domicilios (addresses) for an IGJ entity by its id. Multiple domicilios may exist (legal, fiscal, real). USE THIS WHEN: the user wants the registered address of a sociedad/asociación, or to verify a domicilio claim.",

  igj_get_autoridades:
    "Fetch the registered authorities (directors, officers, trustees) of an IGJ entity. Includes nombre, cargo, fecha de designación, and inferred genre when available. USE THIS WHEN: the user asks who is on the board of a sociedad, or wants to know who legally represents an entity.",

  igj_get_balances:
    "Fetch the balances (financial reports) filed at IGJ for an entity. Includes cierre de ejercicio, número de ejercicio, fecha de presentación. USE THIS WHEN: the user wants to know if a sociedad is up to date on its balance filings, or wants to track filing history. NOTE: the dataset stores filing metadata, NOT the balance content itself, that lives in TAD/IGJ portal.",

  igj_get_asambleas:
    "Fetch the registered asambleas (meetings) of an IGJ entity. Includes tipo (ordinaria/extraordinaria) and fecha. USE THIS WHEN: you want to know when a sociedad held its last asamblea or track the calendar of meetings.",
};

export function igjTools(options: IgjToolsOptions): ToolSet {
  const desc = (name: IgjToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];
  const entityTypeEnum = z.enum([
    "sa",
    "srl",
    "asociacion_civil",
    "fundacion",
    "cooperativa",
    "mutual",
    "sociedad_extranjera",
    "sas",
    "otro",
  ]);

  return {
    igj_search_entities: tool({
      description: desc("igj_search_entities"),
      inputSchema: z.object({
        query: z.string().optional().describe("Free-text query (matches nombre + CUIT)."),
        tipos: z.array(entityTypeEnum).optional(),
        cuit: z.string().optional().describe("Bare 11-digit CUIT, exact match."),
        from: z.string().optional().describe("ISO date YYYY-MM-DD lower bound on fecha de inscripción."),
        to: z.string().optional().describe("ISO date YYYY-MM-DD upper bound."),
        cursor: z.string().optional(),
        page_size: z.number().int().min(1).max(100).optional(),
      }),
      execute: async (input) => {
        const q: Parameters<IgjFetcher["search"]>[0] = {};
        if (input.query !== undefined) q.query = input.query;
        if (input.tipos !== undefined) q.tipos = input.tipos as IgjEntityType[];
        if (input.cuit !== undefined) q.cuit = input.cuit;
        if (input.from !== undefined) q.from = input.from;
        if (input.to !== undefined) q.to = input.to;
        if (input.cursor !== undefined) q.cursor = input.cursor;
        if (input.page_size !== undefined) q.pageSize = input.page_size;
        return await options.fetcher.search(q);
      },
    }),

    igj_get_entity: tool({
      description: desc("igj_get_entity"),
      inputSchema: z.object({
        id: z.string().describe("IGJ dataset id (from igj_search_entities)."),
      }),
      execute: async (input) => {
        const entity = await options.fetcher.getEntity(input.id);
        if (!entity) return { found: false, id: input.id };
        return { found: true, entity };
      },
    }),

    igj_get_domicilios: tool({
      description: desc("igj_get_domicilios"),
      inputSchema: z.object({
        entity_id: z.string(),
      }),
      execute: async (input) => ({
        domicilios: await options.fetcher.getDomicilios(input.entity_id),
      }),
    }),

    igj_get_autoridades: tool({
      description: desc("igj_get_autoridades"),
      inputSchema: z.object({
        entity_id: z.string(),
      }),
      execute: async (input) => ({
        autoridades: await options.fetcher.getAutoridades(input.entity_id),
      }),
    }),

    igj_get_balances: tool({
      description: desc("igj_get_balances"),
      inputSchema: z.object({
        entity_id: z.string(),
      }),
      execute: async (input) => ({
        balances: await options.fetcher.getBalances(input.entity_id),
      }),
    }),

    igj_get_asambleas: tool({
      description: desc("igj_get_asambleas"),
      inputSchema: z.object({
        entity_id: z.string(),
      }),
      execute: async (input) => ({
        asambleas: await options.fetcher.getAsambleas(input.entity_id),
      }),
    }),
  };
}
