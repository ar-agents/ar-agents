/**
 * OCA adapter — wired to OCA's E-Pak SOAP API.
 *
 * # Background
 *
 * OCA is the second-largest private courier in AR. Its API is **legacy SOAP**
 * (E-Pak), with no JSON / REST option. The official docs PDF is at
 * https://www.oca.com.ar/Solicitudes/wServicios.htm
 *
 * # Status — v0.1
 *
 * v0.1 ships a **HTTP-based stub** for the operations OCA exposes via their
 * "Tarifador" REST endpoint (https://www.oca.com.ar/api/v1/Tarifador/...).
 * For the full SOAP shipment-creation flow (`Ingreso_OR`), use the OCA
 * official PHP/.NET libraries until v0.2 ships a complete TS port.
 *
 * For most agent flows, this is enough: cotizar + listar_sucursales work,
 * crear/trackear/cancelar throw `ShippingNotSupportedError` with a clear
 * message pointing to the OCA dashboard.
 *
 * # Setup
 *
 * 1. Get a `cuit` + `operativa` (operativa code) from OCA's commercial team.
 * 2. Sign up at https://www.oca.com.ar for the API access.
 */

import type {
  Branch,
  CancelResult,
  CreateShipmentInput,
  QuoteInput,
  QuoteOption,
  ShipmentCreated,
  TrackingResult,
} from "./types";
import type { ShippingAdapter } from "./adapter";
import { ShippingCarrierError, ShippingNotSupportedError } from "./errors";
import { shippingFetch } from "./http";

export interface OcaAdapterOptions {
  /** OCA CUIT (your CUIT registered with OCA). */
  cuit: string;
  /** OCA "operativa" code — the contract id assigned by OCA. */
  operativa: string;
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

const OCA_BASE = "https://www.oca.com.ar/api";

export class OcaAdapter implements ShippingAdapter {
  readonly carrier = "oca" as const;
  private readonly baseUrl: string;
  private readonly cuit: string;
  private readonly operativa: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly requestTimeoutMs: number | undefined;
  private readonly maxRetries: number | undefined;
  private readonly onCall: OcaAdapterOptions["onCall"];

  constructor(opts: OcaAdapterOptions) {
    if (!opts.cuit || !opts.operativa) {
      throw new Error("OcaAdapter requires cuit + operativa.");
    }
    this.baseUrl = opts.baseUrl ?? OCA_BASE;
    this.cuit = opts.cuit;
    this.operativa = opts.operativa;
    this.fetchImpl = opts.fetchImpl;
    this.requestTimeoutMs = opts.requestTimeoutMs;
    this.maxRetries = opts.maxRetries;
    this.onCall = opts.onCall;
  }

  async cotizar(input: QuoteInput): Promise<QuoteOption> {
    const totalKg = input.packages.reduce((s, p) => s + p.weightKg, 0);
    const declaredValue = input.packages.reduce(
      (s, p) => s + p.declaredValueArs,
      0,
    );
    const totalVolume = input.packages.reduce(
      (s, p) => s + (p.lengthCm * p.widthCm * p.heightCm) / 1000,
      0,
    );

    const url = new URL(`${this.baseUrl}/v1/Tarifador`);
    url.searchParams.set("PesoTotal", String(totalKg));
    url.searchParams.set("VolumenTotal", String(totalVolume));
    url.searchParams.set("CodigoPostalOrigen", input.origin.postalCode);
    url.searchParams.set(
      "CodigoPostalDestino",
      input.destination.postalCode,
    );
    url.searchParams.set("CantidadPaquetes", String(input.packages.length));
    url.searchParams.set("ValorDeclarado", String(declaredValue));
    url.searchParams.set("Cuit", this.cuit);
    url.searchParams.set("Operativa", this.operativa);

    const res = await this.call("cotizar", url.toString(), { method: "GET" });
    const json = (await res.json()) as {
      Total?: number;
      PrecioFinal?: number;
      PlazoEntrega?: number;
    };
    const cost = json.Total ?? json.PrecioFinal ?? 0;
    const days = json.PlazoEntrega ?? 5;
    return {
      carrier: this.carrier,
      service: input.service ?? "standard",
      costArs: cost,
      estimatedDaysMin: Math.max(1, days - 1),
      estimatedDaysMax: days,
      billedWeightKg: totalKg,
      raw: json,
    };
  }

  async crear(_input: CreateShipmentInput): Promise<ShipmentCreated> {
    throw new ShippingNotSupportedError(
      "oca",
      "crear (requires SOAP Ingreso_OR — use OCA dashboard or v0.2+)",
    );
  }

  async trackear(_trackingNumber: string): Promise<TrackingResult> {
    throw new ShippingNotSupportedError(
      "oca",
      "trackear (requires SOAP — use OCA dashboard or v0.2+)",
    );
  }

  async cancelar(_trackingNumber: string): Promise<CancelResult> {
    throw new ShippingNotSupportedError(
      "oca",
      "cancelar (requires SOAP Anulacion_OR — use OCA dashboard or v0.2+)",
    );
  }

  async listarSucursales(params: {
    postalCode: string;
    limit?: number;
  }): Promise<Branch[]> {
    const url = new URL(`${this.baseUrl}/v1/Sucursales`);
    url.searchParams.set("CodigoPostal", params.postalCode);
    const res = await this.call("listar_sucursales", url.toString(), {
      method: "GET",
    });
    const json = (await res.json()) as Array<{
      idCentroImposicion?: number;
      Sucursal?: string;
      Calle?: string;
      Localidad?: string;
      Provincia?: string;
      CodigoPostal?: string;
      HorarioAtencion?: string;
    }>;
    return (json ?? []).slice(0, params.limit ?? 20).map((s, i) => ({
      carrier: this.carrier,
      id: String(s.idCentroImposicion ?? i),
      name: s.Sucursal ?? "Sucursal OCA",
      address: s.Calle ?? "",
      city: s.Localidad ?? "",
      state: s.Provincia ?? "",
      postalCode: s.CodigoPostal ?? params.postalCode,
      ...(s.HorarioAtencion !== undefined ? { openingHours: s.HorarioAtencion } : {}),
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
      carrier: "oca",
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
        "oca",
        `HTTP ${res.status} on ${op}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    return res;
  }
}
