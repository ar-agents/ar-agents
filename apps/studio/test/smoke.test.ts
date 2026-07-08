import { describe, expect, it } from "vitest";
import { GET } from "../src/app/api/health/route";
import {
  BACKEND_NOT_WIRED_MESSAGE,
  describeAgentResponseStatus,
  GENERIC_ERROR_MESSAGE,
} from "../src/lib/chat-status";

describe("GET /api/health", () => {
  it("returns ok:true with the app name", async () => {
    const res = await GET();
    const body = (await res.json()) as { ok: boolean; app: string };
    expect(body.ok).toBe(true);
    expect(body.app).toBe("studio");
  });
});

describe("describeAgentResponseStatus", () => {
  it("returns null for a 2xx response (success, no message to show)", () => {
    expect(describeAgentResponseStatus(200)).toBeNull();
    expect(describeAgentResponseStatus(201)).toBeNull();
  });

  it("returns the backend-not-wired message for 404", () => {
    expect(describeAgentResponseStatus(404)).toBe(BACKEND_NOT_WIRED_MESSAGE);
  });

  it("returns the generic error message for other non-2xx statuses", () => {
    expect(describeAgentResponseStatus(500)).toBe(GENERIC_ERROR_MESSAGE);
    expect(describeAgentResponseStatus(400)).toBe(GENERIC_ERROR_MESSAGE);
  });

  it("returns the generic error message for a null status (network failure)", () => {
    expect(describeAgentResponseStatus(null)).toBe(GENERIC_ERROR_MESSAGE);
  });
});
