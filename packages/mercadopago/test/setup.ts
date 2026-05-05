import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll } from "vitest";
import { buildHandlers, FakeMpStore } from "./fixtures/mp-handlers";

export const fakeMp = new FakeMpStore();
export const server = setupServer(...buildHandlers(fakeMp));

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  fakeMp.reset();
  server.resetHandlers();
});
afterAll(() => server.close());
