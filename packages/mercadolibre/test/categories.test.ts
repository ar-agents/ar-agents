import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  predictCategory,
  discoverDomain,
  getDomainTechnicalSpecs,
  getRequiredAttributeIds,
  getCategory,
  listSiteCategories,
  categorizeAndPlan,
} from "../src";

const PREDICTION = {
  category_id: "MLA1055",
  category_name: "Celulares y Smartphones",
  domain_id: "CELLPHONES",
  domain_name: "Celulares y Smartphones",
  prediction_probability: 0.91,
};

const TECH_SPECS = {
  groups: [
    {
      id: "MAIN",
      label: "Required",
      components: [
        { id: "BRAND", name: "Marca", required: true, value_type: "string_box" },
        { id: "MODEL", name: "Modelo", required: true, value_type: "string_box" },
      ],
    },
    {
      id: "DELT",
      label: "Recommended",
      components: [
        { id: "COLOR", name: "Color", required: false },
      ],
    },
  ],
};

describe("categories API", () => {
  it("predictCategory hits POST /sites/{site}/category_predictor/predict", async () => {
    const fm = mockFetch()
      .on("POST", "/sites/MLA/category_predictor/predict", (req) => {
        expect((req.body as { title: string }).title).toBe("iPhone 15");
        return { status: 200, body: PREDICTION };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await predictCategory(client, "MLA", { title: "iPhone 15" });
    expect(r.category_id).toBe("MLA1055");
    expect(r.domain_id).toBe("CELLPHONES");
  });

  it("discoverDomain returns ranked candidates", async () => {
    const fm = mockFetch()
      .on("GET", "/sites/MLA/domain_discovery/search", () => ({
        status: 200,
        body: [
          {
            domain_id: "CELLPHONES",
            domain_name: "Celulares y Smartphones",
            category_id: "MLA1055",
            category_name: "Celulares y Smartphones",
          },
        ],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await discoverDomain(client, "MLA", "iPhone");
    expect(r[0]?.domain_id).toBe("CELLPHONES");
  });

  it("getDomainTechnicalSpecs returns groups and components", async () => {
    const fm = mockFetch()
      .onRegex("GET", /\/domains\/[^/]+\/technical_specs\/input/, () => ({
        status: 200,
        body: TECH_SPECS,
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getDomainTechnicalSpecs(client, "CELLPHONES");
    expect(r.groups[0]?.id).toBe("MAIN");
    expect(r.groups[0]?.components).toHaveLength(2);
  });

  it("getRequiredAttributeIds extracts MAIN required ids", async () => {
    const fm = mockFetch()
      .onRegex("GET", /\/domains\/[^/]+\/technical_specs\/input/, () => ({
        status: 200,
        body: TECH_SPECS,
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const ids = await getRequiredAttributeIds(client, "CELLPHONES");
    expect(ids).toEqual(["BRAND", "MODEL"]);
  });

  it("getCategory hits /categories/{id}", async () => {
    const fm = mockFetch()
      .on("GET", "/categories/MLA1055", () => ({
        status: 200,
        body: { id: "MLA1055", name: "Celulares" },
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await getCategory(client, "MLA1055");
    expect(r.name).toBe("Celulares");
  });

  it("listSiteCategories returns site root categories", async () => {
    const fm = mockFetch()
      .on("GET", "/sites/MLA/categories", () => ({
        status: 200,
        body: [{ id: "MLA1055", name: "Celulares" }, { id: "MLA1648", name: "Computación" }],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await listSiteCategories(client, "MLA");
    expect(r).toHaveLength(2);
  });

  it("categorizeAndPlan composes predict + technical_specs in one call", async () => {
    const fm = mockFetch()
      .on("POST", "/sites/MLA/category_predictor/predict", () => ({
        status: 200,
        body: PREDICTION,
      }))
      .onRegex("GET", /\/domains\/[^/]+\/technical_specs\/input/, () => ({
        status: 200,
        body: TECH_SPECS,
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await categorizeAndPlan(client, "MLA", { title: "iPhone 15 256GB" });
    expect(r.prediction.category_id).toBe("MLA1055");
    expect(r.requiredAttributeIds).toEqual(["BRAND", "MODEL"]);
    expect(r.technicalSpecs.groups).toHaveLength(2);
  });
});
