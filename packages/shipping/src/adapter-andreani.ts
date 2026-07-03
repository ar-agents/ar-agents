/**
 * Andreani adapter — wired to Andreani's REST API.
 *
 * # Background
 *
 * Andreani is the largest private logistics carrier in AR (~50% of B2C
 * e-commerce shipping share). Has a modern REST API at
 * https://developers.andreani.com/.
 *
 * # Setup
 *
 * 1. Register at https://developers.andreani.com/
 * 2. Get `clientId` (= `username`) + `clientSecret` (= `password`) for the
 *    sandbox / production environment.
 * 3. Get your `numeroCliente` from the Andreani commercial team.
 * 4. Wire the adapter:
 *    ```ts
 *    const andreani = new AndreaniAdapter({
 *      username: process.env.ANDREANI_USERNAME!,
 *      password: process.env.ANDREANI_PASSWORD!,
 *      clientNumber: process.env.ANDREANI_CLIENT_NUMBER!,
 *      env: "prod",
 *    });
 *    ```
 *
 * # Auth
 *
 * Andreani uses Basic Auth on every request (no token exchange needed). The
 * adapter constructs the header automatically.
 *
 * # Service mapping
 *
 * - `standard` → "Estándar" (productId varies by client; default we use a
 *   common code, override via `productIdMap` if your contract differs)
 * - `express` → "Urgente"
 * - `same_day` → not generally available; the adapter throws.
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
import { lookupProvincia } from "./provincias";

export interface AndreaniAdapterOptions {
  /** Andreani API username. From dev panel. */
  username: string;
  /** Andreani API password. From dev panel. */
  password: string;
  /**
   * Andreani's `numero de cliente` — assigned by their commercial team.
   * Required for `crear` (shipment creation).
   */
  clientNumber: string;
  /** "homo" for sandbox, "prod" for live. Default "prod". */
  env?: "homo" | "prod";
  /**
   * Optional override of the productId map. Defaults: standard=140,
   * express=140Pickup. Override if your Andreani contract uses different
   * product codes.
   */
  productIdMap?: Partial<Record<"standard" | "express", string>>;
  /** Override base URL (testing). */
  baseUrl?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /** Per-request timeout in ms. Default 30s. */
  requestTimeoutMs?: number;
  /** Retries on 5xx + transient errors. Default 1. */
  maxRetries?: number;
  /** Observability hook fired after every request. */
  onCall?: (event: {
    label: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}

const ANDREANI_URLS = {
  homo: "https://apisqa.andreani.com",
  prod: "https://api.andreani.com",
} as const;

const DEFAULT_PRODUCT_MAP = {
  standard: "140",
  express: "140Pickup",
} as const;

export class AndreaniAdapter implements ShippingAdapter {
  readonly carrier = "andreani" as const;
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly productMap: Record<string, string>;
  private readonly clientNumber: string;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly requestTimeoutMs: number | undefined;
  private readonly maxRetries: number | undefined;
  private readonly onCall: AndreaniAdapterOptions["onCall"];

  constructor(opts: AndreaniAdapterOptions) {
    if (!opts.username || !opts.password) {
      throw new Error("AndreaniAdapter requires username + password.");
    }
    if (!opts.clientNumber) {
      throw new Error("AndreaniAdapter requires clientNumber.");
    }
    this.baseUrl = opts.baseUrl ?? ANDREANI_URLS[opts.env ?? "prod"];
    this.authHeader =
      "Basic " +
      Buffer.from(`${opts.username}:${opts.password}`).toString("base64");
    this.productMap = { ...DEFAULT_PRODUCT_MAP, ...(opts.productIdMap ?? {}) };
    this.clientNumber = opts.clientNumber;
    this.fetchImpl = opts.fetchImpl;
    this.requestTimeoutMs = opts.requestTimeoutMs;
    this.maxRetries = opts.maxRetries;
    this.onCall = opts.onCall;
  }

  async cotizar(input: QuoteInput): Promise<QuoteOption> {
    const service = input.service ?? "standard";
    if (service === "same_day") {
      throw new ShippingNotSupportedError("andreani", "service=same_day");
    }
    const productId = this.productMap[service];
    if (!productId) {
      throw new ShippingNotSupportedError("andreani", `service=${service}`);
    }

    const totalKg = input.packages.reduce((s, p) => s + p.weightKg, 0);
    const declaredValue = input.packages.reduce(
      (s, p) => s + p.declaredValueArs,
      0,
    );

    const url = new URL(`${this.baseUrl}/v2/tarifas`);
    url.searchParams.set("cpDestino", input.destination.postalCode);
    url.searchParams.set("cpOrigen", input.origin.postalCode);
    url.searchParams.set("contrato", productId);
    url.searchParams.set("cliente", this.clientNumber);
    url.searchParams.set("bultos[0][kilos]", String(totalKg));
    url.searchParams.set(
      "bultos[0][largoCm]",
      String(Math.max(...input.packages.map((p) => p.lengthCm))),
    );
    url.searchParams.set(
      "bultos[0][anchoCm]",
      String(Math.max(...input.packages.map((p) => p.widthCm))),
    );
    url.searchParams.set(
      "bultos[0][altoCm]",
      String(Math.max(...input.packages.map((p) => p.heightCm))),
    );
    url.searchParams.set("bultos[0][valorDeclarado]", String(declaredValue));

    const res = await this.call("cotizar", url.toString(), { method: "GET" });
    const json = (await res.json()) as {
      tarifaConIva?: { total: number };
      tarifaSinIva?: { total: number };
      plazoEntrega?: number;
    };
    if (!json.tarifaConIva && !json.tarifaSinIva) {
      throw new ShippingCarrierError(
        "andreani",
        "tarifas response missing tarifaConIva",
        res.status,
        undefined,
        json,
      );
    }
    const cost =
      json.tarifaConIva?.total ?? json.tarifaSinIva?.total ?? 0;
    const days = json.plazoEntrega ?? (service === "express" ? 2 : 5);
    return {
      carrier: this.carrier,
      service,
      costArs: cost,
      estimatedDaysMin: Math.max(1, days - 1),
      estimatedDaysMax: days,
      productId,
      billedWeightKg: totalKg,
      raw: json,
    };
  }

  async crear(input: CreateShipmentInput): Promise<ShipmentCreated> {
    const service = input.service ?? "standard";
    const productId =
      input.productId ??
      this.productMap[service as "standard" | "express"];
    if (!productId) {
      throw new ShippingNotSupportedError("andreani", `service=${service}`);
    }

    const body = {
      contrato: productId,
      origen: this.toAndreaniAddress(input.origin),
      destino: this.toAndreaniAddress(input.destination),
      remitente: {
        nombreCompleto: input.origin.name,
        email: input.origin.email,
        telefonos: input.origin.phone ? [{ tipo: 1, numero: input.origin.phone }] : [],
      },
      destinatario: [
        {
          nombreCompleto: input.destination.name,
          email: input.destination.email,
          documentoTipo: "DNI",
          documentoNumero: "",
          telefonos: input.destination.phone
            ? [{ tipo: 1, numero: input.destination.phone }]
            : [],
        },
      ],
      bultos: input.packages.map((p) => ({
        kilos: p.weightKg,
        largoCm: p.lengthCm,
        anchoCm: p.widthCm,
        altoCm: p.heightCm,
        volumenCm: p.lengthCm * p.widthCm * p.heightCm,
        valorDeclaradoConImpuestos: p.declaredValueArs,
        referencias: input.externalReference
          ? [{ meta: "referencia", contenido: input.externalReference }]
          : [],
      })),
    };

    const res = await this.call(
      "crear",
      `${this.baseUrl}/v2/ordenes-de-envio`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
      false, // non-idempotent — never retry a shipment creation
    );
    const json = (await res.json()) as {
      numeroAndreani?: string;
      idEnvio?: string;
      label?: string;
      etiqueta?: string;
      tarifaConIva?: { total: number };
      fechaEntregaEstimada?: string;
    };
    const trackingNumber = json.numeroAndreani ?? json.idEnvio;
    if (!trackingNumber) {
      throw new ShippingCarrierError(
        "andreani",
        "create response missing numeroAndreani",
        res.status,
        undefined,
        json,
      );
    }
    if (json.tarifaConIva?.total === undefined) {
      // Fail loud rather than fabricate costArs:0 — a 0 cost silently corrupts
      // downstream accounting / reconciliation.
      throw new ShippingCarrierError(
        "andreani",
        "create response missing tarifaConIva",
        res.status,
        undefined,
        json,
      );
    }
    const result: ShipmentCreated = {
      carrier: this.carrier,
      trackingNumber,
      shipmentId: json.idEnvio ?? trackingNumber,
      costArs: json.tarifaConIva.total,
      raw: json,
    };
    if (json.label || json.etiqueta) {
      result.labelUrl = json.label ?? json.etiqueta!;
    }
    if (json.fechaEntregaEstimada) {
      result.estimatedDeliveryDate = json.fechaEntregaEstimada;
    }
    if (input.externalReference) {
      result.externalReference = input.externalReference;
    }
    return result;
  }

  async trackear(trackingNumber: string): Promise<TrackingResult> {
    const res = await this.call(
      "trackear",
      `${this.baseUrl}/v1/envios/${encodeURIComponent(trackingNumber)}/trazas`,
      { method: "GET" },
    );
    const json = (await res.json()) as {
      eventos?: Array<{
        fecha?: string;
        estado?: string;
        traduccion?: string;
        descripcion?: string;
        sucursal?: { descripcion?: string };
      }>;
    };
    const events = (json.eventos ?? []).map((e) => ({
      timestamp: e.fecha ?? "",
      status: mapAndreaniStatus(e.estado ?? ""),
      description: e.traduccion ?? e.descripcion ?? e.estado ?? "",
      location: e.sucursal?.descripcion ?? "",
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

  async cancelar(trackingNumber: string): Promise<CancelResult> {
    const res = await this.call(
      "cancelar",
      `${this.baseUrl}/v2/ordenes-de-envio/${encodeURIComponent(trackingNumber)}/cancelar`,
      { method: "POST" },
      false, // non-idempotent — never retry a cancellation
    );
    const json = (await res.json().catch(() => ({}))) as {
      cancelado?: boolean;
      motivo?: string;
    };
    if (typeof json.cancelado !== "boolean") {
      // Fail loud rather than fabricate canceled:true from a bare 2xx — a false
      // positive here tells the caller a shipment was cancelled when it wasn't.
      throw new ShippingCarrierError(
        "andreani",
        "cancel response missing cancelado",
        res.status,
        undefined,
        json,
      );
    }
    return {
      carrier: this.carrier,
      trackingNumber,
      canceled: json.cancelado,
      ...(json.motivo ? { reason: json.motivo } : {}),
      raw: json,
    };
  }

  async listarSucursales(params: {
    postalCode: string;
    limit?: number;
  }): Promise<Branch[]> {
    const url = new URL(`${this.baseUrl}/v2/sucursales`);
    url.searchParams.set("codigoPostal", params.postalCode);
    if (params.limit !== undefined) url.searchParams.set("limit", String(params.limit));
    const res = await this.call("listar_sucursales", url.toString(), {
      method: "GET",
    });
    const json = (await res.json()) as Array<{
      id?: string;
      nombre?: string;
      direccion?: string;
      localidad?: string;
      provincia?: string;
      codigoPostal?: string;
      horarioAtencion?: string;
      latitud?: number;
      longitud?: number;
    }>;
    return (json ?? []).slice(0, params.limit ?? 20).map((s, i) => ({
      carrier: this.carrier,
      id: s.id ?? `andreani-${i}`,
      name: s.nombre ?? "Sucursal",
      address: s.direccion ?? "",
      city: s.localidad ?? "",
      state: s.provincia ?? "",
      postalCode: s.codigoPostal ?? params.postalCode,
      ...(s.horarioAtencion !== undefined ? { openingHours: s.horarioAtencion } : {}),
      ...(s.latitud !== undefined ? { lat: s.latitud } : {}),
      ...(s.longitud !== undefined ? { lng: s.longitud } : {}),
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  private async call(
    op: string,
    url: string,
    init: RequestInit,
    /**
     * Whether this op is safe to retry. `crear` / `cancelar` are
     * non-idempotent POSTs and must pass `false` to avoid duplicate
     * shipments / double-cancellations on timeout / 5xx. Defaults `true`.
     */
    idempotent = true,
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      Accept: "application/json",
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    const params: Parameters<typeof shippingFetch>[0] = {
      url,
      init: { ...init, headers },
      carrier: "andreani",
      operation: op,
      idempotent,
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
        "andreani",
        `HTTP ${res.status} on ${op}: ${text.slice(0, 200)}`,
        res.status,
      );
    }
    return res;
  }

  private toAndreaniAddress(addr: import("./types").Address) {
    const provincia = lookupProvincia(addr.state);
    return {
      postal: {
        codigoPostal: addr.postalCode,
        calle: addr.street,
        numero: addr.number,
        ...(addr.unit ? { departamento: addr.unit } : {}),
        localidad: addr.city,
        region: provincia?.name ?? String(addr.state),
        pais: addr.country ?? "AR",
      },
    };
  }
}

/**
 * Map Andreani's native status strings to the normalized `TrackingStatus`.
 * Andreani's `estado` field is free-form Spanish; we match common keywords.
 */
function mapAndreaniStatus(estado: string): TrackingStatus {
  // Strip accents for keyword matching (Spanish "tránsito" → "transito").
  const e = estado
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (e.includes("entregado")) return "delivered";
  if (e.includes("en reparto") || e.includes("ruta")) return "out_for_delivery";
  if (e.includes("transit") || e.includes("dist")) return "in_transit";
  if (e.includes("ausente") || e.includes("rechaz")) return "delivery_failed";
  if (e.includes("retorn") || e.includes("devuel")) return "returned";
  if (e.includes("cancel")) return "canceled";
  if (e.includes("etiqueta") || e.includes("admit")) return "label_created";
  if (e.includes("dano") || e.includes("perd") || e.includes("incid")) return "exception";
  return "unknown";
}
