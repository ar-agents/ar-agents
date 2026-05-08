// Hybrid catalog: live MELI when `MELI_ACCESS_TOKEN` is configured, otherwise
// the 5-product demo set so the public bridge-hello deploy stays explorable
// without credentials. Wires `@ar-agents/mercadolibre` (the MELI agent toolkit)
// into `createMeliCatalogProvider` from `@ar-agents/agentic-commerce-bridge`.

import {
  createMeliCatalogProvider,
  type CatalogProvider,
  type MeliItem,
  type ResolvedItem,
} from "@ar-agents/agentic-commerce-bridge";
import { MeliClient, getItem as meliGetItem } from "@ar-agents/mercadolibre";

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
 * Mock catalog (the 5 demo products). Used when no `MELI_ACCESS_TOKEN`
 * is configured.
 */
const mockCatalog: CatalogProvider = {
  async resolveItem(id: string): Promise<ResolvedItem | null> {
    return PRODUCTS[id] ?? null;
  },
};

/**
 * Real MELI-backed catalog, only built when MELI_ACCESS_TOKEN is set. Falls
 * back to the mock catalog for non-`MLA…` ids so the demo storefront keeps
 * working alongside live items.
 */
function buildMeliBackedCatalog(accessToken: string): CatalogProvider {
  const client = new MeliClient({
    auth: { kind: "bearer", accessToken },
  });
  const meliCatalog = createMeliCatalogProvider({
    getItem: async (id: string) => {
      try {
        const item = await meliGetItem(client, id);
        // Cast to the bridge's duck-typed MeliItem. The strict mercadolibre
        // schema is a structural superset (allows null values in optional
        // fields, has `name?: string` on attributes); the bridge tolerates
        // both via `[k: string]: unknown` index access where needed.
        return item as unknown as MeliItem;
      } catch {
        return null;
      }
    },
    acceptedCurrencies: ["ars"],
  });
  return {
    async resolveItem(id: string): Promise<ResolvedItem | null> {
      if (id.startsWith("MLA") || id.startsWith("MLB") || id.startsWith("MLM")) {
        return meliCatalog.resolveItem(id);
      }
      return mockCatalog.resolveItem(id);
    },
  };
}

export const meliCatalogStatus = (() => {
  const token = process.env["MELI_ACCESS_TOKEN"];
  if (token && token.length > 0) {
    return { connected: true as const };
  }
  return { connected: false as const };
})();

export const demoCatalog: CatalogProvider = meliCatalogStatus.connected
  ? buildMeliBackedCatalog(process.env["MELI_ACCESS_TOKEN"]!)
  : mockCatalog;

export const PRODUCT_IDS = Object.keys(PRODUCTS);
export const PRODUCT_LIST = Object.values(PRODUCTS);
