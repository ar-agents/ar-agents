// Shared safety seam for the evals that RESOLVE the incorporation approval.
//
// Resolving an approval fires incorporar_sociedad's real POST. The evals that
// do that (aprobacion-y-ejecucion, error-sin-reintento) pin INCORPORATE_ENDPOINT
// to a dead local sink so the call can NEVER reach production, and so the
// connection-refused result deterministically exercises the agent's
// network-error handling (the tool classifies it as code "network").
//
// Port 1 has no listener, so fetch fails fast with a connection error instead
// of waiting out the 60s timeout. If CI already points INCORPORATE_ENDPOINT at
// a real stub, that is respected; only an unset or production value is pinned.
// Not named *.eval.ts, so eve discovery ignores it (it is a plain helper).
export const SINK_ENDPOINT = "http://127.0.0.1:1/incorporate-eval-sink";

export function pinEndpointToSink(): void {
  const current = process.env.INCORPORATE_ENDPOINT?.trim();
  if (!current || /ar-agents\.ar/i.test(current)) {
    process.env.INCORPORATE_ENDPOINT = SINK_ENDPOINT;
  }
}
