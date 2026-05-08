// Mock catalog. 5 demo products. Returned by `CatalogProvider.resolveItem`.
//
// In production, replace with `createMeliCatalogProvider({ getItem })`
// from `@ar-agents/agentic-commerce-bridge` wired against MELI's REST API.

import type { ResolvedItem } from "@ar-agents/agentic-commerce-bridge";

const PRODUCTS: Record<string, ResolvedItem> = {
  yerba_amanda: {
    id: "yerba_amanda",
    name: "Yerba mate Amanda 1kg",
    description: "Yerba mate tradicional argentina, paquete 1kg.",
    unit_amount: 4500_00, // ARS 4,500.00
    currency: "ars",
    available_quantity: 50,
    sku: "AMD-1KG",
    images: ["https://example.invalid/products/yerba.jpg"],
  },
  termos_stanley: {
    id: "termos_stanley",
    name: "Termo Stanley Classic 1.4L",
    description: "Termo Stanley original, color verde, capacidad 1.4 litros.",
    unit_amount: 89000_00,
    currency: "ars",
    available_quantity: 10,
    sku: "STN-1.4-GR",
    images: ["https://example.invalid/products/stanley.jpg"],
  },
  alfajores_havanna: {
    id: "alfajores_havanna",
    name: "Alfajores Havanna mixtos x12",
    description: "Caja de alfajores Havanna, sabores mixtos, 12 unidades.",
    unit_amount: 18500_00,
    currency: "ars",
    available_quantity: 100,
    sku: "HAV-MIX-12",
    images: ["https://example.invalid/products/alfajores.jpg"],
  },
  vino_malbec: {
    id: "vino_malbec",
    name: "Vino Malbec Reserva 750ml",
    description: "Vino Malbec Reserva, bodega mendocina, 750ml.",
    unit_amount: 12000_00,
    currency: "ars",
    available_quantity: 25,
    sku: "MLB-RES-750",
    images: ["https://example.invalid/products/malbec.jpg"],
  },
  bombilla_alpaca: {
    id: "bombilla_alpaca",
    name: "Bombilla de alpaca pico de loro",
    description: "Bombilla de alpaca artesanal, modelo pico de loro.",
    unit_amount: 8500_00,
    currency: "ars",
    available_quantity: 40,
    sku: "BMB-ALP-PL",
    images: ["https://example.invalid/products/bombilla.jpg"],
  },
};

/**
 * `CatalogProvider` factory. Suitable for `createFacilitator({ catalog })`.
 */
export const demoCatalog = {
  async resolveItem(id: string): Promise<ResolvedItem | null> {
    return PRODUCTS[id] ?? null;
  },
};

export const PRODUCT_IDS = Object.keys(PRODUCTS);
export const PRODUCT_LIST = Object.values(PRODUCTS);
