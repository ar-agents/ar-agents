import { z } from "zod";
import { CategoryId, ItemAttribute } from "./common";

// ---------------------------------------------------------------------------
// Category predictor — `/sites/{site}/category_predictor/predict`
// ---------------------------------------------------------------------------

export const CategoryPrediction = z.object({
  category_id: CategoryId,
  category_name: z.string(),
  domain_id: z.string().optional(),
  domain_name: z.string().optional(),
  prediction_probability: z.number().min(0).max(1).optional(),
  attributes: z.array(ItemAttribute).optional(),
  /** Path to root, e.g. "Electrónica > Celulares y Teléfonos > Celulares y Smartphones". */
  category_path: z
    .array(z.object({ id: CategoryId, name: z.string() }))
    .optional(),
});
export type CategoryPrediction = z.infer<typeof CategoryPrediction>;

// ---------------------------------------------------------------------------
// Domain discovery — `/sites/{site}/domain_discovery/search` (better than predictor)
// ---------------------------------------------------------------------------

export const DomainDiscoveryResult = z.object({
  domain_id: z.string(),
  domain_name: z.string(),
  category_id: CategoryId,
  category_name: z.string(),
  attributes: z
    .array(
      z.object({
        id: z.string(),
        value_id: z.string().nullable().optional(),
        value_name: z.string().nullable().optional(),
      }),
    )
    .optional(),
});
export type DomainDiscoveryResult = z.infer<typeof DomainDiscoveryResult>;

// ---------------------------------------------------------------------------
// Domain technical specs — `/domains/{id}/technical_specs/input`
// ---------------------------------------------------------------------------

export const TechnicalSpecAttribute = z.object({
  id: z.string(),
  name: z.string().optional(),
  hierarchy: z.string().optional(),
  relevance: z.number().int().optional(),
  required: z.boolean().optional(),
  /** Allowed values when the attribute has a closed enum. */
  values: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        metadata: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  value_type: z.string().optional(),
  value_max_length: z.number().int().optional(),
  tags: z.record(z.string(), z.unknown()).optional(),
});
export type TechnicalSpecAttribute = z.infer<typeof TechnicalSpecAttribute>;

export const TechnicalSpecResponse = z.object({
  /** "MAIN" attributes are required to publish; "DELT" are optional but
   * recommended for relevance / catalog matching. */
  groups: z.array(
    z.object({
      id: z.string(),
      label: z.string().optional(),
      components: z.array(TechnicalSpecAttribute),
    }),
  ),
});
export type TechnicalSpecResponse = z.infer<typeof TechnicalSpecResponse>;

// ---------------------------------------------------------------------------
// Category metadata — `/categories/{id}`
// ---------------------------------------------------------------------------

export const CategoryMetadata = z.object({
  id: CategoryId,
  name: z.string(),
  picture: z.string().url().nullable().optional(),
  permalink: z.string().nullable().optional(),
  total_items_in_this_category: z.number().int().nonnegative().optional(),
  path_from_root: z
    .array(z.object({ id: CategoryId, name: z.string() }))
    .optional(),
  children_categories: z
    .array(z.object({ id: CategoryId, name: z.string() }))
    .optional(),
  attribute_types: z.string().optional(),
  attributes: z.array(TechnicalSpecAttribute).optional(),
  settings: z.record(z.string(), z.unknown()).optional(),
});
export type CategoryMetadata = z.infer<typeof CategoryMetadata>;
