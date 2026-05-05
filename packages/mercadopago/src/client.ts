import { classifyError, MercadoPagoError } from "./errors";
import type { CreatePreapprovalParams, Preapproval } from "./types";

const DEFAULT_BASE_URL = "https://api.mercadopago.com";

export interface MercadoPagoClientOptions {
  /** Access token. TEST- prefix for sandbox, APP_USR- for production. */
  accessToken: string;
  /**
   * Override the API base URL. Mostly useful for tests against MSW or for
   * pointing at a regional MP host. Defaults to https://api.mercadopago.com.
   */
  baseUrl?: string;
  /**
   * Custom fetch implementation. Defaults to globalThis.fetch. Override to
   * inject your own retry/instrumentation layer or to test with MSW.
   */
  fetch?: typeof fetch;
}

/**
 * Thin, typed wrapper around Mercado Pago's REST API. Only the endpoints the
 * agent layer needs are exposed; this is deliberately narrow rather than a
 * full SDK rebuild.
 */
export class MercadoPagoClient {
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: MercadoPagoClientOptions) {
    if (!options.accessToken) {
      throw new Error(
        "MercadoPagoClient requires an accessToken. Get one from https://www.mercadopago.com.ar/developers/panel/credentials",
      );
    }
    this.accessToken = options.accessToken;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    // Don't capture globalThis.fetch at construction time — that breaks MSW
    // and other interceptors that patch fetch later. Look it up at call time.
    this.fetchImpl = options.fetch;
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT" | "DELETE",
    path: string,
    body?: unknown,
    classifyContext?: {
      preapprovalId?: string;
      payerEmail?: string;
      sellerEmail?: string;
    },
  ): Promise<T> {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
    };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }
    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const res = await fetchFn(`${this.baseUrl}${path}`, init);
    if (!res.ok) {
      let parsed: unknown;
      const text = await res.text();
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
      throw classifyError(res.status, path, parsed, classifyContext);
    }
    return (await res.json()) as T;
  }

  /**
   * Create a recurring subscription (preapproval). The returned `init_point`
   * URL is where the buyer must complete the FIRST payment with their card +
   * CVV — there is no API path that bypasses this human step.
   */
  async createPreapproval(
    params: CreatePreapprovalParams,
  ): Promise<Preapproval> {
    return this.request<Preapproval>(
      "POST",
      "/preapproval",
      {
        reason: params.reason,
        payer_email: params.payerEmail,
        back_url: params.backUrl,
        external_reference: params.externalReference,
        auto_recurring: {
          frequency: params.frequency,
          frequency_type: params.frequencyType,
          transaction_amount: params.amount,
          currency_id: params.currency,
        },
      },
      { payerEmail: params.payerEmail },
    );
  }

  /**
   * Fetch the current state of a preapproval. Useful to confirm whether the
   * buyer has completed the first payment (`status: 'authorized'`) or whether
   * the subscription was cancelled.
   */
  async getPreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "GET",
      `/preapproval/${id}`,
      undefined,
      { preapprovalId: id },
    );
  }

  /**
   * Cancel an active preapproval. Irreversible: MP will not charge the buyer
   * again and the subscription cannot be reactivated.
   */
  async cancelPreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "PUT",
      `/preapproval/${id}`,
      { status: "cancelled" },
      { preapprovalId: id },
    );
  }

  /**
   * Pause an authorized preapproval. The subscription stops auto-charging but
   * can be re-activated. Note: MP only allows pausing subs that are currently
   * `authorized` — pending/cancelled subs reject this.
   */
  async pausePreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "PUT",
      `/preapproval/${id}`,
      { status: "paused" },
      { preapprovalId: id },
    );
  }

  /**
   * Re-activate a paused preapproval. Charges resume on the next scheduled
   * date.
   */
  async resumePreapproval(id: string): Promise<Preapproval> {
    return this.request<Preapproval>(
      "PUT",
      `/preapproval/${id}`,
      { status: "authorized" },
      { preapprovalId: id },
    );
  }
}

export { MercadoPagoError };
