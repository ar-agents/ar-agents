// `/.well-known/acp.json` discovery endpoint (RFC 8615).
//
// Pre-flight, no auth required. Returns the merchant's ACP capabilities so
// agents can decide whether to proceed and which version+extensions to
// negotiate.
//
// The response MUST NOT include merchant-specific identifiers (avoiding
// enumeration risk). It SHOULD ship `Cache-Control: public, max-age=3600`.

import type { AcpRequest, AcpResponse, FacilitatorOptions } from "./types";
import {
  DiscoveryResponse,
  type DiscoveryResponse as DiscoveryResponseType,
} from "../schemas/capabilities";
import {
  LATEST_API_VERSION,
  SUPPORTED_API_VERSIONS,
} from "../schemas/common";
import { jsonResponse, methodNotAllowed } from "./responses";
import { validationFailed } from "../schemas/error";

/**
 * Build a default discovery payload from facilitator options. Hosts can
 * override entirely via `options.discovery`.
 */
export function buildDefaultDiscovery(
  options: FacilitatorOptions,
): DiscoveryResponseType {
  if (options.discovery) {
    return options.discovery;
  }
  return DiscoveryResponse.parse({
    protocol: {
      name: "acp",
      version: LATEST_API_VERSION,
      supported_versions: [...SUPPORTED_API_VERSIONS],
      documentation_url: "https://github.com/ar-agents/ar-agents/tree/main/packages/agentic-commerce-bridge",
    },
    api_base_url: "https://example.invalid",
    transports: ["rest"],
    capabilities: {
      services: ["checkout"],
      ...(options.baseCapabilities?.interventions?.supported
        ? {
            intervention_types:
              options.baseCapabilities.interventions.supported,
          }
        : {}),
    },
  } satisfies DiscoveryResponseType);
}

export async function handleDiscovery(
  req: AcpRequest,
  options: FacilitatorOptions,
): Promise<AcpResponse> {
  if (req.method !== "GET") {
    return methodNotAllowed(
      validationFailed(`Method ${req.method} not allowed on /.well-known/acp.json.`),
    );
  }
  const body = buildDefaultDiscovery(options);
  return jsonResponse(200, body, {
    "Cache-Control": "public, max-age=3600",
  });
}
