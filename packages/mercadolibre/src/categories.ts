// Categories — `/sites/{site}/category_predictor`,
// `/sites/{site}/domain_discovery/search`, `/domains/{id}/technical_specs/input`,
// `/categories/{id}`.
//
// THE killer-app endpoints for agentic listings: predict the category from
// title + description, fetch required attributes per domain, and surface
// suggested values so the agent can fill them.

import type { MeliClient } from "./client";
import {
  CategoryMetadata,
  CategoryPrediction,
  DomainDiscoveryResult,
  TechnicalSpecResponse,
  type CategoryMetadata as TCategoryMetadata,
  type CategoryPrediction as TCategoryPrediction,
  type DomainDiscoveryResult as TDomainDiscoveryResult,
  type TechnicalSpecResponse as TTechnicalSpecResponse,
} from "./schemas/category";
import type { SiteId } from "./schemas/common";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Category predictor — POST `/sites/{site}/category_predictor/predict`
// ---------------------------------------------------------------------------

export interface PredictCategoryInput {
  title: string;
  /** Optional price (currency-aware predictions). */
  price?: number | undefined;
  /** Optional listing condition. */
  condition?: "new" | "used" | undefined;
}

export async function predictCategory(
  client: MeliClient,
  site: SiteId,
  input: PredictCategoryInput,
): Promise<TCategoryPrediction> {
  return client.fetch<TCategoryPrediction>({
    method: "POST",
    path: `/sites/${site}/category_predictor/predict`,
    body: input,
    responseSchema: CategoryPrediction,
  });
}

// ---------------------------------------------------------------------------
// Domain discovery — `/sites/{site}/domain_discovery/search?q=...`
// (Better than the predictor for narrowing down the canonical domain.)
// ---------------------------------------------------------------------------

const DomainDiscoveryListResponse = z.array(DomainDiscoveryResult);

export async function discoverDomain(
  client: MeliClient,
  site: SiteId,
  query: string,
  options: { limit?: number } = {},
): Promise<TDomainDiscoveryResult[]> {
  return client.fetch<TDomainDiscoveryResult[]>({
    method: "GET",
    path: `/sites/${site}/domain_discovery/search`,
    query: { q: query, limit: options.limit ?? 5 },
    responseSchema: DomainDiscoveryListResponse,
  });
}

// ---------------------------------------------------------------------------
// Technical specs — `/domains/{id}/technical_specs/input`
// Returns required + recommended attributes for a domain.
// ---------------------------------------------------------------------------

export async function getDomainTechnicalSpecs(
  client: MeliClient,
  domainId: string,
): Promise<TTechnicalSpecResponse> {
  return client.fetch<TTechnicalSpecResponse>({
    method: "GET",
    path: `/domains/${encodeURIComponent(domainId)}/technical_specs/input`,
    responseSchema: TechnicalSpecResponse,
  });
}

/**
 * Convenience: classify required attribute ids for a domain. Useful for
 * an agent flow that wants to ensure mandatory fields are filled BEFORE
 * trying to publish.
 */
export async function getRequiredAttributeIds(
  client: MeliClient,
  domainId: string,
): Promise<string[]> {
  const specs = await getDomainTechnicalSpecs(client, domainId);
  const ids: string[] = [];
  for (const group of specs.groups) {
    if (group.id !== "MAIN") continue;
    for (const c of group.components) {
      if (c.required !== false) ids.push(c.id); // required defaults to true
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Category metadata — `/categories/{id}`
// ---------------------------------------------------------------------------

export async function getCategory(
  client: MeliClient,
  categoryId: string,
): Promise<TCategoryMetadata> {
  return client.fetch<TCategoryMetadata>({
    method: "GET",
    path: `/categories/${categoryId}`,
    responseSchema: CategoryMetadata,
  });
}

// ---------------------------------------------------------------------------
// Site categories (root) — `/sites/{site}/categories`
// ---------------------------------------------------------------------------

const SiteCategoriesResponse = z.array(
  z.object({ id: z.string(), name: z.string() }),
);

export async function listSiteCategories(
  client: MeliClient,
  site: SiteId,
): Promise<Array<{ id: string; name: string }>> {
  return client.fetch({
    method: "GET",
    path: `/sites/${site}/categories`,
    responseSchema: SiteCategoriesResponse,
  });
}

// ---------------------------------------------------------------------------
// Composite helper: predict + fetch specs in one call.
// ---------------------------------------------------------------------------

export interface CategorizeAndPlanResult {
  prediction: TCategoryPrediction;
  /** All required attribute ids for the predicted domain. */
  requiredAttributeIds: string[];
  /** Full technical specs (use to render the form / fill via LLM). */
  technicalSpecs: TTechnicalSpecResponse;
}

/**
 * One-shot: take a listing title (+ optional price/condition), predict the
 * category, fetch required attributes, and return everything needed for an
 * agent to publish a complete listing.
 *
 * This is the core of the "agent publishes a listing in 30 seconds" demo.
 */
export async function categorizeAndPlan(
  client: MeliClient,
  site: SiteId,
  input: PredictCategoryInput,
): Promise<CategorizeAndPlanResult> {
  const prediction = await predictCategory(client, site, input);
  if (!prediction.domain_id) {
    return {
      prediction,
      requiredAttributeIds: [],
      technicalSpecs: { groups: [] },
    };
  }
  const technicalSpecs = await getDomainTechnicalSpecs(client, prediction.domain_id);
  const requiredAttributeIds: string[] = [];
  for (const group of technicalSpecs.groups) {
    if (group.id !== "MAIN") continue;
    for (const c of group.components) {
      if (c.required !== false) requiredAttributeIds.push(c.id);
    }
  }
  return { prediction, requiredAttributeIds, technicalSpecs };
}
