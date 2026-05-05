import {
  WhatsAppApiError,
  WhatsAppNotConfiguredError,
  WhatsAppOutsideWindowError,
  WhatsAppRecipientNotOnPlatformError,
} from "./errors";
import { normalizeArPhone } from "./phone";
import type {
  PhoneNumberId,
  SendResult,
  WhatsAppClientOptions,
  WhatsAppRecipient,
} from "./types";

const DEFAULT_API_VERSION = "v21.0";
const DEFAULT_BASE_URL = "https://graph.facebook.com";

/**
 * Thin client over Meta's WhatsApp Business Cloud API.
 *
 * # Surface
 *
 * - `sendText` — free-form text to a recipient (within the 24-hour customer
 *   service window).
 * - `sendTemplate` — approved template (any time; works outside the 24h
 *   window). Required for proactive marketing/transactional messages.
 * - `sendMedia` — image/audio/video/document by URL or pre-uploaded media ID.
 * - `sendInteractive` — buttons or list pickers for in-chat actions.
 * - `markAsRead` — flip the inbound message to "read" (blue checkmarks).
 * - `downloadMedia` — fetch a media file the user sent you (requires the
 *   `mediaId` from the inbound webhook).
 *
 * # Auth
 *
 * Pass a permanent or system-user access token from Meta. The token is sent
 * as `Authorization: Bearer ...` on every request — do NOT log it.
 *
 * # Error handling
 *
 * Methods throw typed errors (`WhatsAppApiError` and subclasses) when Meta
 * returns 4xx. Common subclasses:
 * - `WhatsAppRecipientNotOnPlatformError` (Meta code 131009)
 * - `WhatsAppOutsideWindowError` (131026/131047)
 *
 * Catch and surface to the agent — DON'T regex error messages.
 */
export class WhatsAppClient {
  private readonly accessToken: string;
  private readonly phoneNumberId: PhoneNumberId;
  private readonly apiVersion: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch | undefined;

  constructor(options: WhatsAppClientOptions) {
    if (!options.accessToken || !options.phoneNumberId) {
      throw new WhatsAppNotConfiguredError();
    }
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = options.fetchImpl;
  }

  /**
   * Send a plain text message. Only works within the 24-hour customer service
   * window (Meta restriction). Outside the window, use `sendTemplate`.
   *
   * @example
   * ```ts
   * await wa.sendText({
   *   to: "5491112345678",
   *   text: "Hola Lautaro, tu pedido ya salió.",
   * });
   * ```
   */
  async sendText(params: {
    to: WhatsAppRecipient;
    text: string;
    /**
     * Enable URL preview cards. Default `true` to match WhatsApp UX
     * expectations (links render as previews automatically).
     */
    previewUrl?: boolean;
    /** wamid of the message to reply to (creates threaded reply). */
    contextMessageId?: string;
  }): Promise<SendResult> {
    const recipient = normalizeArPhone(params.to);
    const body: Record<string, unknown> = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "text",
      text: {
        body: params.text,
        preview_url: params.previewUrl ?? true,
      },
    };
    if (params.contextMessageId) {
      body.context = { message_id: params.contextMessageId };
    }
    const res = await this.postMessages(body);
    return this.toSendResult(res, recipient);
  }

  /**
   * Send a pre-approved template message. Required for messages outside the
   * 24-hour window (transactional, marketing, utility).
   *
   * Templates must be created and approved in Meta Business Suite first.
   *
   * @example
   * ```ts
   * await wa.sendTemplate({
   *   to: "5491112345678",
   *   templateName: "order_shipped",
   *   languageCode: "es_AR",
   *   bodyParams: ["Lautaro", "OL-12345"],
   * });
   * ```
   */
  async sendTemplate(params: {
    to: WhatsAppRecipient;
    /** Exact template name as registered in Meta. */
    templateName: string;
    /** Language code, e.g., "es_AR", "es", "en_US". */
    languageCode?: string;
    /** Positional parameters for the template body, in order. */
    bodyParams?: string[];
    /** Optional positional parameters for the header (text or media). */
    headerParams?: Array<
      | { type: "text"; text: string }
      | { type: "image"; link: string }
      | { type: "document"; link: string; filename?: string }
      | { type: "video"; link: string }
    >;
  }): Promise<SendResult> {
    const recipient = normalizeArPhone(params.to);
    const components: unknown[] = [];

    if (params.headerParams && params.headerParams.length > 0) {
      components.push({
        type: "header",
        parameters: params.headerParams.map((p) => {
          if (p.type === "text") return { type: "text", text: p.text };
          if (p.type === "image") return { type: "image", image: { link: p.link } };
          if (p.type === "video") return { type: "video", video: { link: p.link } };
          return {
            type: "document",
            document: { link: p.link, filename: p.filename },
          };
        }),
      });
    }

    if (params.bodyParams && params.bodyParams.length > 0) {
      components.push({
        type: "body",
        parameters: params.bodyParams.map((text) => ({ type: "text", text })),
      });
    }

    const body = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: params.templateName,
        language: { code: params.languageCode ?? "es_AR" },
        ...(components.length > 0 ? { components } : {}),
      },
    };
    const res = await this.postMessages(body);
    return this.toSendResult(res, recipient);
  }

  /**
   * Send media (image, audio, video, document). Provide either a public URL
   * (`link`) OR a pre-uploaded `mediaId` (from `uploadMedia`).
   *
   * @example
   * ```ts
   * await wa.sendMedia({
   *   to: "5491112345678",
   *   type: "image",
   *   link: "https://example.com/order-receipt.jpg",
   *   caption: "Tu comprobante",
   * });
   * ```
   */
  async sendMedia(params: {
    to: WhatsAppRecipient;
    type: "image" | "audio" | "video" | "document" | "sticker";
    /** Public URL — Meta downloads and sends. */
    link?: string;
    /** Pre-uploaded media ID from `uploadMedia`. */
    mediaId?: string;
    /** Caption (image/video/document only). */
    caption?: string;
    /** Filename hint (document only). */
    filename?: string;
  }): Promise<SendResult> {
    if (!params.link && !params.mediaId) {
      throw new Error("sendMedia requires either `link` or `mediaId`");
    }
    const recipient = normalizeArPhone(params.to);
    const mediaPayload: Record<string, unknown> = {};
    if (params.mediaId) mediaPayload.id = params.mediaId;
    if (params.link) mediaPayload.link = params.link;
    if (params.caption && params.type !== "audio" && params.type !== "sticker") {
      mediaPayload.caption = params.caption;
    }
    if (params.filename && params.type === "document") {
      mediaPayload.filename = params.filename;
    }
    const body = {
      messaging_product: "whatsapp",
      to: recipient,
      type: params.type,
      [params.type]: mediaPayload,
    };
    const res = await this.postMessages(body);
    return this.toSendResult(res, recipient);
  }

  /**
   * Send an interactive message: buttons (up to 3 reply buttons) or a list
   * picker (sectioned menu). Useful for confirming actions in chat without
   * forcing the user to type.
   */
  async sendInteractive(params: {
    to: WhatsAppRecipient;
    bodyText: string;
    headerText?: string;
    footerText?: string;
    /** Choose buttons OR list, not both. */
    buttons?: Array<{ id: string; title: string }>;
    list?: {
      buttonText: string;
      sections: Array<{
        title?: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    };
  }): Promise<SendResult> {
    const recipient = normalizeArPhone(params.to);
    if (!params.buttons && !params.list) {
      throw new Error("sendInteractive requires either `buttons` or `list`");
    }
    if (params.buttons && params.list) {
      throw new Error("sendInteractive: pass `buttons` OR `list`, not both");
    }
    const interactive: Record<string, unknown> = {
      type: params.buttons ? "button" : "list",
      body: { text: params.bodyText },
    };
    if (params.headerText) {
      interactive.header = { type: "text", text: params.headerText };
    }
    if (params.footerText) {
      interactive.footer = { text: params.footerText };
    }
    if (params.buttons) {
      interactive.action = {
        buttons: params.buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      };
    }
    if (params.list) {
      interactive.action = {
        button: params.list.buttonText,
        sections: params.list.sections,
      };
    }
    const body = {
      messaging_product: "whatsapp",
      to: recipient,
      type: "interactive",
      interactive,
    };
    const res = await this.postMessages(body);
    return this.toSendResult(res, recipient);
  }

  /**
   * Mark an inbound message as read (sends the blue double-check). Call this
   * from your webhook handler when you process the user's message.
   */
  async markAsRead(messageId: string): Promise<void> {
    await this.postMessages({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  /**
   * Download a media file the user sent. Two-step: GET the media metadata
   * (returns a URL valid for ~5 minutes), then GET the URL with auth.
   */
  async downloadMedia(mediaId: string): Promise<{
    bytes: ArrayBuffer;
    mimeType: string | null;
    filename: string | null;
    sha256: string | null;
  }> {
    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const metaUrl = `${this.baseUrl}/${this.apiVersion}/${mediaId}`;
    const metaRes = await fetchFn(metaUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!metaRes.ok) {
      const text = await metaRes.text();
      throw await this.toApiError(text, metaRes.status, "downloadMedia metadata");
    }
    const meta = (await metaRes.json()) as {
      url: string;
      mime_type?: string;
      sha256?: string;
      file_size?: number;
    };
    const fileRes = await fetchFn(meta.url, {
      headers: { Authorization: `Bearer ${this.accessToken}` },
    });
    if (!fileRes.ok) {
      const text = await fileRes.text();
      throw await this.toApiError(text, fileRes.status, "downloadMedia binary");
    }
    const bytes = await fileRes.arrayBuffer();
    return {
      bytes,
      mimeType: meta.mime_type ?? null,
      filename: null,
      sha256: meta.sha256 ?? null,
    };
  }

  /**
   * Internal: POST to /{phoneNumberId}/messages. Throws typed errors on 4xx.
   */
  private async postMessages(body: Record<string, unknown>): Promise<{
    messaging_product: string;
    contacts?: Array<{ input: string; wa_id: string }>;
    messages?: Array<{ id: string }>;
  }> {
    const fetchFn = this.fetchImpl ?? globalThis.fetch;
    const url = `${this.baseUrl}/${this.apiVersion}/${this.phoneNumberId}/messages`;
    const res = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      throw await this.toApiError(text, res.status, "postMessages");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new WhatsAppApiError(
        `Meta returned non-JSON success response: ${text.slice(0, 200)}`,
        0,
        res.status,
      );
    }
  }

  private async toApiError(
    body: string,
    httpStatus: number,
    context: string,
  ): Promise<WhatsAppApiError> {
    let parsed: {
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        fbtrace_id?: string;
      };
    } = {};
    try {
      parsed = JSON.parse(body);
    } catch {
      return new WhatsAppApiError(
        `Meta returned ${httpStatus} (${context}) with non-JSON body: ${body.slice(0, 200)}`,
        0,
        httpStatus,
      );
    }
    const err = parsed.error ?? {};
    const code = err.code ?? 0;
    const message = err.message ?? `Meta returned ${httpStatus}`;
    const fbtraceId = err.fbtrace_id;

    if (code === 131009) {
      return new WhatsAppRecipientNotOnPlatformError(message, fbtraceId);
    }
    if (code === 131026 || code === 131047) {
      return new WhatsAppOutsideWindowError(message, fbtraceId);
    }
    return new WhatsAppApiError(
      `${context} failed: ${message}`,
      code,
      httpStatus,
      err.error_subcode,
      fbtraceId,
    );
  }

  private toSendResult(
    res: {
      contacts?: Array<{ wa_id: string }>;
      messages?: Array<{ id: string }>;
    },
    recipient: string,
  ): SendResult {
    const messageId = res.messages?.[0]?.id;
    if (!messageId) {
      throw new WhatsAppApiError(
        `Meta accepted the request but returned no message ID. Response: ${JSON.stringify(res).slice(0, 200)}`,
        0,
        200,
      );
    }
    return { messageId, recipient };
  }
}
