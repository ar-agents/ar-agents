/**
 * Correo Argentino adapter — wired to Correo's public REST endpoints.
 *
 * # Background
 *
 * Correo Argentino is the state-owned national postal service, the only
 * carrier that reaches every CPA in the country (including remote areas
 * private couriers won't service). Has a "Mi Correo Empresas" portal at
 * https://www.correoargentino.com.ar/empresas with a basic REST API.
 *
 * # Status — v0.1
 *
 * v0.1 implements `cotizar` (their public Tarifador endpoint) and
 * `trackear` (the public seguimiento endpoint that doesn't need auth).
 * Shipment creation and cancellation require a corporate contract +
 * the SAU portal — those throw `ShippingNotSupportedError` for v0.1.
 *
 * # Setup
 *
 * For v0.1 (cotizar + trackear): no setup required, both endpoints are
 * public. For shipment creation: contact the Correo Argentino Empresas
 * commercial team to get a corporate contract + portal credentials.
 */

import type {
  Branch,
  CancelResult,
  CreateShipmentInput,
  QuoteInput,
  QuoteOption,
  ShipmentCreated,
  TrackingResult,
  TrackingStatus,
} from "./types";
import type { ShippingAdapter } from "./adapter";
import { ShippingCarrierError, ShippingNotSupportedError } from "./errors";
import { shippingFetch } from "./http";

export interface CorreoAdapterOptions {
  /** Override base URL (testing). */
  baseUrl?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx + transient errors. Default 1. */
  maxRetries?: number;
  /** Observability hook. */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

const CORREO_BASE = "https://api.correoargentino.com.ar";

export class CorreoAdapter implements ShippingAdapter {
  readonly carrier = "correo_argentino" as const;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly requestTimeoutMs: number | undefined;
  private readonly maxRetries: number | undefined;
  private readonly onCall: CorreoAdapterOptions["onCall"];

  constructor(opts: CorreoAdapterOptions = {}) {
    this.baseUrl = opts.baseUrl ?? CORREO_BASE;
    this.fetchImpl = opts.fetchImpl;
    this.requestTimeoutMs = opts.requestTimeoutMs;
    this.maxRetries = opts.maxRetries;
    this.onCall = opts.onCall;
  }

  async cotizar(input: QuoteInput): Promise<QuoteOption> {
    const totalKg = input.packages.reduce((s, p) => s + p.weightKg, 0);
    const url = new URL(`${this.baseUrl}/v1/tarifador/cotizar`);
    url.searchParams.set("cpOrigen", input.origin.postalCode);
    url.searchParams.set("cpDestino", input.destination.postalCode);
    url.searchParams.set("peso", String(totalKg));
    url.searchParams.set(
      "servicio",
      input.service === "express" ? "expreso" : "estandar",
    );

    const res = await this.call("cotizar", url.toString(), { method: "GET" });
    const json = (await res.json()) as {
      precio?: number;
      total?: number;
      plazoEntrega?: number;
    };
    const cost = json.precio ?? json.total ?? 0;
    const days = json.plazoEntrega ?? (input.service === "express" ? 3 : 7);
    return {
      carrier: this.carrier,
      service: input.service ?? "standard",
      costArs: cost,
      estimatedDaysMin: Math.max(1, days - 2),
      estimatedDaysMax: days,
      billedWeightKg: totalKg,
      raw: json,
    };
  }

  async crear(_input: CreateShipmentInput): Promise<ShipmentCreated> {
    throw new ShippingNotSupportedError(
      "correo_argentino",
      "crear (requires corporate contract via Mi Correo Empresas)",
    );
  }

  async trackear(trackingNumber: string): Promise<TrackingResult> {
    const url = `${this.baseUrl}/v1/seguimiento/${encodeURIComponent(trackingNumber)}`;
    const res = await this.call("trackear", url, { method: "GET" });
    const json = (await res.json()) as {
      eventos?: Array<{
        fecha?: string;
        estado?: string;
        descripcion?: string;
        ubicacion?: string;
      }>;
    };
    const events = (json.eventos ?? []).map((e) => ({
      timestamp: e.fecha ?? "",
      status: mapCorreoStatus(e.estado ?? ""),
      description: e.descripcion ?? e.estado ?? "",
      location: e.ubicacion ?? "",
    }));
    const currentStatus =
      events.length > 0
        ? events[events.length - 1]!.status
        : ("unknown" as TrackingStatus);
    const result: TrackingResult = {
      carrier: this.carrier,
      trackingNumber,
      currentStatus,
      events,
      raw: json,
    };
    if (currentStatus === "delivered") {
      result.deliveredAt = events[events.length - 1]!.timestamp;
    }
    return result;
  }

  async cancelar(_trackingNumber: string): Promise<CancelResult> {
    throw new ShippingNotSupportedError(
      "correo_argentino",
      "cancelar (requires corporate contract via Mi Correo Empresas)",
    );
  }

  async listarSucursales(params: {
    postalCode: string;
    limit?: number;
  }): Promise<Branch[]> {
    const url = new URL(`${this.baseUrl}/v1/sucursales`);
    url.searchParams.set("cp", params.postalCode);
    const res = await this.call("listar_sucursales", url.toString(), {
      method: "GET",
    });
    const json = (await res.json()) as Array<{
      id?: string;
      nombre?: string;
      direccion?: string;
      localidad?: string;
      provincia?: string;
      cp?: string;
      horarios?: string;
    }>;
    return (json ?? []).slice(0, params.limit ?? 20).map((s, i) => ({
      carrier: this.carrier,
      id: s.id ?? `correo-${i}`,
      name: s.nombre ?? "Sucursal Correo",
      address: s.direccion ?? "",
      city: s.localidad ?? "",
      state: s.provincia ?? "",
      postalCode: s.cp ?? params.postalCode,
      ...(s.horarios !== undefined ? { openingHours: s.horarios } : {}),
    }));
  }

  private async call(
    op: string,
    url: string,
    init: RequestInit,
  ): Promise<Response> {
    const params: Parameters<typeof shippingFetch>[0] = {
      url,
      init: {
        ...init,
        headers: { Accept: "application/json", ...((init.headers as Record<string, string>) ?? {}) },
      },
      carrier: "correo_argentino",
      operation: op,
      ...(this.fetchImpl !== undefined ? { fetchImpl: this.fetchImpl } : {}),
      ...(this.requestTimeoutMs !== undefined
        ? { requestTimeoutMs: this.requestTimeoutMs }
        : {}),
      ...(this.maxRetries !== undefined ? { maxRetries: this.maxRetries } : {}),
      ...(this.onCall !== undefined ? { onCall: this.onCall } : {}),
    };
    const res = await shippingFetch(params);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ShippingCarrierError(
        "correo_argentino",
        `HTTP ${res.status} on ${op}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    return res;
  }
}

function mapCorreoStatus(estado: string): TrackingStatus {
  const e = estado
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (e.includes("entregado")) return "delivered";
  if (e.includes("reparto") || e.includes("ruta")) return "out_for_delivery";
  if (e.includes("transit") || e.includes("clasif")) return "in_transit";
  if (e.includes("ausente")) return "delivery_failed";
  if (e.includes("devuel")) return "returned";
  if (e.includes("admitido") || e.includes("ingresado")) return "label_created";
  return "unknown";
}
