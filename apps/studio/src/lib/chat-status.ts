// Pure helpers for the chat UI's error copy. Kept free of React and fetch
// so they are unit-testable without a DOM (see test/smoke.test.ts).

export const AGENT_ENDPOINT = "/api/agent";

export const BACKEND_NOT_WIRED_MESSAGE =
  "El backend del agente todavía no está conectado. (Agent backend isn't wired up yet.)";

export const GENERIC_ERROR_MESSAGE =
  "Algo salió mal hablando con el agente. Probá de nuevo en un rato. (Something went wrong, try again shortly.)";

/**
 * Maps an HTTP response status from POST /api/agent (or null for a
 * network-level failure, e.g. fetch throwing) to the copy the chat UI
 * should show instead of the raw error.
 *
 * 404 means the route literally does not exist yet, the expected state for
 * apps/studio until M0-2 ships the agent route, so it gets its own honest
 * message rather than the generic one. Returns null when the response was
 * successful and no message should be shown.
 */
export function describeAgentResponseStatus(status: number | null): string | null {
  if (status === null) return GENERIC_ERROR_MESSAGE;
  if (status === 404) return BACKEND_NOT_WIRED_MESSAGE;
  if (status >= 200 && status < 300) return null;
  return GENERIC_ERROR_MESSAGE;
}
