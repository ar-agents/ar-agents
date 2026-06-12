import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { AttestationClient } from "./client";

export interface IdentityAttestToolsOptions {
  /**
   * Optionally restrict the methods the LLM can choose. Useful when you
   * want to nudge the agent toward a specific channel (e.g., "always use
   * WhatsApp OTP for this app").
   */
  allowedMethods?: string[];
  /** Override default tool descriptions. */
  descriptions?: Partial<Record<ToolName, string>>;
}

type ToolName =
  | "request_identity_verification"
  | "submit_otp_code"
  | "check_verification_status"
  | "get_attestation"
  | "list_verification_methods";

const DEFAULT_DESCRIPTIONS: Record<ToolName, string> = {
  request_identity_verification:
    "Start an identity verification flow (verificar identidad, enviar código de verificación) to prove the user controls a phone, email, or other identity asset. Returns a request_id you'll use to check status, plus a verification_url (for magic-link flows) or instructions to ask the user for the OTP code (for OTP flows). Pick the method based on trust requirements: 'whatsapp_otp' (trust 0.3, fastest), 'email_magic_link' (trust 0.5, more friction). Use list_verification_methods to see what's registered.",
  submit_otp_code:
    "Submit the OTP verification code (ingresar código de verificación) the user dictated back to you (after they received it via WhatsApp/SMS/Email). Returns the signed attestation if correct, throws InvalidOtpCodeError if wrong (with attempts remaining), or TooManyAttemptsError if exhausted. The user typically dictates the code aloud or types it in chat, extract just the digits.",
  check_verification_status:
    "Check verification status (estado de la verificación): pending, completed, expired, or failed. Use this between user turns when waiting for the user to click a magic link.",
  get_attestation:
    "Fetch the signed attestation for a completed verification (obtener la atestación firmada). Returns null if not yet verified. The attestation includes trust_level (0-1), method, subject, claims, and a signature you can persist for audit.",
  list_verification_methods:
    "List available verification methods (métodos de verificación disponibles) the host app has registered (with trust levels). Use to know what options are available before calling request_identity_verification.",
};

/**
 * Build the agent toolkit for identity attestation. Wire into a Vercel AI SDK
 * `Agent` alongside other tools.
 *
 * @example
 * ```ts
 * import { Experimental_Agent as Agent } from "ai";
 * import { AttestationClient, identityAttestTools, WhatsAppOtpAdapter } from "@ar-agents/identity-attest";
 *
 * const attestation = new AttestationClient({
 *   signingSecret: process.env.ATTEST_SIGNING_SECRET!,
 *   adapters: { whatsapp_otp: new WhatsAppOtpAdapter({ whatsappClient: wa }) },
 * });
 *
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4-6",
 *   tools: identityAttestTools(attestation),
 *   ...
 * });
 * ```
 */
export function identityAttestTools(
  client: AttestationClient,
  options: IdentityAttestToolsOptions = {},
): ToolSet {
  const desc = (name: ToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    list_verification_methods: tool({
      description: desc("list_verification_methods"),
      inputSchema: z.object({}),
      execute: async () => {
        const all = client.listAdapters();
        const filtered = options.allowedMethods
          ? all.filter((a) => options.allowedMethods!.includes(a.id))
          : all;
        return {
          count: filtered.length,
          methods: filtered.map((m) => ({
            id: m.id,
            trust_level: m.trustLevel,
            description: trustDescription(m.trustLevel),
          })),
        };
      },
    }),

    request_identity_verification: tool({
      description: desc("request_identity_verification"),
      inputSchema: z.object({
        method: z
          .string()
          .describe("Verification method id (e.g., 'whatsapp_otp', 'email_magic_link'). Use list_verification_methods to see options."),
        subject_type: z
          .enum(["phone", "email", "oauth", "dni", "cuit", "custom"])
          .describe("What we're proving the user controls."),
        subject_value: z
          .string()
          .describe("The subject's value (e.g., '+5491112345678' for phone, 'lautaro@example.com' for email)."),
        external_reference: z
          .string()
          .optional()
          .describe("Your-system identifier (e.g., the order id this verification is gating)."),
      }),
      execute: async (input) => {
        const request = await client.requestVerification({
          method: input.method,
          subject: { type: input.subject_type, value: input.subject_value },
          ...(input.external_reference !== undefined ? { externalReference: input.external_reference } : {}),
        });
        return {
          request_id: request.requestId,
          method: request.method,
          trust_level: request.trustLevel,
          status: request.status,
          expires_at: request.expiresAt,
          verification_url: request.verificationUrl,
          next_step: request.verificationUrl
            ? `Tell the user: 'Te mandé un mail con un link para confirmar, hacé click ahí.' Then poll check_verification_status until it returns 'verified'.`
            : `Tell the user: 'Te mandé un código por WhatsApp, pasámelo cuando lo recibas.' When they reply with the code, call submit_otp_code with the request_id and the code.`,
        };
      },
    }),

    submit_otp_code: tool({
      description: desc("submit_otp_code"),
      inputSchema: z.object({
        request_id: z.string(),
        code: z
          .string()
          .min(4)
          .max(10)
          .describe("The OTP code the user dictated. Extract only the digits."),
      }),
      execute: async (input) => {
        const attestation = await client.submitOtp(input.request_id, input.code);
        return {
          verified: true,
          request_id: attestation.requestId,
          trust_level: attestation.trustLevel,
          subject: attestation.subject,
          verified_at: attestation.verifiedAt,
          expires_at: attestation.expiresAt,
          message: `User verified at trust level ${attestation.trustLevel} via ${attestation.method}.`,
        };
      },
    }),

    check_verification_status: tool({
      description: desc("check_verification_status"),
      inputSchema: z.object({ request_id: z.string() }),
      execute: async ({ request_id }) => {
        const status = await client.getRequestStatus(request_id);
        const attestation =
          status.status === "verified" ? await client.getAttestation(request_id) : null;
        return {
          request_id,
          status: status.status,
          method: status.method,
          subject: status.subject,
          trust_level: status.trustLevel,
          expires_at: status.expiresAt,
          attestation: attestation
            ? {
                verified_at: attestation.verifiedAt,
                claims: attestation.claims,
                signature: attestation.signature,
              }
            : null,
        };
      },
    }),

    get_attestation: tool({
      description: desc("get_attestation"),
      inputSchema: z.object({ request_id: z.string() }),
      execute: async ({ request_id }) => {
        const attestation = await client.getAttestation(request_id);
        return attestation
          ? {
              found: true,
              request_id: attestation.requestId,
              verifier: attestation.verifier,
              method: attestation.method,
              trust_level: attestation.trustLevel,
              subject: attestation.subject,
              claims: attestation.claims,
              verified_at: attestation.verifiedAt,
              expires_at: attestation.expiresAt,
              signature: attestation.signature,
              external_reference: attestation.externalReference,
            }
          : { found: false };
      },
    }),
  } satisfies ToolSet;
}

function trustDescription(level: number): string {
  if (level >= 0.95) return "gov-verified, official identity (highest)";
  if (level >= 0.85) return "KYC-verified, fintech-grade identity check";
  if (level >= 0.7) return "federated identity, IdP account verified";
  if (level >= 0.5) return "email-owned, controls an email";
  if (level >= 0.3) return "phone-owned, controls a phone number";
  return "low confidence";
}
