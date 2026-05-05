import { Experimental_Agent as Agent, stepCountIs, tool } from "ai";
import { z } from "zod";
import {
  parseCuit,
  describePersonType,
  type CuitParseResult,
} from "./cuit";
import { lookupCuitInAfip, type AfipLookupResult } from "./afip-stub";

const MODEL = process.env.CUIT_AGENT_MODEL ?? "anthropic/claude-sonnet-4-6";

const INSTRUCTIONS = `Sos un asistente argentino especializado en validar CUITs/CUILs.

Capabilities:
- validate_cuit: valida un CUIT/CUIL via algoritmo (formato + dígito verificador modulo 11). NO consulta AFIP, solo verifica que el CUIT sea matemáticamente válido.
- lookup_cuit_afip: consulta el padrón AFIP para obtener nombre, condición tributaria y categoría de monotributo. REQUIERE certificado AFIP configurado en env vars (AFIP_CERT_PATH + AFIP_KEY_PATH); si no está, devuelve un mensaje claro pidiendo el setup.

Reglas:
- Cuando el usuario te pase un CUIT, primero validalo con validate_cuit. Si no es válido, explicá por qué (formato, prefix, o dígito verificador).
- Si validate_cuit pasa Y el usuario pide info sobre la persona (nombre, condición, monotributo), usá lookup_cuit_afip.
- Sé directo y específico. Usá vocabulario argentino natural. Sin emojis salvo que el user los use.`;

const cuitTools = {
  validate_cuit: tool({
    description:
      "Validate a CUIT/CUIL via the modulo-11 check digit algorithm. Returns whether the CUIT is mathematically valid plus inferred person type (persona física vs jurídica). Does NOT consult AFIP — for taxpayer name + tax condition + monotributo category, use lookup_cuit_afip after validation passes.",
    inputSchema: z.object({
      cuit: z
        .string()
        .min(1)
        .describe(
          "The CUIT/CUIL to validate. Accepts any format with or without separators: 20-41758101-5, 20.41758101.5, 20417581015, etc.",
        ),
    }),
    execute: async ({ cuit }): Promise<CuitParseResult & { personTypeDescription: string }> => {
      const result = parseCuit(cuit);
      return {
        ...result,
        personTypeDescription: describePersonType(result.personType),
      };
    },
  }),

  lookup_cuit_afip: tool({
    description:
      "Look up a CUIT against AFIP's Padrón webservice to retrieve the taxpayer's full legal name, tax condition (monotributo / responsable inscripto / exento / etc.), monotributo category if applicable, and registered address. REQUIRES an AFIP X.509 cert + private key configured via env vars; if not configured, returns a structured error explaining the setup steps. Always validate the CUIT first with validate_cuit.",
    inputSchema: z.object({
      cuit: z
        .string()
        .describe("The CUIT/CUIL to look up. Pass the validated/normalized form."),
    }),
    execute: async ({ cuit }): Promise<AfipLookupResult> => {
      return await lookupCuitInAfip(cuit);
    },
  }),
};

export function createCuitAgent() {
  return new Agent({
    model: MODEL,
    instructions: INSTRUCTIONS,
    tools: cuitTools,
    stopWhen: stepCountIs(6),
  });
}
