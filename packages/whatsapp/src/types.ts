import { z } from "zod";

/**
 * The phone number ID assigned by Meta to a WhatsApp Business Account number.
 * NOT the user-visible phone number — it's a numeric ID like `123456789012345`.
 * Find it in Meta Business Suite → WhatsApp → API Setup.
 */
export type PhoneNumberId = string;

/**
 * Recipient phone number in E.164 format WITHOUT the leading `+`. Examples:
 * `5491112345678` (Argentina), `14155552671` (US). The `normalizeArPhone`
 * helper accepts AR variants and produces this shape.
 */
export type WhatsAppRecipient = string;

/** A WhatsApp message ID returned by the Cloud API after a successful send. */
export type WhatsAppMessageId = string;

/** Result of any send_* tool — the wamid plus echoed recipient/timestamp. */
export const SendResultSchema = z.object({
  /** Meta-issued message ID. Use this to reference the message in webhooks. */
  messageId: z.string(),
  /** Echo of the recipient phone (E.164 no +). */
  recipient: z.string(),
  /** Server-side timestamp. */
  timestamp: z.string().optional(),
});
export type SendResult = z.infer<typeof SendResultSchema>;

/** Inbound webhook event — normalized from Meta's nested envelope. */
export type WebhookEvent =
  | InboundMessageEvent
  | StatusUpdateEvent
  | UnknownEvent;

export interface InboundMessageEvent {
  kind: "message";
  /** Phone number ID that received the message (your WABA number). */
  phoneNumberId: PhoneNumberId;
  /** Sender's phone in E.164 (no +). */
  from: WhatsAppRecipient;
  /** Display name of the sender (set in their WhatsApp profile). */
  fromName: string | null;
  /** Meta-issued message ID. */
  messageId: WhatsAppMessageId;
  /** Unix epoch seconds, as a string (Meta's format). */
  timestamp: string;
  /** Message body — discriminated by type. */
  message:
    | { type: "text"; text: string }
    | { type: "image"; mediaId: string; caption: string | null; mimeType: string | null }
    | { type: "audio"; mediaId: string; mimeType: string | null; voice: boolean }
    | { type: "video"; mediaId: string; caption: string | null; mimeType: string | null }
    | { type: "document"; mediaId: string; filename: string | null; mimeType: string | null }
    | { type: "location"; latitude: number; longitude: number; name: string | null; address: string | null }
    | { type: "contacts"; raw: unknown }
    | { type: "interactive"; subtype: "button_reply" | "list_reply"; id: string; title: string }
    | { type: "button"; payload: string; text: string }
    | { type: "reaction"; emoji: string; targetMessageId: string }
    | { type: "unsupported"; raw: unknown };
  /** If this message is a reply, the wamid of the message it replies to. */
  contextMessageId: string | null;
}

export interface StatusUpdateEvent {
  kind: "status";
  phoneNumberId: PhoneNumberId;
  /** wamid of the original outbound message this status refers to. */
  messageId: WhatsAppMessageId;
  /** sent → delivered → read → failed. */
  status: "sent" | "delivered" | "read" | "failed" | "warning";
  recipient: WhatsAppRecipient;
  timestamp: string;
  /** When status === "failed", structured error info from Meta. */
  errors: Array<{ code: number; title: string; details: string | null }>;
}

export interface UnknownEvent {
  kind: "unknown";
  raw: unknown;
}

/** Configuration accepted by `WhatsAppClient`. */
export interface WhatsAppClientOptions {
  /** Permanent or system-user access token from Meta. Required. */
  accessToken: string;
  /** WABA phone number ID (numeric string from Meta dashboard). Required. */
  phoneNumberId: PhoneNumberId;
  /**
   * Escape hatch for browser-context tests (e.g., jsdom). MUST NOT be set
   * in production code — the constructor's browser-context check exists
   * specifically to prevent the Meta access token from being bundled into
   * a client-side JavaScript bundle.
   */
  __allowBrowser?: boolean;
  /** Graph API version. Default `"v21.0"`. */
  apiVersion?: string;
  /** Override Graph base URL (testing). */
  baseUrl?: string;
  /** Custom fetch (testing). */
  fetchImpl?: typeof fetch;
  /**
   * Per-request timeout in ms. Aborts via AbortSignal and throws if exceeded.
   * Default 30_000 (30s).
   */
  requestTimeoutMs?: number;
  /**
   * Number of retries on 5xx + network errors. Default 1. 4xx never retried
   * (Meta's user/config errors). Exponential backoff starting at 250ms.
   */
  maxRetries?: number;
  /**
   * Observability hook fired AFTER every request (success or failure).
   * Synchronous, fire-and-forget — useful for logging / metrics / tracing.
   */
  onCall?: (event: {
    method: string;
    path: string;
    durationMs: number;
    httpStatus: number | null;
    retried: number;
    success: boolean;
  }) => void;
}
