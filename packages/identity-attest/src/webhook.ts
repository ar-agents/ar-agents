import type { AttestationClient } from "./client";
import type { Attestation } from "./types";

/**
 * Handle the callback when a user clicks a magic link.
 *
 * Wire this into a route handler at the URL you passed as `callbackBaseUrl`
 * to the `EmailMagicLinkAdapter` (or any adapter that uses URL-based
 * verification). The handler:
 *
 * 1. Extracts `request_id` and `token` from the query string
 * 2. Calls `client.submitMagicLinkToken(requestId, token)`
 * 3. Returns the issued `Attestation` (or `null` if invalid)
 *
 * # Example (Next.js app router)
 *
 * ```ts
 * // app/api/identity-attest/callback/route.ts
 * import { NextRequest, NextResponse } from "next/server";
 * import { handleAttestationCallback } from "@ar-agents/identity-attest";
 * import { attestation } from "@/lib/attestation";
 *
 * export async function GET(req: NextRequest) {
 *   const result = await handleAttestationCallback({
 *     query: Object.fromEntries(new URL(req.url).searchParams),
 *     client: attestation,
 *   });
 *   if (result.kind === "verified") {
 *     // Show user a "thanks, you can return to the chat" page
 *     return new NextResponse("<h1>Verificado ✓</h1><p>Volvé al chat.</p>", {
 *       headers: { "Content-Type": "text/html" },
 *     });
 *   }
 *   return new NextResponse(`<h1>Error: ${result.reason}</h1>`, {
 *     status: 400,
 *     headers: { "Content-Type": "text/html" },
 *   });
 * }
 * ```
 */
export async function handleAttestationCallback(params: {
  query: Record<string, string | string[] | undefined>;
  client: AttestationClient;
}): Promise<
  | { kind: "verified"; attestation: Attestation }
  | { kind: "invalid"; reason: string }
> {
  const requestId = singleValue(params.query["request_id"]);
  const token = singleValue(params.query["token"]);

  if (!requestId || !token) {
    return {
      kind: "invalid",
      reason: "Missing request_id or token in callback URL",
    };
  }

  try {
    const attestation = await params.client.submitMagicLinkToken(requestId, token);
    return { kind: "verified", attestation };
  } catch (err) {
    return {
      kind: "invalid",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

function singleValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
