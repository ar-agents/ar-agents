import type { AfipPadronResult } from "./types";

/**
 * Pluggable AFIP padron lookup interface.
 *
 * # Why pluggable?
 *
 * AFIP's WSAA + WSCDC integration requires an X.509 certificate that:
 * - Is generated locally (openssl)
 * - Is registered with AFIP via Clave Fiscal
 * - Is authorized for the specific service (`ws_sr_padron_a13`)
 * - Is renewed annually
 *
 * That cert + the SOAP client live in user infrastructure, not in this
 * package. The lib defines the contract; users wire their own adapter.
 *
 * # Default behavior
 *
 * When you call `identityTools()` without passing an `afip` option, the
 * `lookup_cuit_afip` tool will use `UnconfiguredAfipPadronAdapter`, which
 * always returns `{ available: false, error: <setup instructions> }`. The
 * agent surfaces the setup steps to the user, no surprise crashes.
 *
 * # Implementing your own adapter
 *
 * Provide an object with a single `lookup(cuit)` method that returns a
 * `Promise<AfipPadronResult>`. See the README for a full WSAA + WSCDC
 * implementation example using `node-soap` + `node-forge`.
 *
 * @example
 * ```ts
 * class MyAfipAdapter implements AfipPadronAdapter {
 *   async lookup(cuit: string): Promise<AfipPadronResult> {
 *     const ta = await this.getOrRefreshTa();
 *     const persona = await this.wscdcClient.getPersona(ta, cuit);
 *     return {
 *       cuit,
 *       available: true,
 *       error: null,
 *       data: {
 *         nombre: persona.nombre,
 *         condicion: persona.tipoClave,
 *         monotributoCategoria: persona.monotributo?.categoria ?? null,
 *         fechaInscripcion: persona.fechaInscripcion,
 *         domicilioFiscal: persona.domicilio?.direccion ?? null,
 *         actividades: persona.actividades?.map(a => a.descripcion) ?? [],
 *       },
 *     };
 *   }
 * }
 * ```
 */
export interface AfipPadronAdapter {
  lookup(cuit: string): Promise<AfipPadronResult>;
}

/**
 * Default `AfipPadronAdapter` used when the consumer hasn't provided one.
 * Always returns `{ available: false, error: <how to configure> }` so the
 * agent can surface a clear, actionable message to the user instead of
 * crashing or hallucinating taxpayer data.
 *
 * # When the lib uses this
 *
 * Whenever you call `identityTools()` without passing `{ afip }`, the
 * factory wires this adapter for `lookup_cuit_afip`. To enable real lookups,
 * implement `AfipPadronAdapter` and pass it explicitly:
 *
 * ```ts
 * const tools = identityTools({ afip: new MyAfipAdapter() });
 * ```
 */
export class UnconfiguredAfipPadronAdapter implements AfipPadronAdapter {
  async lookup(cuit: string): Promise<AfipPadronResult> {
    return {
      cuit,
      available: false,
      error:
        "AFIP padron lookup not configured for this app. To enable: (1) generate an X.509 cert with openssl, (2) register it in AFIP via Clave Fiscal at https://auth.afip.gob.ar/, (3) authorize the service `ws_sr_padron_a13`, (4) implement `AfipPadronAdapter` and pass it to `identityTools({ afip })`. See the @ar-agents/identity README for a full walkthrough. Until then, the agent can validate the CUIT format and check digit but cannot return name / tax condition / monotributo category.",
      data: null,
    };
  }
}
