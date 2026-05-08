// API version negotiation per ACP spec.
//
// Header `API-Version` is REQUIRED. Acceptable values are date strings of
// the form `YYYY-MM-DD`. We pin a list of supported versions and respond
// with `unsupported_api_version` (including a `supported_versions` echo) when
// the client requests something we don't implement.

import {
  AcpError,
  missingApiVersion,
  unsupportedApiVersion,
} from "./schemas/error";
import { LATEST_API_VERSION, SUPPORTED_API_VERSIONS } from "./schemas/common";

export interface VersionNegotiation {
  /** Resolved version the request will be processed against. */
  version: string;
  /** True if the resolved version differs from `LATEST_API_VERSION`. */
  isLegacy: boolean;
}

export interface VersionConfig {
  supported?: readonly string[];
  /** Default version to use when the header is missing. If unset, missing header is an error. */
  defaultVersion?: string;
}

/**
 * Negotiate API version. Returns either the resolved version or an
 * `AcpError` to return as 400.
 */
export function negotiateVersion(
  header: string | null | undefined,
  config: VersionConfig = {},
): VersionNegotiation | AcpError {
  const supported = config.supported ?? SUPPORTED_API_VERSIONS;
  const requested = header?.trim() ?? "";

  if (!requested) {
    if (config.defaultVersion) {
      return {
        version: config.defaultVersion,
        isLegacy: config.defaultVersion !== LATEST_API_VERSION,
      };
    }
    return missingApiVersion();
  }

  if (!supported.includes(requested)) {
    return unsupportedApiVersion(requested, supported);
  }

  return {
    version: requested,
    isLegacy: requested !== LATEST_API_VERSION,
  };
}
