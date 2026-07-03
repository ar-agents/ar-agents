import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { WhatsAppClient } from "../src/client";
import {
  WhatsAppApiError,
  WhatsAppNotConfiguredError,
  WhatsAppOutsideWindowError,
  WhatsAppRecipientNotOnPlatformError,
} from "../src/errors";

const PHONE_NUMBER_ID = "TEST_PHONE_NUMBER_ID";
const ACCESS_TOKEN = "EAATEST_ACCESS_TOKEN";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function makeClient() {
  return new WhatsAppClient({
    accessToken: ACCESS_TOKEN,
    phoneNumberId: PHONE_NUMBER_ID,
  });
}

describe("WhatsAppClient construction", () => {
  it("throws WhatsAppNotConfiguredError when accessToken is missing", () => {
    expect(
      () => new WhatsAppClient({ accessToken: "", phoneNumberId: "X" } as never),
    ).toThrow(WhatsAppNotConfiguredError);
  });
  it("throws WhatsAppNotConfiguredError when phoneNumberId is missing", () => {
    expect(
      () => new WhatsAppClient({ accessToken: "X", phoneNumberId: "" } as never),
    ).toThrow(WhatsAppNotConfiguredError);
  });
});

describe("sendText", () => {
  it("posts the right body and returns the message ID", async () => {
    let captured: { url: string; body: unknown; auth: string | null } = {
      url: "",
      body: null,
      auth: null,
    };
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = {
            url: request.url,
            body: await request.json(),
            auth: request.headers.get("authorization"),
          };
          return HttpResponse.json({
            messaging_product: "whatsapp",
            contacts: [{ input: "5491112345678", wa_id: "5491112345678" }],
            messages: [{ id: "wamid.test_send" }],
          });
        },
      ),
    );

    const result = await makeClient().sendText({
      to: "+54 9 11 1234-5678",
      text: "Hola",
    });

    expect(result.messageId).toBe("wamid.test_send");
    expect(result.recipient).toBe("5491112345678");
    expect(captured.auth).toBe(`Bearer ${ACCESS_TOKEN}`);
    const body = captured.body as Record<string, unknown>;
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("5491112345678"); // normalized
    expect(body.type).toBe("text");
    expect((body.text as Record<string, unknown>).body).toBe("Hola");
  });

  it("includes context.message_id when contextMessageId is provided", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "wamid.x" }] });
        },
      ),
    );

    await makeClient().sendText({
      to: "5491112345678",
      text: "Reply",
      contextMessageId: "wamid.parent",
    });

    const body = captured as Record<string, unknown>;
    expect(body.context).toEqual({ message_id: "wamid.parent" });
  });

  it("throws WhatsAppRecipientNotOnPlatformError on Meta code 131009", async () => {
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        () =>
          HttpResponse.json(
            {
              error: {
                message: "Recipient phone number not in allowed list",
                code: 131009,
                fbtrace_id: "trace_x",
              },
            },
            { status: 400 },
          ),
      ),
    );

    await expect(
      makeClient().sendText({ to: "5491112345678", text: "x" }),
    ).rejects.toBeInstanceOf(WhatsAppRecipientNotOnPlatformError);
  });

  it("throws WhatsAppOutsideWindowError on Meta code 131026", async () => {
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        () =>
          HttpResponse.json(
            {
              error: {
                message: "Message failed to send because more than 24 hours...",
                code: 131026,
              },
            },
            { status: 400 },
          ),
      ),
    );

    await expect(
      makeClient().sendText({ to: "5491112345678", text: "x" }),
    ).rejects.toBeInstanceOf(WhatsAppOutsideWindowError);
  });

  it("throws generic WhatsAppApiError for unknown Meta codes", async () => {
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        () =>
          HttpResponse.json(
            { error: { message: "rate limited", code: 4 } },
            { status: 429 },
          ),
      ),
    );

    await expect(
      makeClient().sendText({ to: "5491112345678", text: "x" }),
    ).rejects.toBeInstanceOf(WhatsAppApiError);
  });
});

describe("sendTemplate", () => {
  it("formats template with components correctly", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "wamid.tmpl" }] });
        },
      ),
    );

    await makeClient().sendTemplate({
      to: "5491112345678",
      templateName: "order_shipped",
      languageCode: "es_AR",
      bodyParams: ["Lautaro", "OL-12345"],
    });

    const body = captured as Record<string, unknown>;
    expect(body.type).toBe("template");
    const template = body.template as Record<string, unknown>;
    expect(template.name).toBe("order_shipped");
    expect((template.language as Record<string, unknown>).code).toBe("es_AR");
    const components = template.components as unknown[];
    expect(components).toHaveLength(1);
    const bodyComponent = components[0] as Record<string, unknown>;
    expect(bodyComponent.type).toBe("body");
    const params = bodyComponent.parameters as Array<Record<string, unknown>>;
    expect(params).toHaveLength(2);
    expect(params[0]).toEqual({ type: "text", text: "Lautaro" });
    expect(params[1]).toEqual({ type: "text", text: "OL-12345" });
  });

  it("includes header component when headerParams provided", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "x" }] });
        },
      ),
    );

    await makeClient().sendTemplate({
      to: "5491112345678",
      templateName: "receipt",
      headerParams: [{ type: "image", link: "https://example.com/r.jpg" }],
      bodyParams: ["Lautaro"],
    });

    const components = ((captured as Record<string, unknown>).template as Record<
      string,
      unknown
    >).components as Array<Record<string, unknown>>;
    expect(components).toHaveLength(2);
    expect(components[0]!.type).toBe("header");
  });

  it("defaults language to es_AR when not specified", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "x" }] });
        },
      ),
    );

    await makeClient().sendTemplate({
      to: "5491112345678",
      templateName: "hello",
    });

    const lang = ((captured as Record<string, unknown>).template as Record<
      string,
      unknown
    >).language as Record<string, unknown>;
    expect(lang.code).toBe("es_AR");
  });
});

describe("sendMedia", () => {
  it("sends image with link and caption", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "wamid.img" }] });
        },
      ),
    );

    await makeClient().sendMedia({
      to: "5491112345678",
      type: "image",
      link: "https://example.com/x.jpg",
      caption: "Tu factura",
    });

    const body = captured as Record<string, unknown>;
    expect(body.type).toBe("image");
    expect(body.image).toEqual({
      link: "https://example.com/x.jpg",
      caption: "Tu factura",
    });
  });

  it("sends document with mediaId + filename", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "wamid.doc" }] });
        },
      ),
    );

    await makeClient().sendMedia({
      to: "5491112345678",
      type: "document",
      mediaId: "MEDIA_ID_DOC",
      filename: "factura.pdf",
    });

    const doc = (captured as Record<string, unknown>).document as Record<
      string,
      unknown
    >;
    expect(doc.id).toBe("MEDIA_ID_DOC");
    expect(doc.filename).toBe("factura.pdf");
  });

  it("throws when neither link nor mediaId is provided", async () => {
    await expect(
      makeClient().sendMedia({ to: "5491112345678", type: "image" }),
    ).rejects.toThrow(/link.*mediaId/i);
  });
});

describe("sendInteractive", () => {
  it("sends button reply (max 3)", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "wamid.btn" }] });
        },
      ),
    );

    await makeClient().sendInteractive({
      to: "5491112345678",
      bodyText: "¿Confirmás?",
      buttons: [
        { id: "yes", title: "Sí" },
        { id: "no", title: "No" },
      ],
    });

    const interactive = (captured as Record<string, unknown>).interactive as Record<
      string,
      unknown
    >;
    expect(interactive.type).toBe("button");
    const action = interactive.action as Record<string, unknown>;
    const buttons = action.buttons as Array<Record<string, unknown>>;
    expect(buttons).toHaveLength(2);
    expect((buttons[0]!.reply as Record<string, unknown>).id).toBe("yes");
  });

  it("sends list with sections", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ messages: [{ id: "wamid.list" }] });
        },
      ),
    );

    await makeClient().sendInteractive({
      to: "5491112345678",
      bodyText: "Elegí tu plan",
      list: {
        buttonText: "Ver planes",
        sections: [
          {
            title: "Suscripciones",
            rows: [
              { id: "basic", title: "Básico" },
              { id: "pro", title: "Pro", description: "Para PyMEs" },
            ],
          },
        ],
      },
    });

    const interactive = (captured as Record<string, unknown>).interactive as Record<
      string,
      unknown
    >;
    expect(interactive.type).toBe("list");
    const action = interactive.action as Record<string, unknown>;
    expect(action.button).toBe("Ver planes");
  });

  it("throws when both buttons + list provided", async () => {
    await expect(
      makeClient().sendInteractive({
        to: "5491112345678",
        bodyText: "x",
        buttons: [{ id: "a", title: "A" }],
        list: { buttonText: "x", sections: [{ rows: [{ id: "y", title: "Y" }] }] },
      }),
    ).rejects.toThrow(/buttons.*OR.*list/i);
  });
});

describe("markAsRead", () => {
  it("sends the read status update", async () => {
    let captured: unknown = null;
    server.use(
      http.post(
        `https://graph.facebook.com/:version/${PHONE_NUMBER_ID}/messages`,
        async ({ request }) => {
          captured = await request.json();
          return HttpResponse.json({ success: true });
        },
      ),
    );

    await makeClient().markAsRead("wamid.inbound");
    const body = captured as Record<string, unknown>;
    expect(body.status).toBe("read");
    expect(body.message_id).toBe("wamid.inbound");
  });
});

describe("send retry safety (no duplicate sends)", () => {
  // POST /messages is not idempotent and Meta exposes no idempotency key, so a
  // timed-out or 5xx'd send MUST NOT be retried — a retry could deliver the
  // same message twice.

  it("does NOT retry a send that times out (underlying fetch called once)", async () => {
    let calls = 0;
    // Simulate the AbortController firing on timeout: the real fetch rejects
    // with an AbortError-named DOMException/Error when the signal aborts.
    const timingOutFetch: typeof fetch = async () => {
      calls++;
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    };

    const client = new WhatsAppClient({
      accessToken: ACCESS_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      fetchImpl: timingOutFetch,
      maxRetries: 3, // generous budget — proves the send path opts out
      requestTimeoutMs: 50,
    });

    await expect(
      client.sendText({ to: "5491112345678", text: "x" }),
    ).rejects.toThrow(/timed out/);
    expect(calls).toBe(1);
  });

  it("does NOT retry a send that 5xx's (underlying fetch called once)", async () => {
    let calls = 0;
    const failingFetch: typeof fetch = async () => {
      calls++;
      // Real Meta 5xx body shape.
      return new Response(
        JSON.stringify({
          error: {
            message: "An unknown error occurred",
            type: "OAuthException",
            code: 1,
            fbtrace_id: "trace_5xx",
          },
        }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new WhatsAppClient({
      accessToken: ACCESS_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      fetchImpl: failingFetch,
      maxRetries: 3,
    });

    await expect(
      client.sendText({ to: "5491112345678", text: "x" }),
    ).rejects.toBeInstanceOf(WhatsAppApiError);
    expect(calls).toBe(1);
  });

  it("still retries an idempotent GET (downloadMedia) on 5xx", async () => {
    let calls = 0;
    const flakyFetch: typeof fetch = async () => {
      calls++;
      if (calls === 1) {
        return new Response(
          JSON.stringify({ error: { message: "transient", code: 1 } }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      // Real media-metadata response shape.
      return new Response(
        JSON.stringify({
          url: "https://lookaside.fbsbx.com/whatsapp_business/attachments/media",
          mime_type: "image/jpeg",
          sha256: "abc123",
          file_size: 4,
          messaging_product: "whatsapp",
          id: "MEDIA_ID",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };

    const client = new WhatsAppClient({
      accessToken: ACCESS_TOKEN,
      phoneNumberId: PHONE_NUMBER_ID,
      fetchImpl: flakyFetch,
      maxRetries: 3,
    });

    // The metadata GET 5xx's once then succeeds; only assert it retried past
    // the first metadata call (calls >= 2 means the retry happened).
    await expect(client.downloadMedia("MEDIA_ID")).resolves.toBeDefined();
    expect(calls).toBeGreaterThanOrEqual(2);
  });
});
