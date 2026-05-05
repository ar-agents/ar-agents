/**
 * AFIP "Constancia de Inscripción" lookup — stub for v0.1, real impl in v0.2.
 *
 * To enable this lookup against AFIP's webservices you need:
 *   1. Generate an X.509 certificate + private key with openssl:
 *      openssl genrsa -out afip-key.pem 2048
 *      openssl req -new -key afip-key.pem -subj "/C=AR/O=YourOrg/CN=ar-agents" -out afip.csr
 *   2. Log into AFIP with Clave Fiscal at https://auth.afip.gob.ar/
 *   3. Adminitrar Certificados Digitales → Agregar Alias → upload your .csr
 *   4. AFIP issues your .crt; download it.
 *   5. Authorize the cert for the service `ws_sr_padron_a5` (homologación for sandbox,
 *      producción for live) at "Administrador de Relaciones de Clave Fiscal" →
 *      "Adherir Servicio".
 *   6. Set env vars:
 *        AFIP_CERT_PATH=/path/to/afip.crt
 *        AFIP_KEY_PATH=/path/to/afip-key.pem
 *        AFIP_CUIT_REPRESENTADO=20XXXXXXXXY  // your CUIT
 *        AFIP_ENV=homo  // or "prod" once homologación tested
 *   7. Replace this stub with the real WSAA + WSCDC SOAP integration.
 *
 * The full protocol (TRA → CMS sign → WSAA LoginCms → TA → WSCDC personaService_v2)
 * is documented at https://www.afip.gob.ar/ws/documentacion/.
 */

export interface AfipLookupResult {
  cuit: string;
  /** When false, see `error` for why the lookup couldn't be performed. */
  available: boolean;
  /** Why the lookup is unavailable (e.g., cert not configured, AFIP API down). */
  error: string | null;
  /** Set when `available` is true. */
  data: AfipPadronData | null;
}

export interface AfipPadronData {
  /** Full legal name. */
  nombre: string;
  /** Tax condition (e.g., "MONOTRIBUTO", "RESPONSABLE INSCRIPTO", "EXENTO"). */
  condicion: string;
  /** Monotributo category (A-K) when applicable; null otherwise. */
  monotributoCategoria: string | null;
  /** ISO date when the taxpayer was registered. */
  fechaInscripcion: string | null;
  /** Domicilio fiscal (address). */
  domicilioFiscal: string | null;
  /** Activities registered. */
  actividades: string[];
}

/**
 * Look up a CUIT against AFIP's Padron webservice. Currently returns
 * `available: false` with a message explaining what to configure. Wire the
 * real WSAA + WSCDC integration in v0.2.
 */
export async function lookupCuitInAfip(
  cuit: string,
): Promise<AfipLookupResult> {
  const certPath = process.env.AFIP_CERT_PATH;
  const keyPath = process.env.AFIP_KEY_PATH;

  if (!certPath || !keyPath) {
    return {
      cuit,
      available: false,
      error:
        "AFIP lookup not configured. Set AFIP_CERT_PATH + AFIP_KEY_PATH (see src/lib/afip-stub.ts header for the full setup walkthrough). Until then, the agent can validate the CUIT format and check digit but cannot return name / tax condition / monotributo category.",
      data: null,
    };
  }

  // Real implementation goes here. Pseudocode:
  //   1. Read TA from cache; if expired, generate TRA + CMS-sign + LoginCms
  //   2. Call WSCDC personaService_v2.getPersonaList_v2 with TA + cuit
  //   3. Parse SOAP response into AfipPadronData
  //   4. Return { cuit, available: true, error: null, data }
  return {
    cuit,
    available: false,
    error:
      "AFIP cert configured but the WSAA + WSCDC integration is still stubbed. Implement in src/lib/afip-stub.ts (see header).",
    data: null,
  };
}
