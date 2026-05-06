/**
 * Webhook helpers — parse incoming MP notifications and verify the
 * HMAC-SHA256 signature MP sends in the `x-signature` header.
 *
 * # Edge Runtime
 *
 * Both `verifyWebhookSignature` and `parseWebhookEvent` work in Vercel
 * Edge Runtime, Cloudflare Workers, Deno, browsers, and Node 18+. The
 * HMAC verification uses Web Crypto under the hood (see `./crypto.ts`)
 * and is **async** — make sure to `await` the call.
 */

import { hmacSha256Hex, timingSafeEqualHex } from "./crypto";
import { WebhookBodySchema, type ParsedWebhookEvent } from "./types";

/**
 * Parse a Mercado Pago webhook from the raw request body and URL search params.
 * MP sends the topic and resource id in EITHER the URL query string OR the
 * body, depending on integration version — this normalizes both shapes into a
 * single structure.
 *
 * **Pure function — synchronous, no I/O.**
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
 * Maximum age (in seconds) of a webhook before it's considered stale and
 * potentially a replay attack. Default: 5 minutes.
 *
 * MP webhooks include a `ts` (unix seconds) in the `x-signature` header.
 * If the difference between `ts` and current time exceeds this tolerance,
 * `verifyWebhookSignature` returns `false`. Set higher only if your network
 * has known clock skew or proxy delays.
 */
export const DEFAULT_REPLAY_TOLERANCE_SECONDS = 300;

/**
 * Verify the HMAC-SHA256 signature MP sends in the `x-signature` header for
 * webhook authenticity. Returns true if the signature matches the expected
 * value derived from the integration's secret key AND the timestamp is
 * within the replay-tolerance window.
 *
 * **Async** — runs on Web Crypto under the hood, works in Edge Runtime.
 *
 * @param requestId The value of the `x-request-id` request header.
 * @param dataId The id of the resource the webhook is about (from query or body).
 * @param signatureHeader The full `x-signature` header value MP sent.
 * @param secret Your integration's webhook secret (configured in MP dev panel).
 * @param replayToleranceSeconds Optional override. Default 300s (5 min).
 *
 * @remarks
 * MP's `x-signature` header has the form: `ts=NNNNNNNN,v1=HEXSIGNATURE`. We
 * extract the timestamp and the v1 signature, then compute
 * `HMAC-SHA256(secret, "id:${dataId};request-id:${requestId};ts:${ts};")`
 * and compare with constant-time equality.
 *
 * **Replay protection**: rejects signatures whose `ts` is older than
 * `replayToleranceSeconds` (default 5min) — prevents an attacker who
 * captured a valid webhook from replaying it later.
 */
export async function verifyWebhookSignature(params: {
  requestId: string | null;
  dataId: string;
  signatureHeader: string | null;
  secret: string;
  replayToleranceSeconds?: number;
}): Promise<boolean> {
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

  // Replay protection: reject signatures older than the tolerance window.
  const tolerance = params.replayToleranceSeconds ?? DEFAULT_REPLAY_TOLERANCE_SECONDS;
  const tsNumber = Number(ts);
  if (!Number.isFinite(tsNumber)) return false;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - tsNumber);
  if (ageSeconds > tolerance) return false;

  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${ts};`;
  const expected = await hmacSha256Hex(params.secret, manifest);

  return timingSafeEqualHex(expected, v1);
}
