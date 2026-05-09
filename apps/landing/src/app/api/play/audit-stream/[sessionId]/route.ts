/**
 * `GET /api/play/audit-stream/[sessionId]` — SSE live-stream of audit
 * entries for a session.
 *
 * Use case: a /dashboard page wants to update in real-time as the agent
 * loop writes new tool calls. A compliance-side ops dashboard wants to
 * watch a tenant's session live and alert on tampering. A customer
 * support tool watching their own session in case the operator tampers.
 *
 * Implementation: polling-based delta detection with a 2-second tick.
 * Each tick reads the audit log, diffs against the last sent state,
 * and pushes new entries as `event: entry` SSE messages. Sends a
 * `event: ping` keep-alive every 15s. Closes the stream after 5 minutes
 * of total uptime — clients should reconnect (EventSource auto-handles
 * this) to bound server memory.
 *
 * Why polling vs Redis pub/sub: the audit log already lives in Vercel KV.
 * Adding a separate pub/sub channel doubles the failure modes (entry
 * lands in KV but pub/sub message lost; vice versa). Polling against
 * the same KV is simpler + idempotent — duplicate ticks read the same
 * state and emit no events. The 2s tick is well under what KV can
 * sustain.
 *
 * The endpoint is intentionally unauthenticated (matches the rest of
 * the audit-log surface). Session ids are UUIDs/tokens, not enumerable.
 * If a regulator wants a private session they can pass an
 * AUDIT_HMAC_SECRET-rotated id; the public-readability is a feature for
 * RFC-001 § 9.2's probative-value claim.
 */

import { isSessionIdValid, readAudit, type AuditEntry } from "@/lib/audit";
import { sseLine } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 minutes — see cap below.

const TICK_INTERVAL_MS = 2_000;
const KEEPALIVE_INTERVAL_MS = 15_000;
const MAX_UPTIME_MS = 5 * 60 * 1000; // 5 minutes; clients reconnect.

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await ctx.params;
  if (!isSessionIdValid(sessionId)) {
    return new Response(JSON.stringify({ error: "invalid_session_id" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const startedAt = Date.now();
  let sentIds = new Set<string>();
  let lastKeepAliveAt = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial snapshot so clients don't have to fetch + then subscribe.
      try {
        const initial = await readAudit(sessionId);
        for (const entry of initial) {
          controller.enqueue(encoder.encode(sseLine("entry", entry)));
          sentIds.add(entry.id);
        }
        controller.enqueue(
          encoder.encode(
            sseLine("snapshot-complete", {
              count: initial.length,
              sessionId,
              startedAt: new Date(startedAt).toISOString(),
            }),
          ),
        );
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            sseLine("error", {
              message: err instanceof Error ? err.message : String(err),
            }),
          ),
        );
      }

      // Tick-loop: poll for new entries every TICK_INTERVAL_MS, send
      // keep-alive every KEEPALIVE_INTERVAL_MS, terminate after
      // MAX_UPTIME_MS. Clients reconnect via EventSource for longer
      // sessions.
      const interval = setInterval(async () => {
        try {
          const entries = await readAudit(sessionId);
          const newOnes: AuditEntry[] = [];
          for (const e of entries) {
            if (!sentIds.has(e.id)) {
              newOnes.push(e);
              sentIds.add(e.id);
            }
          }
          for (const e of newOnes) {
            controller.enqueue(encoder.encode(sseLine("entry", e)));
          }

          const now = Date.now();
          if (now - lastKeepAliveAt >= KEEPALIVE_INTERVAL_MS) {
            controller.enqueue(
              encoder.encode(
                sseLine("ping", {
                  ts: new Date(now).toISOString(),
                  totalSeen: sentIds.size,
                }),
              ),
            );
            lastKeepAliveAt = now;
          }

          if (now - startedAt >= MAX_UPTIME_MS) {
            controller.enqueue(
              encoder.encode(
                sseLine("end", {
                  reason: "max-uptime",
                  uptimeMs: now - startedAt,
                  totalSent: sentIds.size,
                  reconnectAdvice: "EventSource auto-reconnects; clients should keep the page open.",
                }),
              ),
            );
            clearInterval(interval);
            controller.close();
          }
        } catch (err) {
          controller.enqueue(
            encoder.encode(
              sseLine("error", {
                message: err instanceof Error ? err.message : String(err),
              }),
            ),
          );
        }
      }, TICK_INTERVAL_MS);

      // Best-effort cleanup if the runtime kills the stream early.
      // (Edge runtime supports `signal` here; nodejs runtime gets the
      // GC sweep.)
    },
    cancel() {
      // No-op — the interval is cleared above when we close, and the
      // stream's natural GC handles abandonment.
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-store, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no", // disable nginx-style buffering
    },
  });
}
