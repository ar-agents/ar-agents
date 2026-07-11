import { describe, expect, it, vi } from "vitest";
import { AgentClientError, sendAgentTurn } from "../src/agent-client";
import { userMessage } from "../src/messages";

function sseEvent(chunk: unknown): string {
  return `data: ${JSON.stringify(chunk)}\n\n`;
}

const STREAM_FIXTURE = [
  sseEvent({ type: "start" }),
  sseEvent({ type: "text-delta", id: "t1", delta: "Hola" }),
  sseEvent({ type: "text-delta", id: "t1", delta: " mundo" }),
  sseEvent({
    type: "tool-input-available",
    toolCallId: "call-1",
    toolName: "preview_society",
    input: { prompt: "peluqueria" },
  }),
  sseEvent({
    type: "tool-output-available",
    toolCallId: "call-1",
    output: { ok: true, draft: { denominacion: "Turnos SAS" } },
  }),
  sseEvent({ type: "finish" }),
].join("");

function streamBody(text: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

function fakeOkResponse(body: ReadableStream<Uint8Array>) {
  return { ok: true, status: 200, body } as unknown as Response;
}

function fakeErrorResponse(status: number, jsonBody: unknown) {
  return { ok: false, status, json: async () => jsonBody } as unknown as Response;
}

describe("sendAgentTurn", () => {
  it("posts to {baseUrl}/api/agent with the x-studio-token header and the messages body", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeOkResponse(streamBody(STREAM_FIXTURE)));
    const messages = [userMessage("hola", 0)];

    await sendAgentTurn({ baseUrl: "https://studio.example", token: "stu_secret_token", messages, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://studio.example/api/agent");
    expect(url).not.toContain("stu_secret_token");
    expect((init.headers as Record<string, string>)["x-studio-token"]).toBe("stu_secret_token");
    expect(JSON.parse(init.body as string)).toEqual({ messages });
  });

  it("returns the accumulated text and invokes onTool with (toolName, output)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeOkResponse(streamBody(STREAM_FIXTURE)));
    const onTool = vi.fn();
    const onText = vi.fn();

    const result = await sendAgentTurn({
      baseUrl: "https://studio.example",
      token: "stu_secret_token",
      messages: [userMessage("hola", 0)],
      fetchImpl,
      onText,
      onTool,
    });

    expect(result.text).toBe("Hola mundo");
    expect(result.error).toBeNull();
    expect(onText).toHaveBeenCalledWith("Hola");
    expect(onText).toHaveBeenCalledWith(" mundo");
    expect(onTool).toHaveBeenCalledWith("preview_society", { ok: true, draft: { denominacion: "Turnos SAS" } });
  });

  it("throws AgentClientError with status 402 on a cap response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(fakeErrorResponse(402, { ok: false, error: "cap" }));

    await expect(
      sendAgentTurn({
        baseUrl: "https://studio.example",
        token: "stu_secret_token",
        messages: [userMessage("hola", 0)],
        fetchImpl,
      }),
    ).rejects.toBeInstanceOf(AgentClientError);

    await expect(
      sendAgentTurn({
        baseUrl: "https://studio.example",
        token: "stu_secret_token",
        messages: [userMessage("hola", 0)],
        fetchImpl,
      }),
    ).rejects.toMatchObject({ status: 402 });
  });
});
