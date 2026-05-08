// Webhooks parser + missed_feeds replay.
//
// MELI's webhooks DON'T carry HMAC signatures (this is a documented spec
// gap; security relies on `topic` + `application_id` + IP allowlist). We
// expose a typed parser that validates the envelope shape and a separate
// `replayMissedFeeds` helper that polls `/myfeeds?app_id=...&topic=...`
// to recover events MELI dropped within the 2-day retention window.

import type { MeliClient } from "./client";
import {
  MeliWebhookEvent,
  MissedFeedsResponse,
  type MeliWebhookEvent as TMeliWebhookEvent,
  type MissedFeed,
  type MeliWebhookTopic,
} from "./schemas/webhook";
import { MeliWebhookError } from "./errors";

// ---------------------------------------------------------------------------
// Parse + validate inbound webhook
// ---------------------------------------------------------------------------

export interface ParseWebhookOptions {
  /** Optional set of topics this app subscribes to. Throws on unknown. */
  expectedTopics?: ReadonlyArray<MeliWebhookTopic | string>;
  /** Optional application_id to assert. */
  expectedApplicationId?: number;
}

export function parseWebhook(
  body: unknown,
  options: ParseWebhookOptions = {},
): TMeliWebhookEvent {
  if (!body || typeof body !== "object") {
    throw new MeliWebhookError(
      "malformed_body",
      "Webhook body is missing or not an object",
    );
  }
  const parsed = MeliWebhookEvent.safeParse(body);
  if (!parsed.success) {
    throw new MeliWebhookError(
      "malformed_body",
      `Webhook envelope failed validation: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    );
  }
  if (
    options.expectedApplicationId !== undefined &&
    parsed.data.application_id !== options.expectedApplicationId
  ) {
    throw new MeliWebhookError(
      "malformed_body",
      `Webhook application_id ${parsed.data.application_id} does not match expected ${options.expectedApplicationId}`,
    );
  }
  if (options.expectedTopics && !options.expectedTopics.includes(parsed.data.topic)) {
    throw new MeliWebhookError(
      "unknown_topic",
      `Webhook topic '${parsed.data.topic}' is not in expectedTopics (${options.expectedTopics.join(", ")})`,
    );
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------
// Resource ID extractor — pulls the numeric/string id from `resource`.
// Examples:
//   resource: "/orders/2000003508510037"      → "2000003508510037"
//   resource: "/items/MLA1234567890"          → "MLA1234567890"
//   resource: "/payments/1234"                → "1234"
//   resource: "/questions/123"                → "123"
//   resource: "/shipments/4567"               → "4567"
// ---------------------------------------------------------------------------

export function extractResourceId(event: TMeliWebhookEvent): string | null {
  const last = event.resource.split("/").filter(Boolean).pop();
  return last ?? null;
}

// ---------------------------------------------------------------------------
// Missed feeds replay — `/myfeeds?app_id=...&topic=...`
//
// MELI retains dropped events for 2 days. Call this on app boot OR on a
// schedule (every ~6h) to catch up. Pair with idempotent handlers so
// re-delivered events are safe.
// ---------------------------------------------------------------------------

export interface ReplayMissedFeedsOptions {
  appId: number;
  topic: MeliWebhookTopic | string;
  /** Optional from/to date filters (ISO 8601). */
  dateFrom?: string;
  dateTo?: string;
  /** Continuation cursor returned by previous call. */
  offset?: number;
  /** Page size, default 50. */
  limit?: number;
}

export async function replayMissedFeeds(
  client: MeliClient,
  options: ReplayMissedFeedsOptions,
): Promise<MissedFeed[]> {
  const query: Record<string, string | number> = {
    app_id: options.appId,
    topic: String(options.topic),
  };
  if (options.dateFrom) query["date_from"] = options.dateFrom;
  if (options.dateTo) query["date_to"] = options.dateTo;
  if (options.offset !== undefined) query["offset"] = options.offset;
  if (options.limit) query["limit"] = options.limit;
  return client.fetch<MissedFeed[]>({
    method: "GET",
    path: `/myfeeds`,
    query,
    responseSchema: MissedFeedsResponse,
  });
}

/**
 * Iterate ALL missed feeds across topics. For each topic in `topics`,
 * pages through the feed and yields one event at a time.
 *
 * Use this when an app comes back online after >5 minutes of downtime —
 * it'll replay everything MELI tried to deliver while you were away,
 * within the 2-day retention window.
 */
export async function* iterateAllMissedFeeds(
  client: MeliClient,
  appId: number,
  topics: ReadonlyArray<MeliWebhookTopic | string>,
  dateFrom?: string,
): AsyncGenerator<MissedFeed, void, void> {
  for (const topic of topics) {
    let offset = 0;
    while (true) {
      const opts: ReplayMissedFeedsOptions = { appId, topic, offset, limit: 100 };
      if (dateFrom !== undefined) opts.dateFrom = dateFrom;
      const page = await replayMissedFeeds(client, opts);
      if (page.length === 0) break;
      for (const event of page) yield event;
      if (page.length < 100) break;
      offset += page.length;
    }
  }
}
