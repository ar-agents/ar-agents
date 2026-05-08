import { describe, it, expect } from "vitest";
import { mockFetch, makeMeliClient } from "../src/testing";
import {
  parseWebhook,
  extractResourceId,
  replayMissedFeeds,
  iterateAllMissedFeeds,
} from "../src";
import { MeliWebhookError } from "../src/errors";

const WEBHOOK_FIXTURE = {
  _id: "abc-1",
  resource: "/orders/2000003508510037",
  user_id: 12345,
  topic: "orders_v2",
  application_id: 999,
  attempts: 1,
  sent: "2026-05-09T01:23:45.000Z",
};

describe("parseWebhook", () => {
  it("parses a typed event", () => {
    const evt = parseWebhook(WEBHOOK_FIXTURE);
    expect(evt.topic).toBe("orders_v2");
    expect(evt.user_id).toBe(12345);
  });

  it("rejects bodies that aren't objects", () => {
    expect(() => parseWebhook(null)).toThrow(MeliWebhookError);
    expect(() => parseWebhook("string")).toThrow(MeliWebhookError);
  });

  it("rejects bodies missing required fields", () => {
    expect(() => parseWebhook({ resource: "/x" })).toThrow(MeliWebhookError);
  });

  it("validates expectedTopics filter", () => {
    expect(() =>
      parseWebhook(WEBHOOK_FIXTURE, { expectedTopics: ["claims"] }),
    ).toThrow(MeliWebhookError);
    expect(() =>
      parseWebhook(WEBHOOK_FIXTURE, { expectedTopics: ["orders_v2"] }),
    ).not.toThrow();
  });

  it("validates application_id when configured", () => {
    expect(() =>
      parseWebhook(WEBHOOK_FIXTURE, { expectedApplicationId: 1 }),
    ).toThrow(MeliWebhookError);
    expect(() =>
      parseWebhook(WEBHOOK_FIXTURE, { expectedApplicationId: 999 }),
    ).not.toThrow();
  });
});

describe("extractResourceId", () => {
  it("returns the trailing segment from a resource path", () => {
    const evt = parseWebhook(WEBHOOK_FIXTURE);
    expect(extractResourceId(evt)).toBe("2000003508510037");
  });

  it("works for item-shaped resources", () => {
    const evt = parseWebhook({ ...WEBHOOK_FIXTURE, resource: "/items/MLA12345" });
    expect(extractResourceId(evt)).toBe("MLA12345");
  });
});

describe("replayMissedFeeds", () => {
  it("hits /myfeeds with app_id and topic", async () => {
    const fm = mockFetch()
      .on("GET", "/myfeeds", () => ({
        status: 200,
        body: [
          {
            resource: "/orders/1",
            user_id: 12345,
            topic: "orders_v2",
            application_id: 999,
          },
        ],
      }))
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const r = await replayMissedFeeds(client, {
      appId: 999,
      topic: "orders_v2",
    });
    expect(r).toHaveLength(1);
    const url = new URL(fm.requests[0]!.url);
    expect(url.searchParams.get("app_id")).toBe("999");
    expect(url.searchParams.get("topic")).toBe("orders_v2");
  });

  it("iterateAllMissedFeeds pages until empty across topics", async () => {
    let pages = 0;
    const fm = mockFetch()
      .on("GET", "/myfeeds", () => {
        pages++;
        if (pages === 1)
          return {
            status: 200,
            body: Array.from({ length: 100 }, (_, i) => ({
              resource: `/orders/${i}`,
              user_id: 12345,
              topic: "orders_v2",
              application_id: 999,
            })),
          };
        if (pages === 2) {
          return {
            status: 200,
            body: [
              {
                resource: "/orders/200",
                user_id: 12345,
                topic: "orders_v2",
                application_id: 999,
              },
            ],
          };
        }
        return { status: 200, body: [] };
      })
      .build();
    const client = makeMeliClient({ fetch: fm.fetch });
    const collected: string[] = [];
    for await (const event of iterateAllMissedFeeds(client, 999, ["orders_v2"])) {
      collected.push(event.resource);
    }
    expect(collected).toHaveLength(101);
  });
});
