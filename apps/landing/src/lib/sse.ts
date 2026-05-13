/**
 * Minimal Server-Sent Events helpers. The format is text-line-oriented:
 *
 *   event: <name>\n
 *   data: <payload>\n
 *   \n
 *
 * The double newline after `data` terminates the event. Optional fields
 * `id`, `retry` are supported but not used here. The format is locked
 * by the WHATWG Server-Sent Events spec.
 *
 * These helpers are pure (no streams, no globals) so they're trivially
 * unit-testable. The route handler in /api/play/audit-stream/[sessionId]
 * stitches them into a Response stream.
 */

/**
 * Format a single SSE event. Stringify the payload to JSON. The function
 * is total, non-finite numbers in payload become `null` per JSON spec.
 */
export function sseLine(event: string, data: unknown): string {
  if (!isValidEventName(event)) {
    throw new Error(
      `Invalid SSE event name: ${JSON.stringify(event)}, must be a non-empty single-line ASCII identifier.`,
    );
  }
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Encode a comment line. Useful as a keepalive that doesn't fire any
 * client-side handler. The line MUST start with a colon. Browsers ignore.
 */
export function sseComment(text: string): string {
  // Replace newlines so we don't end the comment line early.
  const safe = text.replace(/[\r\n]+/g, " ");
  return `: ${safe}\n\n`;
}

const EVENT_NAME_RE = /^[A-Za-z][A-Za-z0-9_.-]*$/;

export function isValidEventName(s: unknown): s is string {
  return typeof s === "string" && s.length > 0 && s.length <= 64 && EVENT_NAME_RE.test(s);
}

/**
 * Parse a buffer of incoming SSE text into discrete events. Useful for
 * building tests of an SSE consumer or for rough JS clients. Doesn't
 * implement reconnection or `id` tracking.
 */
export function parseSseBuffer(
  buffer: string,
): { event: string; data: string }[] {
  const events: { event: string; data: string }[] = [];
  const blocks = buffer.split(/\n\n/);
  for (const block of blocks) {
    if (!block.trim() || block.trim().startsWith(":")) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split(/\n/)) {
      if (line.startsWith("event: ")) {
        event = line.slice(7);
      } else if (line.startsWith("data: ")) {
        dataLines.push(line.slice(6));
      }
    }
    if (dataLines.length > 0) {
      events.push({ event, data: dataLines.join("\n") });
    }
  }
  return events;
}
