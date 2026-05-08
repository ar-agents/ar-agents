// Path-based dispatcher. Hosts that want one entry point (e.g. a Next.js
// catch-all `[...slug]` route) can call `dispatch(req)`; the dispatcher
// routes to the appropriate handler.
//
// The default base path is `""` (root). Override via `dispatcher = createDispatcher({ basePath: "/api/acp" })`.

import type { AcpRequest, AcpResponse, FacilitatorOptions } from "./types";
import {
  handleCancelSession,
  handleCompleteSession,
  handleCreateSession,
  handleGetSession,
  handleUpdateSession,
} from "./checkout-session";
import { handleDiscovery } from "./discovery";
import { jsonResponse, notFound } from "./responses";

export interface DispatcherConfig {
  /** Strip this prefix before matching. Useful when mounted under e.g. `/api/acp`. */
  basePath?: string;
}

interface Route {
  pattern: RegExp;
  method: string;
  handler: (
    req: AcpRequest,
    options: FacilitatorOptions,
    captures: string[],
  ) => Promise<AcpResponse>;
}

// Order matters — most specific routes first. RegEx uses a single capture
// group for `:id` (alphanumeric + underscore + hyphen).
const ID = "([A-Za-z0-9_-]+)";
const ROUTES: Route[] = [
  {
    pattern: new RegExp(`^/\\.well-known/acp\\.json$`),
    method: "GET",
    handler: (req, options) => handleDiscovery(req, options),
  },
  {
    pattern: new RegExp(`^/checkout_sessions/${ID}/complete$`),
    method: "POST",
    handler: (req, options, captures) =>
      handleCompleteSession(req, captures[0] ?? "", options),
  },
  {
    pattern: new RegExp(`^/checkout_sessions/${ID}/cancel$`),
    method: "POST",
    handler: (req, options, captures) =>
      handleCancelSession(req, captures[0] ?? "", options),
  },
  {
    pattern: new RegExp(`^/checkout_sessions/${ID}$`),
    method: "POST",
    handler: (req, options, captures) =>
      handleUpdateSession(req, captures[0] ?? "", options),
  },
  {
    pattern: new RegExp(`^/checkout_sessions/${ID}$`),
    method: "GET",
    handler: (req, options, captures) =>
      handleGetSession(req, captures[0] ?? "", options),
  },
  {
    pattern: new RegExp(`^/checkout_sessions$`),
    method: "POST",
    handler: (req, options) => handleCreateSession(req, options),
  },
];

/**
 * Strip the configured base path off `req.path` and route to the matching
 * handler. Returns 404 if no route matches.
 */
export function createDispatcher(config: DispatcherConfig = {}) {
  const basePath = (config.basePath ?? "").replace(/\/+$/, "");

  return async function dispatch(
    req: AcpRequest,
    options: FacilitatorOptions,
  ): Promise<AcpResponse> {
    let path = req.path;
    // Drop query string if present.
    const qIdx = path.indexOf("?");
    if (qIdx !== -1) path = path.slice(0, qIdx);

    if (basePath && path.startsWith(basePath)) {
      path = path.slice(basePath.length) || "/";
    }
    if (!path.startsWith("/")) {
      path = `/${path}`;
    }

    for (const route of ROUTES) {
      const match = route.pattern.exec(path);
      if (!match) continue;
      if (route.method !== req.method) continue;
      const captures = match.slice(1);
      // Pass-through handler with the matched captures.
      return route.handler({ ...req, path }, options, captures);
    }

    return notFound({
      type: "invalid_request",
      code: "session_not_found",
      message: `Route not found: ${req.method} ${path}.`,
    });
  };
}

/**
 * Convenience: a static dispatcher with no base path. Useful in tests.
 */
export const dispatch = createDispatcher();

// Re-export to support `import { jsonResponse } from "./dispatcher"` ergonomics.
export { jsonResponse };
