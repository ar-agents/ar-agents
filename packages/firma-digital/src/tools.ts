/**
 * Vercel AI SDK tool collection for `@ar-agents/firma-digital`.
 *
 * 4 tools, all read-only:
 *
 *   - `firma_inspect_cert`       , parse one PEM cert, return summary.
 *   - `firma_verify_chain`       , validate a chain anchored at AC-Raíz / ONTI.
 *   - `firma_is_onti_issued`     , quick yes/no for "AR Firma Digital".
 *   - `firma_verify_cms_signature`- verify a detached PKCS#7 over data.
 */

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { verifyDetachedCmsSignature } from "./cms";
import { parseCert, verifyChain } from "./x509";

export type FirmaDigitalToolName =
  | "firma_inspect_cert"
  | "firma_verify_chain"
  | "firma_is_onti_issued"
  | "firma_verify_cms_signature";

export interface FirmaDigitalToolsOptions {
  descriptions?: Partial<Record<FirmaDigitalToolName, string>>;
}

const DEFAULT_DESCRIPTIONS: Record<FirmaDigitalToolName, string> = {
  firma_inspect_cert:
    "Inspect an Argentine Firma Digital X.509 certificate (inspeccionar certificado de firma digital, PEM-encoded) and return its subject, issuer, validity window, CUIT (when embedded), public-key info, and signature algorithm. Detects whether the cert is issued under AR ONTI / AC-Raíz Argentina. USE THIS WHEN: the user pastes a cert and asks 'who is this' or 'is this real'. PURE FUNCTION, no I/O, sub-millisecond.",

  firma_verify_chain:
    "Verify an X.509 certificate chain (verificar cadena de certificados; PEM bundle, leaf → root), checks issuer-by-subject linking, RSA signatures, validity window. Returns valid/reason + per-cert trace. By default accepts AR-ONTI-looking self-signed roots; pass explicit trust anchors for stricter checks. USE THIS WHEN: the user has a chain and needs to know whether to trust it. DO NOT USE for end-to-end document signature verification, for that use `firma_verify_cms_signature`.",

  firma_is_onti_issued:
    "Check if a cert was issued under Argentine Firma Digital (¿es un certificado de firma digital argentina? AC-Raíz / ONTI ecosystem); quick yes/no. Heuristic-based on issuer DN attributes. PURE FUNCTION. USE THIS WHEN: triaging incoming signed docs to decide which verification path to take.",

  firma_verify_cms_signature:
    "Verify a digitally signed document (verificar firma digital de un documento): detached PKCS#7 / CMS signature against a payload (e.g., `firma.p7s` produced by an AR signing tool). Returns valid/reason + per-signer info including chain validation. The signature is base64-encoded; the payload is base64-encoded too (binary-safe). USE THIS WHEN: the user wants to know if a signed document is authentic. NOTE: timestamp-token (PAdES-LTV) verification is NOT performed.",
};

export function firmaDigitalTools(options: FirmaDigitalToolsOptions = {}): ToolSet {
  const desc = (name: FirmaDigitalToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    firma_inspect_cert: tool({
      description: desc("firma_inspect_cert"),
      inputSchema: z.object({
        cert_pem: z
          .string()
          .describe("PEM-encoded X.509 certificate, including the BEGIN/END lines."),
      }),
      execute: async (input) => {
        return parseCert(input.cert_pem);
      },
    }),

    firma_verify_chain: tool({
      description: desc("firma_verify_chain"),
      inputSchema: z.object({
        chain_pem: z
          .string()
          .describe(
            "PEM bundle: concatenated CERTIFICATE blocks, leaf first, root last.",
          ),
        accept_ar_onti_root: z
          .boolean()
          .optional()
          .describe(
            "Accept AR-ONTI-looking self-signed roots without an explicit trust anchor. Default true.",
          ),
        now_iso: z
          .string()
          .optional()
          .describe(
            "ISO 8601 reference time for validity-window checks. Defaults to now.",
          ),
      }),
      execute: async (input) => {
        const opts: Parameters<typeof verifyChain>[1] = {};
        if (input.accept_ar_onti_root !== undefined) opts.acceptArOntiRoot = input.accept_ar_onti_root;
        if (input.now_iso !== undefined) opts.now = new Date(input.now_iso);
        return verifyChain(input.chain_pem, opts);
      },
    }),

    firma_is_onti_issued: tool({
      description: desc("firma_is_onti_issued"),
      inputSchema: z.object({
        cert_pem: z.string(),
      }),
      execute: async (input) => {
        const parsed = parseCert(input.cert_pem);
        return {
          ontiIssued: parsed.isOntiIssued,
          ontiRoot: parsed.isOntiRoot,
          subjectCn: parsed.commonName ?? null,
          issuerCn: parsed.issuer["CN"] ?? null,
          cuit: parsed.cuit ?? null,
        };
      },
    }),

    firma_verify_cms_signature: tool({
      description: desc("firma_verify_cms_signature"),
      inputSchema: z.object({
        signature_b64: z
          .string()
          .describe(
            "Base64-encoded PKCS#7 / CMS signature (DER or PEM ASCII). For PEM, also accept the raw text, base64 the PEM if needed.",
          ),
        payload_b64: z.string().describe("Base64-encoded payload bytes the signature was made over."),
        verify_chain: z
          .boolean()
          .optional()
          .describe("Walk the signer cert chain too. Default true."),
        now_iso: z.string().optional(),
      }),
      execute: async (input) => {
        const sigBytes = base64ToBytes(input.signature_b64);
        // Try parse-as-PEM first if it starts with -----BEGIN; fall back to DER.
        const sigInput = bytesLooksPem(sigBytes) ? bytesToString(sigBytes) : sigBytes;
        const opts: Parameters<typeof verifyDetachedCmsSignature>[2] = {};
        if (input.verify_chain !== undefined) opts.verifyChain = input.verify_chain;
        if (input.now_iso !== undefined) opts.now = new Date(input.now_iso);
        return verifyDetachedCmsSignature(sigInput, base64ToBytes(input.payload_b64), opts);
      },
    }),
  };
}

function base64ToBytes(b64: string): Uint8Array {
  const cleaned = b64.replace(/\s+/g, "");
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToString(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}

function bytesLooksPem(bytes: Uint8Array): boolean {
  if (bytes.length < 11) return false;
  const head = bytesToString(bytes.subarray(0, 11));
  return head.startsWith("-----BEGIN ");
}
