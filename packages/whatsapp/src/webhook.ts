import { createHmac, timingSafeEqual } from "node:crypto";
import { WhatsAppWebhookSignatureError } from "./errors";
import type { WebhookEvent } from "./types";

/**
 * Verify the GET handshake Meta sends when you first subscribe a webhook URL.
 * Meta calls your endpoint with `?hub.mode=subscribe&hub.verify_token=X&hub.challenge=Y`.
 * You must return `hub.challenge` as plain text IF the token matches.
 *
 * @example
 * ```ts
 * // GET /api/whatsapp/webhook
 * const challenge = verifyWebhookSubscription(
 *   Object.fromEntries(new URL(req.url).searchParams),
 *   process.env.WA_WEBHOOK_VERIFY_TOKEN!,
 * );
 * if (challenge !== null) return new Response(challenge);
 * return new Response("Forbidden", { status: 403 });
 * ```
 *
 * Returns the challenge string to echo back, or null if the request should
 * be rejected with 403.
 */
export function verifyWebhookSubscription(
  query: Record<string, string | string[] | undefined>,
  expectedToken: string,
): string | null {
  const mode = singleValue(query["hub.mode"]);
  const token = singleValue(query["hub.verify_token"]);
  const challenge = singleValue(query["hub.challenge"]);
  if (mode === "subscribe" && token === expectedToken && typeof challenge === "string") {
    return challenge;
  }
  return null;
}

function singleValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/**
 * Verify the X-Hub-Signature-256 header on POST webhooks. Meta signs the raw
 * request body with HMAC-SHA256 using your app secret.
 *
 * **Pass the RAW body** — not the parsed JSON. If you've already parsed,
 * `JSON.stringify(parsed)` will not match the signature because key ordering
 * and whitespace differ. Use `req.text()` (Web standard) or `req.rawBody`
 * (Express) before parsing.
 *
 * Throws `WhatsAppWebhookSignatureError` if invalid. Catch and return 401.
 *
 * @example
 * ```ts
 * const raw = await req.text();
 * verifyWebhookSignature(
 *   raw,
 *   req.headers.get("x-hub-signature-256") ?? "",
 *   process.env.META_APP_SECRET!,
 * );
 * const event = parseWebhookEvent(JSON.parse(raw));
 * ```
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  appSecret: string,
): void {
  const expected =
    "sha256=" + createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  // Constant-time compare to defang timing attacks.
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    throw new WhatsAppWebhookSignatureError(
      "X-Hub-Signature-256 mismatch — request is not from Meta or app secret is wrong",
    );
  }
}

/**
 * Parse Meta's nested webhook envelope into a normalized `WebhookEvent`.
 *
 * # Meta's envelope shape
 *
 * Meta wraps EVERYTHING in a deeply nested structure. A single inbound
 * message looks like:
 *
 * ```
 * { object: "whatsapp_business_account",
 *   entry: [{ id: "...", changes: [{
 *     field: "messages",
 *     value: {
 *       messaging_product: "whatsapp",
 *       metadata: { phone_number_id: "...", display_phone_number: "..." },
 *       contacts: [{ profile: { name: "Lautaro" }, wa_id: "5491112345678" }],
 *       messages: [{ from: "5491112345678", id: "wamid....", timestamp: "...",
 *                    type: "text", text: { body: "..." } }]
 *     }
 *   }]}]
 * }
 * ```
 *
 * This function flattens that into one `WebhookEvent` per actual message or
 * status update. A single Meta payload can contain MULTIPLE events — see
 * `parseWebhookEvents` (plural) if you need them all.
 *
 * Returns the FIRST event in the payload (most webhooks deliver one event
 * per request). Use `parseWebhookEvents` for batches.
 */
export function parseWebhookEvent(payload: unknown): WebhookEvent {
  const events = parseWebhookEvents(payload);
  return events[0] ?? { kind: "unknown", raw: payload };
}

/**
 * Parse Meta's webhook envelope into ALL contained events. Meta can batch
 * status updates — you might get 3 status events in one POST.
 */
export function parseWebhookEvents(payload: unknown): WebhookEvent[] {
  const events: WebhookEvent[] = [];
  const obj = payload as Record<string, unknown>;
  if (!obj || typeof obj !== "object") {
    return [{ kind: "unknown", raw: payload }];
  }
  const entries = Array.isArray(obj.entry) ? obj.entry : [];
  for (const entry of entries) {
    const entryObj = entry as Record<string, unknown>;
    const changes = Array.isArray(entryObj.changes) ? entryObj.changes : [];
    for (const change of changes) {
      const changeObj = change as Record<string, unknown>;
      if (changeObj.field !== "messages") continue;
      const value = changeObj.value as Record<string, unknown> | undefined;
      if (!value) continue;

      const phoneNumberId =
        ((value.metadata as Record<string, unknown> | undefined)?.phone_number_id as string) ??
        "";

      // Inbound messages
      const messages = Array.isArray(value.messages) ? value.messages : [];
      const contacts = Array.isArray(value.contacts) ? value.contacts : [];
      for (const m of messages) {
        events.push(buildMessageEvent(m, contacts, phoneNumberId));
      }

      // Status updates
      const statuses = Array.isArray(value.statuses) ? value.statuses : [];
      for (const s of statuses) {
        events.push(buildStatusEvent(s, phoneNumberId));
      }
    }
  }
  return events;
}

function buildMessageEvent(
  raw: unknown,
  contacts: unknown[],
  phoneNumberId: string,
): WebhookEvent {
  const m = raw as Record<string, unknown>;
  const from = (m.from as string) ?? "";
  const fromName =
    ((contacts.find(
      (c) => (c as Record<string, unknown>).wa_id === from,
    ) as Record<string, unknown> | undefined)?.profile as
      | Record<string, unknown>
      | undefined)?.name as string | undefined;

  const messageId = (m.id as string) ?? "";
  const timestamp = (m.timestamp as string) ?? "";
  const contextMessageId =
    ((m.context as Record<string, unknown> | undefined)?.id as string) ?? null;

  const type = m.type as string;
  let message: ReturnType<typeof buildMessageBody>;
  try {
    message = buildMessageBody(type, m);
  } catch {
    message = { type: "unsupported", raw: m };
  }

  return {
    kind: "message",
    phoneNumberId,
    from,
    fromName: fromName ?? null,
    messageId,
    timestamp,
    message,
    contextMessageId,
  };
}

type MessageBody = Extract<WebhookEvent, { kind: "message" }>["message"];

function buildMessageBody(type: string, m: Record<string, unknown>): MessageBody {
  switch (type) {
    case "text": {
      const text = (m.text as Record<string, unknown> | undefined)?.body as string;
      return { type: "text", text: text ?? "" };
    }
    case "image": {
      const img = m.image as Record<string, unknown> | undefined;
      return {
        type: "image",
        mediaId: (img?.id as string) ?? "",
        caption: (img?.caption as string) ?? null,
        mimeType: (img?.mime_type as string) ?? null,
      };
    }
    case "audio": {
      const a = m.audio as Record<string, unknown> | undefined;
      return {
        type: "audio",
        mediaId: (a?.id as string) ?? "",
        mimeType: (a?.mime_type as string) ?? null,
        voice: Boolean(a?.voice),
      };
    }
    case "video": {
      const v = m.video as Record<string, unknown> | undefined;
      return {
        type: "video",
        mediaId: (v?.id as string) ?? "",
        caption: (v?.caption as string) ?? null,
        mimeType: (v?.mime_type as string) ?? null,
      };
    }
    case "document": {
      const d = m.document as Record<string, unknown> | undefined;
      return {
        type: "document",
        mediaId: (d?.id as string) ?? "",
        filename: (d?.filename as string) ?? null,
        mimeType: (d?.mime_type as string) ?? null,
      };
    }
    case "location": {
      const l = m.location as Record<string, unknown> | undefined;
      return {
        type: "location",
        latitude: Number(l?.latitude ?? 0),
        longitude: Number(l?.longitude ?? 0),
        name: (l?.name as string) ?? null,
        address: (l?.address as string) ?? null,
      };
    }
    case "contacts": {
      return { type: "contacts", raw: m.contacts };
    }
    case "interactive": {
      const i = m.interactive as Record<string, unknown> | undefined;
      const subtype = i?.type as string;
      if (subtype === "button_reply") {
        const r = i?.button_reply as Record<string, unknown> | undefined;
        return {
          type: "interactive",
          subtype: "button_reply",
          id: (r?.id as string) ?? "",
          title: (r?.title as string) ?? "",
        };
      }
      if (subtype === "list_reply") {
        const r = i?.list_reply as Record<string, unknown> | undefined;
        return {
          type: "interactive",
          subtype: "list_reply",
          id: (r?.id as string) ?? "",
          title: (r?.title as string) ?? "",
        };
      }
      return { type: "unsupported", raw: m };
    }
    case "button": {
      const b = m.button as Record<string, unknown> | undefined;
      return {
        type: "button",
        payload: (b?.payload as string) ?? "",
        text: (b?.text as string) ?? "",
      };
    }
    case "reaction": {
      const r = m.reaction as Record<string, unknown> | undefined;
      return {
        type: "reaction",
        emoji: (r?.emoji as string) ?? "",
        targetMessageId: (r?.message_id as string) ?? "",
      };
    }
    default:
      return { type: "unsupported", raw: m };
  }
}

function buildStatusEvent(raw: unknown, phoneNumberId: string): WebhookEvent {
  const s = raw as Record<string, unknown>;
  const errorsRaw = Array.isArray(s.errors) ? s.errors : [];
  const errors = errorsRaw.map((e) => {
    const eo = e as Record<string, unknown>;
    return {
      code: Number(eo.code ?? 0),
      title: (eo.title as string) ?? "",
      details: (eo.message as string) ?? (eo.error_data as string) ?? null,
    };
  });
  return {
    kind: "status",
    phoneNumberId,
    messageId: (s.id as string) ?? "",
    status: (s.status as "sent" | "delivered" | "read" | "failed" | "warning") ?? "sent",
    recipient: (s.recipient_id as string) ?? "",
    timestamp: (s.timestamp as string) ?? "",
    errors,
  };
}
