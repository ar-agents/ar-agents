import { Experimental_Agent as Agent, isStepCount } from "ai";
import { identityTools, type AfipPadronAdapter } from "@ar-agents/identity";
import { WsaaWscdcAfipPadronAdapter } from "@ar-agents/identity/wsaa";
import { toolApprovalFromRisk } from "@ar-agents/core";

const MODEL = process.env.CUIT_AGENT_MODEL ?? "anthropic/claude-sonnet-4-6";

const INSTRUCTIONS = `Sos un asistente argentino especializado en CUITs/CUILs.

Capabilities (tools provistos por @ar-agents/identity):
- validate_cuit: valida via algoritmo modulo-11 (formato + dígito verificador). PURE FUNCTION, sin AFIP API.
- lookup_cuit_afip: consulta padrón AFIP para nombre + condición + monotributo. Requiere adapter configurado; sin él devuelve mensaje claro pidiendo el setup.

Reglas:
- Cuando el usuario te pase un CUIT, primero validalo con validate_cuit. Si no es válido, explicá por qué (formato, prefix, o dígito verificador) y, si hay un typo en el dígito verificador, sugerí el correcto.
- Si validate_cuit pasa Y el usuario pide info sobre la persona (nombre, condición, monotributo), usá lookup_cuit_afip.
- Si lookup_cuit_afip devuelve available: false, surfaceá el error verbatim al usuario — NO inventés data.
- Sé directo y específico. Vocabulario argentino natural. Sin emojis salvo que el user los use.`;

/**
 * Build the AFIP adapter based on env vars.
 *
 * Two cert input modes:
 *   - Filesystem (local dev): set AFIP_CERT_PATH + AFIP_KEY_PATH to absolute
 *     paths. The lib reads the PEMs from disk.
 *   - Inline (serverless / Vercel): set AFIP_CERT_PEM + AFIP_KEY_PEM with
 *     the PEM contents pasted into env vars (escape newlines as you would
 *     for any multi-line env var).
 *
 * Either mode requires AFIP_CUIT_REPRESENTADO. Without any of the above
 * the adapter is undefined, so identityTools() uses the default
 * UnconfiguredAfipPadronAdapter (which returns a clear "not configured"
 * message instead of crashing).
 */
function buildAfipAdapter(): AfipPadronAdapter | undefined {
  // Trim env vars defensively — Vercel CLI's `echo X | vercel env add`
  // pipes the value WITH a trailing newline, which silently breaks
  // string-keyed lookups like WSAA_URLS[env].
  const cuit = process.env.AFIP_CUIT_REPRESENTADO?.trim();
  if (!cuit) return undefined;
  const env = (process.env.AFIP_ENV?.trim() ?? "prod") as "homo" | "prod";

  // Inline PEMs (Vercel-friendly) take precedence over file paths. The lib
  // re-normalizes PEMs internally (handles \\n escaping, single-line paste),
  // but trim here too for symmetry.
  const certPem = process.env.AFIP_CERT_PEM;
  const keyPem = process.env.AFIP_KEY_PEM;
  if (certPem && keyPem) {
    return new WsaaWscdcAfipPadronAdapter({
      certPem,
      keyPem,
      cuitRepresentado: cuit,
      env,
    });
  }

  const certPath = process.env.AFIP_CERT_PATH?.trim();
  const keyPath = process.env.AFIP_KEY_PATH?.trim();
  if (certPath && keyPath) {
    return new WsaaWscdcAfipPadronAdapter({
      certPath,
      keyPath,
      cuitRepresentado: cuit,
      env,
    });
  }

  return undefined;
}

export function createCuitAgent() {
  const afip = buildAfipAdapter();
  return new Agent({
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools: identityTools(afip ? { afip } : {}),
    stopWhen: isStepCount(6),
    // AI SDK 7 native timeout: the AFIP padrón lookup (WSAA) can hang; bound it so
    // a slow upstream surfaces a graceful TimeoutError instead of stalling.
    timeout: { toolMs: 20_000, totalMs: 60_000 },
    // AI SDK 7 native tool-approval, driven by the @ar-agents/core risk manifest
    // (same law as enforceRiskPolicy). cuit-hello exposes only read tools
    // (validate/lookup), so nothing is gated here — this wires the canonical
    // pattern. When an agent exposes money/fiscal/legal/irreversible tools, those
    // resolve to 'user-approval' and the SDK emits a (HMAC-signable, via
    // experimental_toolApprovalSecret) approval request instead of running them.
    toolApproval: toolApprovalFromRisk(),
  });
}
