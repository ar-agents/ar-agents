/**
 * `GET /api/constancia/attestation/[cuit]`, the shareable signed attestation.
 *
 * Returns the Ed25519-signed `ConstanciaAttestation` for one CUIT: the free
 * check-digit verdict always, plus the real ARCA good-standing verdict when a
 * fetcher is configured. This is the machine-payable, embeddable proof behind
 * "Firmada". Anyone can verify it offline against
 * /.well-known/sociedad-ia/keys, or POST it to /api/constancia/attestation/verify.
 *
 * Runtime nodejs: the good-standing fetcher (`@ar-agents/identity/wsaa`) pulls
 * node-forge. Cached 1h (a constancia is point-in-time; the signed snapshot is
 * stable for that window).
 */

import { parseCuit } from "@ar-agents/identity";
import { normalizeCuit } from "@ar-agents/constancia";
import { jsonCors, preflight } from "@/lib/cors";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { getConstanciaFetcher } from "@/lib/constancia";
import {
  buildConstanciaAttestation,
  type ConstanciaGoodStanding,
} from "@/lib/constancia-attestation";

export const runtime = "nodejs";

const RL_MAX = 30;
const RL_WINDOW_MS = 60_000;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ cuit: string }> },
) {
  if (!rateLimit("constancia-attestation", clientIp(req), RL_MAX, RL_WINDOW_MS)) {
    return jsonCors(
      { error: "rate_limited", note: "30 consultas por minuto por IP." },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const { cuit } = await ctx.params;
  const parsed = parseCuit(cuit);
  const bare = normalizeCuit(cuit) ?? parsed.normalized;

  let goodStanding: ConstanciaGoodStanding | null = null;
  if (parsed.valid) {
    try {
      const constancia = await getConstanciaFetcher().getConstancia(bare);
      if (constancia.available && constancia.data) {
        goodStanding = {
          source:
            constancia.source === "browse-skill" ? "browse-skill" : "padron-soap",
          condicion: constancia.data.condicion,
          ...(constancia.data.denominacion
            ? { denominacion: constancia.data.denominacion }
            : {}),
          ...(constancia.data.estado ? { estado: constancia.data.estado } : {}),
        };
      }
    } catch {
      // fall through to a signed check-digit-only attestation
    }
  }

  const attestation = await buildConstanciaAttestation({
    cuit: bare,
    checkDigitValid: parsed.valid,
    goodStanding,
  });

  if (!attestation) {
    return jsonCors(
      {
        error: "signing_unavailable",
        note: "No hay clave de firma configurada en este deployment.",
      },
      { status: 503 },
    );
  }

  return jsonCors(
    {
      attestation,
      verify: {
        publicKeys: "https://ar-agents.ar/.well-known/sociedad-ia/keys",
        endpoint: "https://ar-agents.ar/api/constancia/attestation/verify",
        offline:
          "Ed25519 sobre canonical(body). Verificable sin confiar en este servidor.",
      },
    },
    {
      headers: {
        "cache-control":
          "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
      },
    },
  );
}

export function OPTIONS(): Response {
  return preflight();
}
