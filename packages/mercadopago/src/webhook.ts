import { createHmac, timingSafeEqual } from "node:crypto";
import { WebhookBodySchema, type ParsedWebhookEvent } from "./types";

/**
 * Parse a Mercado Pago webhook from the raw request body and URL search params.
 * MP sends the topic and resource id in EITHER the URL query string OR the
 * body, depending on integration version — this normalizes both shapes into a
 * single structure.
 *
 * @example
 * ```ts
 * export async function POST(req: Request) {
 *   const body = await req.json().catch(() => ({}));
 *   const event = parseWebhookEvent(body, new URL(req.url).searchParams);
 *   if (event && event.topic === 'preapproval') {
 *     // refresh status from MP, update your store
 *   }
 *   return Response.json({ received: true });
 * }
 * ```
 */
export function parseWebhookEvent(
  body: unknown,
  searchParams?: URLSearchParams,
): ParsedWebhookEvent | null {
  const parseResult = WebhookBodySchema.safeParse(body ?? {});
  const parsedBody = parseResult.success ? parseResult.data : {};

  const topic =
    searchParams?.get("topic") ??
    parsedBody.topic ??
    parsedBody.type ??
    null;

  const dataId =
    searchParams?.get("id") ??
    (parsedBody.data?.id !== undefined ? String(parsedBody.data.id) : null) ??
    parsedBody.resource ??
    null;

  if (!topic || !dataId) {
    return null;
  }

  return {
    topic,
    dataId: String(dataId),
    action: parsedBody.action ?? null,
    raw: parsedBody,
  };
}

/**
 * Verify the HMAC-SHA256 signature MP sends in the `x-signature` header for
 * webhook authenticity. Returns true if the signature matches the expected
 * value derived from the integration's secret key.
 *
 * @param requestId The value of the `x-request-id` request header.
 * @param dataId The id of the resource the webhook is about (from query or body).
 * @param signatureHeader The full `x-signature` header value MP sent.
 * @param secret Your integration's webhook secret (configured in MP dev panel).
 *
 * @remarks
 * MP's `x-signature` header has the form: `ts=NNNNNNNN,v1=HEXSIGNATURE`. We
 * extract the timestamp and the v1 signature, then compute
 * `HMAC-SHA256(secret, "id:${dataId};request-id:${requestId};ts:${ts};")`
 * and compare with constant-time equality.
 */
export function verifyWebhookSignature(params: {
  requestId: string | null;
  dataId: string;
  signatureHeader: string | null;
  secret: string;
}): boolean {
  if (!params.signatureHeader || !params.requestId) return false;

  // Parse "ts=...,v1=..." into a map.
  const parts = Object.fromEntries(
    params.signatureHeader
      .split(",")
      .map((segment) => segment.trim().split("=") as [string, string]),
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${ts};`;
  const expected = createHmac("sha256", params.secret)
    .update(manifest)
    .digest("hex");

  // Constant-time comparison; lengths must match for timingSafeEqual.
  if (expected.length !== v1.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(v1));
}
