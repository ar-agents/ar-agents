import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { UnconfiguredShippingAdapter, type ShippingAdapter } from "./adapter";
import { isValidCPA, lookupProvincia } from "./provincias";
import type { Address, Carrier, PackageInfo, ServiceLevel } from "./types";

export interface ShippingToolsOptions {
  /**
   * Shipping adapters keyed by carrier. Pass at least one. When a tool is
   * called and the requested carrier isn't configured, it returns
   * `{ available: false, error }` instead of crashing.
   *
   * @example
   * ```ts
   * shippingTools({
   *   adapters: {
   *     andreani: new AndreaniAdapter({ ... }),
   *     correo_argentino: new CorreoAdapter(),
   *   },
   *   defaultCarrier: "andreani",
   * });
   * ```
   */
  adapters?: Partial<Record<Carrier, ShippingAdapter>>;
  /**
   * Default carrier when the agent doesn't specify one. Saves the agent
   * from having to remember which carriers are wired.
   */
  defaultCarrier?: Carrier;
  /**
   * Override the agent-facing tool descriptions.
   */
  descriptions?: Partial<Record<ShippingToolName, string>>;
}

export type ShippingToolName =
  | "cotizar_envio"
  | "cotizar_envio_todos"
  | "crear_envio"
  | "trackear_envio"
  | "cancelar_envio"
  | "listar_sucursales";

const DEFAULT_DESCRIPTIONS: Record<ShippingToolName, string> = {
  cotizar_envio:
    "Quote the shipping cost with one carrier (cotizar un envío) (Andreani, OCA, o Correo Argentino). Pasá origen + destino + paquetes (peso + dimensiones + valor declarado) y servicio (standard, express, same_day). Returns { carrier, costArs, estimatedDaysMin, estimatedDaysMax, productId }. USE WHEN el usuario quiere el precio de UN carrier conocido. Para comparar entre carriers, usá cotizar_envio_todos.",

  cotizar_envio_todos:
    "Compare shipping quotes across ALL configured carriers in parallel (cotizar envío en todos los carriers). Returns { quotes: QuoteOption[] } ordenado por costo (más barato primero). USE WHEN el usuario dice 'cuál es el envío más barato' o 'compará Andreani vs OCA vs Correo'. Si un carrier falla individualmente, los otros igual responden, el campo error en cada quote indica si falló.",

  crear_envio:
    "Create a real shipment and get a tracking number + label (crear un envío). RETURNS un trackingNumber + labelUrl + costo. SIDE EFFECT: el envío queda registrado en el sistema del carrier, confirma con el usuario antes si el monto es alto (>$10k declared value). Para Andreani, requiere productId del cotizador previo si querés bloquear el precio. Usá `externalReference` para reconciliar con tu order id.",

  trackear_envio:
    "Track a shipment by tracking number (trackear un envío, dónde está mi paquete). Returns { currentStatus, events[], deliveredAt? }. currentStatus normalizado a uno de: label_created, in_transit, out_for_delivery, delivered, delivery_failed, returned, canceled, exception, unknown. SURFACE los `events` al usuario en orden cronológico, muestran el detalle del recorrido.",

  cancelar_envio:
    "Cancel a shipment that has not gone out for delivery (cancelar un envío). Returns { canceled: bool, reason? }. Si canceled=false, surface reason verbatim al usuario (típicamente 'ya está en reparto' o 'el carrier no soporta cancelación post-pickup'). Para envíos ya entregados, NO se puede cancelar, el usuario tiene que coordinar una devolución manual.",

  listar_sucursales:
    "List carrier branch offices near a postal code (listar sucursales de un carrier) cerca de un Código Postal Argentino (CPA). Returns array con id, name, address, openingHours, distanceKm cuando disponible. USE WHEN el usuario quiere despachar el envío en sucursal en lugar de retiro a domicilio, o cuando necesita un punto Pickup para que el destinatario retire.",
};

export function shippingTools(options: ShippingToolsOptions = {}): ToolSet {
  const desc = (name: ShippingToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];
  const adapters = options.adapters ?? {};

  const getAdapter = (carrier: Carrier): ShippingAdapter | null => {
    const a = adapters[carrier];
    if (a) return a;
    return null;
  };

  const requireAdapter = (
    carrier: Carrier | undefined,
  ): ShippingAdapter | { _notConfigured: true; carrier: Carrier } => {
    const c = carrier ?? options.defaultCarrier;
    if (!c) {
      return { _notConfigured: true, carrier: "andreani" as Carrier };
    }
    const a = getAdapter(c);
    if (!a) return { _notConfigured: true, carrier: c };
    return a;
  };

  const notConfiguredResult = (carrier: Carrier) => ({
    available: false,
    error: `Carrier '${carrier}' no está configurado. Pasá un adapter a shippingTools({ adapters: { ${carrier}: new ${
      carrier === "andreani"
        ? "AndreaniAdapter"
        : carrier === "oca"
          ? "OcaAdapter"
          : "CorreoAdapter"
    }({ ... }) } }).`,
    data: null,
  });

  const validateAddress = (addr: Address, label: string): string | null => {
    if (!isValidCPA(addr.postalCode)) {
      return `${label}.postalCode '${addr.postalCode}' no es un CPA válido (debe ser 4 dígitos o extendido B1842ZAB).`;
    }
    if (!lookupProvincia(addr.state)) {
      return `${label}.state '${addr.state}' no es una provincia AR válida.`;
    }
    return null;
  };

  const addressSchema = z.object({
    name: z.string().min(1).max(120).describe("Recipient or sender full name. Required."),
    company: z.string().max(120).optional().describe("Company name if delivering to a business."),
    street: z.string().min(1).max(200).describe("Street name."),
    number: z.string().min(1).max(20).describe("Street number (string, supports 's/n', '1234A', etc.)."),
    unit: z.string().max(40).optional().describe("Apt/floor (e.g. '4°B', 'PB')."),
    city: z.string().min(1).max(120).describe("City / locality."),
    state: z
      .string()
      .min(1)
      .max(40)
      .describe("AR provincia. Accepts 'Buenos Aires', 'CABA', single-letter codes ('B', 'C'), etc. Validated against the official enum at runtime."),
    postalCode: z
      .string()
      .min(4)
      .max(8)
      .describe("AR postal code (CPA). 4 digits ('1842') or extended ('B1842ZAB'). Validated at runtime."),
    country: z.string().max(40).optional().describe("Default 'AR'. Required for international."),
    phone: z.string().max(40).optional().describe("Contact phone for delivery coordination."),
    email: z.string().email().optional(),
    notes: z.string().max(500).optional(),
  });

  const packageSchema = z.object({
    weightKg: z.number().positive(),
    lengthCm: z.number().positive(),
    widthCm: z.number().positive(),
    heightCm: z.number().positive(),
    declaredValueArs: z.number().nonnegative(),
    description: z.string().optional(),
    fragile: z.boolean().optional(),
  });

  const carrierSchema = z
    .enum(["andreani", "oca", "correo_argentino"])
    .optional();
  const serviceSchema = z
    .enum(["standard", "express", "same_day"])
    .optional();

  return {
    cotizar_envio: tool({
      description: desc("cotizar_envio"),
      inputSchema: z.object({
        carrier: carrierSchema,
        origin: addressSchema,
        destination: addressSchema,
        packages: z.array(packageSchema).min(1),
        service: serviceSchema,
      }),
      execute: async (input) => {
        const adapter = requireAdapter(input.carrier as Carrier);
        if ("_notConfigured" in adapter) return notConfiguredResult(adapter.carrier);
        const originErr = validateAddress(input.origin as Address, "origin");
        if (originErr) return { available: true, ok: false, error: originErr };
        const destErr = validateAddress(input.destination as Address, "destination");
        if (destErr) return { available: true, ok: false, error: destErr };
        try {
          const quote = await adapter.cotizar({
            origin: input.origin as Address,
            destination: input.destination as Address,
            packages: input.packages as PackageInfo[],
            ...(input.service !== undefined ? { service: input.service as ServiceLevel } : {}),
          });
          return { available: true, ok: true, ...quote };
        } catch (err) {
          return {
            available: true,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    cotizar_envio_todos: tool({
      description: desc("cotizar_envio_todos"),
      inputSchema: z.object({
        origin: addressSchema,
        destination: addressSchema,
        packages: z.array(packageSchema).min(1),
        service: serviceSchema,
      }),
      execute: async (input) => {
        const originErr = validateAddress(input.origin as Address, "origin");
        if (originErr) return { available: true, ok: false, error: originErr };
        const destErr = validateAddress(input.destination as Address, "destination");
        if (destErr) return { available: true, ok: false, error: destErr };
        const carriers = Object.keys(adapters) as Carrier[];
        if (carriers.length === 0) {
          return {
            available: false,
            error: "No hay carriers configurados. Pasá al menos uno a shippingTools({ adapters: ... }).",
            quotes: [],
          };
        }
        const results = await Promise.all(
          carriers.map(async (c) => {
            try {
              const q = await adapters[c]!.cotizar({
                origin: input.origin as Address,
                destination: input.destination as Address,
                packages: input.packages as PackageInfo[],
                ...(input.service !== undefined ? { service: input.service as ServiceLevel } : {}),
              });
              return { carrier: c, ok: true as const, quote: q };
            } catch (err) {
              return {
                carrier: c,
                ok: false as const,
                error: err instanceof Error ? err.message : String(err),
              };
            }
          }),
        );
        const quotes = results
          .filter((r) => r.ok)
          .map((r) => (r as { ok: true; quote: import("./types").QuoteOption }).quote)
          .sort((a, b) => a.costArs - b.costArs);
        const errors = results
          .filter((r) => !r.ok)
          .map((r) => ({
            carrier: r.carrier,
            error: (r as { ok: false; error: string }).error,
          }));
        return {
          available: true,
          ok: quotes.length > 0,
          quotes,
          errors,
          cheapest: quotes[0] ?? null,
        };
      },
    }),

    crear_envio: tool({
      description: desc("crear_envio"),
      inputSchema: z.object({
        carrier: carrierSchema,
        origin: addressSchema,
        destination: addressSchema,
        packages: z.array(packageSchema).min(1),
        service: serviceSchema,
        external_reference: z.string().optional(),
        product_id: z.string().optional(),
      }),
      execute: async (input) => {
        const adapter = requireAdapter(input.carrier as Carrier);
        if ("_notConfigured" in adapter) return notConfiguredResult(adapter.carrier);
        try {
          const created = await adapter.crear({
            origin: input.origin as Address,
            destination: input.destination as Address,
            packages: input.packages as PackageInfo[],
            ...(input.service !== undefined ? { service: input.service as ServiceLevel } : {}),
            ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
            ...(input.product_id !== undefined ? { productId: input.product_id } : {}),
          });
          return { available: true, ok: true, ...created };
        } catch (err) {
          return {
            available: true,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    trackear_envio: tool({
      description: desc("trackear_envio"),
      inputSchema: z.object({
        carrier: carrierSchema,
        tracking_number: z.string().min(1).max(40).describe("Tracking number from crear_envio."),
      }),
      execute: async ({ carrier, tracking_number }) => {
        const adapter = requireAdapter(carrier as Carrier);
        if ("_notConfigured" in adapter) return notConfiguredResult(adapter.carrier);
        try {
          const r = await adapter.trackear(tracking_number);
          return { available: true, ok: true, ...r };
        } catch (err) {
          return {
            available: true,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    cancelar_envio: tool({
      description: desc("cancelar_envio"),
      inputSchema: z.object({
        carrier: carrierSchema,
        tracking_number: z.string().min(1).max(40).describe("Tracking number from crear_envio."),
      }),
      execute: async ({ carrier, tracking_number }) => {
        const adapter = requireAdapter(carrier as Carrier);
        if ("_notConfigured" in adapter) return notConfiguredResult(adapter.carrier);
        try {
          const r = await adapter.cancelar(tracking_number);
          return { available: true, ok: r.canceled, ...r };
        } catch (err) {
          return {
            available: true,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),

    listar_sucursales: tool({
      description: desc("listar_sucursales"),
      inputSchema: z.object({
        carrier: carrierSchema,
        postal_code: z
          .string()
          .min(4)
          .max(8)
          .describe("AR CPA, 4 digits or extended ('B1842ZAB')."),
        limit: z.number().int().min(1).max(50).optional(),
      }),
      execute: async ({ carrier, postal_code, limit }) => {
        if (!isValidCPA(postal_code)) {
          return {
            available: true,
            ok: false,
            error: `postal_code '${postal_code}' no es un CPA válido.`,
          };
        }
        const adapter = requireAdapter(carrier as Carrier);
        if ("_notConfigured" in adapter) return notConfiguredResult(adapter.carrier);
        try {
          const branches = await adapter.listarSucursales({
            postalCode: postal_code,
            ...(limit !== undefined ? { limit } : {}),
          });
          return { available: true, ok: true, branches };
        } catch (err) {
          return {
            available: true,
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      },
    }),
  } satisfies ToolSet;
}

// Convenience for tests / one-off usage when no adapter is wired.
export function unconfiguredShippingTools(): ToolSet {
  return shippingTools({
    adapters: {
      andreani: new UnconfiguredShippingAdapter("andreani"),
    },
    defaultCarrier: "andreani",
  });
}
