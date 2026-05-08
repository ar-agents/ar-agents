// Facilitator factory — public-facing entry point. Wraps the handler module
// in a single object that hosts can wire up to their framework.
//
// Usage:
//
//   import { createFacilitator, InMemoryStateAdapter } from "@ar-agents/agentic-commerce-bridge";
//
//   const facilitator = createFacilitator({
//     state: new InMemoryStateAdapter(),
//     catalog: { async resolveItem(id) { ... } },
//     paymentProviders: { mercadopago: mpProvider },
//     paymentHandlers: [{ id: "mercadopago", ... }],
//     webhookSecret: process.env.ACP_WEBHOOK_SECRET,
//   });
//
//   // Next.js App Router catch-all:
//   export async function POST(req: NextRequest, ctx: { params: { slug: string[] } }) {
//     const acpRes = await facilitator.dispatch({
//       method: "POST",
//       path: "/" + ctx.params.slug.join("/"),
//       headers: Object.fromEntries(req.headers.entries()),
//       rawBody: await req.text(),
//     });
//     return new Response(JSON.stringify(acpRes.body), {
//       status: acpRes.status,
//       headers: acpRes.headers,
//     });
//   }

import type { AcpRequest, AcpResponse, FacilitatorOptions } from "./handlers/types";
import {
  handleCancelSession,
  handleCompleteSession,
  handleCreateSession,
  handleGetSession,
  handleUpdateSession,
} from "./handlers/checkout-session";
import {
  buildDefaultDiscovery,
  handleDiscovery,
} from "./handlers/discovery";
import {
  createDispatcher,
  type DispatcherConfig,
} from "./handlers/dispatcher";

export interface Facilitator {
  /** ACP `POST /checkout_sessions`. */
  createSession(req: AcpRequest): Promise<AcpResponse>;
  /** ACP `POST /checkout_sessions/{id}`. */
  updateSession(req: AcpRequest, sessionId: string): Promise<AcpResponse>;
  /** ACP `GET /checkout_sessions/{id}`. */
  getSession(req: AcpRequest, sessionId: string): Promise<AcpResponse>;
  /** ACP `POST /checkout_sessions/{id}/complete`. */
  completeSession(req: AcpRequest, sessionId: string): Promise<AcpResponse>;
  /** ACP `POST /checkout_sessions/{id}/cancel`. */
  cancelSession(req: AcpRequest, sessionId: string): Promise<AcpResponse>;
  /** `/.well-known/acp.json`. */
  discovery(req: AcpRequest): Promise<AcpResponse>;
  /** Static discovery payload (no request needed). */
  discoveryPayload(): ReturnType<typeof buildDefaultDiscovery>;
  /**
   * Path-based dispatcher. Routes inbound requests to the right handler
   * based on `method` + `path`.
   */
  dispatch(req: AcpRequest): Promise<AcpResponse>;
  /** The original options object (so consumers can introspect). */
  readonly options: FacilitatorOptions;
}

export interface CreateFacilitatorOptions extends FacilitatorOptions {
  /** Optional dispatcher config (e.g. base path mount point). */
  dispatcher?: DispatcherConfig;
}

export function createFacilitator(
  options: CreateFacilitatorOptions,
): Facilitator {
  const dispatch = createDispatcher(options.dispatcher);
  return {
    options,
    createSession: (req) => handleCreateSession(req, options),
    updateSession: (req, id) => handleUpdateSession(req, id, options),
    getSession: (req, id) => handleGetSession(req, id, options),
    completeSession: (req, id) => handleCompleteSession(req, id, options),
    cancelSession: (req, id) => handleCancelSession(req, id, options),
    discovery: (req) => handleDiscovery(req, options),
    discoveryPayload: () => buildDefaultDiscovery(options),
    dispatch: (req) => dispatch(req, options),
  };
}
