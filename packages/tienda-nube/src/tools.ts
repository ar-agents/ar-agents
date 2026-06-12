/**
 * Drop-in tool collection for Vercel AI SDK 6+.
 *
 * v0.1 is read-heavy: list/get on products, orders, customers, store,
 * plus webhook CRUD so an agent can install / clean up listeners on
 * behalf of a merchant. Write operations on products and orders ship
 * in v0.2 once we settle the typing for the variant-rich Tienda Nube
 * product schema.
 */
import { tool } from "ai";
import { z } from "zod";
import type { TiendaNubeAdapter } from "./adapter";
import { UnconfiguredTiendaNubeAdapter } from "./adapter";

const tnIdSchema = z.number().int().positive();

export interface TiendaNubeToolsOptions {
  adapter?: TiendaNubeAdapter;
  include?: ReadonlyArray<TiendaNubeToolName>;
}

export const ALL_TOOL_NAMES = [
  "tienda_nube_get_store",
  "tienda_nube_list_products",
  "tienda_nube_get_product",
  "tienda_nube_list_orders",
  "tienda_nube_get_order",
  "tienda_nube_list_customers",
  "tienda_nube_get_customer",
  "tienda_nube_list_webhooks",
  "tienda_nube_create_webhook",
  "tienda_nube_delete_webhook",
] as const;

export type TiendaNubeToolName = (typeof ALL_TOOL_NAMES)[number];

export function tiendaNubeTools(opts: TiendaNubeToolsOptions = {}) {
  const adapter = opts.adapter ?? new UnconfiguredTiendaNubeAdapter();
  const wanted = new Set<TiendaNubeToolName>(opts.include ?? ALL_TOOL_NAMES);

  const allTools = {
    tienda_nube_get_store: tool({
      description:
        "Get info about the Tienda Nube store (datos de la tienda) this adapter is bound to (denominación, currency, country, language, contact email).",
      inputSchema: z.object({}).strict(),
      execute: async () => adapter.getStore(),
    }),

    tienda_nube_list_products: tool({
      description:
        "List Tienda Nube products (listar productos de la tienda) with optional substring search + paginated results. Use `publishedOnly: true` to skip drafts. Returns `hasMore: true` when at least one more page exists.",
      inputSchema: z.object({
        q: z.string().optional(),
        publishedOnly: z.boolean().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(200).optional(),
      }),
      execute: async (input) => adapter.listProducts(input),
    }),

    tienda_nube_get_product: tool({
      description: "Get a Tienda Nube product by id (consultar un producto), including all variants.",
      inputSchema: z.object({ id: tnIdSchema }),
      execute: async ({ id }) => adapter.getProduct(id),
    }),

    tienda_nube_list_orders: tool({
      description:
        "List Tienda Nube orders (listar ventas, órdenes de la tienda) with status / payment_status / email filters + ISO 8601 date ranges. Reverse-chronological. The `paymentStatus: \"paid\"` filter is the typical AR e-commerce inbox.",
      inputSchema: z.object({
        sinceIso: z.string().optional(),
        untilIso: z.string().optional(),
        status: z.enum(["open", "closed", "cancelled"]).optional(),
        paymentStatus: z
          .enum(["pending", "authorized", "paid", "voided", "refunded", "abandoned"])
          .optional(),
        email: z.string().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(200).optional(),
      }),
      execute: async (input) => adapter.listOrders(input),
    }),

    tienda_nube_get_order: tool({
      description:
        "Get a Tienda Nube order by id (consultar una orden). Includes contact email + name + addresses + per-line products.",
      inputSchema: z.object({ id: tnIdSchema }),
      execute: async ({ id }) => adapter.getOrder(id),
    }),

    tienda_nube_list_customers: tool({
      description: "List Tienda Nube customers (listar clientes) with optional substring search across name + email.",
      inputSchema: z.object({
        q: z.string().optional(),
        page: z.number().int().min(1).optional(),
        perPage: z.number().int().min(1).max(200).optional(),
      }),
      execute: async (input) => adapter.listCustomers(input),
    }),

    tienda_nube_get_customer: tool({
      description: "Get a Tienda Nube customer by id (consultar un cliente), including default_address + total_spent.",
      inputSchema: z.object({ id: tnIdSchema }),
      execute: async ({ id }) => adapter.getCustomer(id),
    }),

    tienda_nube_list_webhooks: tool({
      description: "List webhook subscriptions registered by this app for this store.",
      inputSchema: z.object({}).strict(),
      execute: async () => adapter.listWebhooks(),
    }),

    tienda_nube_create_webhook: tool({
      description:
        "Register a webhook subscription. URL must be https://. Common events: order/created, order/paid, order/fulfilled, product/updated, customer/created, app/uninstalled.",
      inputSchema: z.object({
        event: z.string().min(1),
        url: z.string().url(),
      }),
      execute: async ({ event, url }) => adapter.createWebhook({ event, url }),
    }),

    tienda_nube_delete_webhook: tool({
      description:
        "Delete a webhook subscription by id. Idempotent: deleting an unknown id resolves without raising.",
      inputSchema: z.object({ id: tnIdSchema }),
      execute: async ({ id }) => {
        await adapter.deleteWebhook(id);
        return { ok: true, id };
      },
    }),
  } as const;

  const out: Record<string, (typeof allTools)[TiendaNubeToolName]> = {};
  for (const name of ALL_TOOL_NAMES) {
    if (wanted.has(name)) out[name] = allTools[name];
  }
  return out as Pick<typeof allTools, TiendaNubeToolName>;
}
