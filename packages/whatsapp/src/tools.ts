import { tool } from "ai";
import { z } from "zod";
import type { WhatsAppClient } from "./client";

/**
 * Build the WhatsApp tool set for a Vercel AI SDK agent.
 *
 * Wires the methods of `WhatsAppClient` into named, schema-validated tools
 * that the LLM can invoke. The tool descriptions are written for the LLM -
 * they explain when to use each tool and when NOT to.
 *
 * # Scoped mode (recommended for webhook handlers)
 *
 * Pass `options.scopedTo: senderPhone` to bind every outbound message to the
 * inbound sender. The `to` parameter is REMOVED from the tool schemas so the
 * LLM cannot message a different number. This prevents agent-hijacking
 * scenarios where a crafted inbound message tricks the agent into spamming
 * arbitrary recipients (security audit finding /cso F5).
 *
 * # Unscoped mode
 *
 * Without `scopedTo`, tools accept arbitrary `to` arguments. Suitable for
 * batch/proactive flows where the agent is sending notifications to a list
 * of recipients you control.
 *
 * @example Scoped (webhook handler, recommended)
 * ```ts
 * import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";
 *
 * const wa = new WhatsAppClient({ ... });
 * const event = parseWebhookEvent(payload);
 *
 * // All send_* tools auto-bind `to` to event.from. LLM cannot override.
 * const tools = whatsappTools(wa, { scopedTo: event.from });
 * ```
 *
 * @example Unscoped (batch / outbound)
 * ```ts
 * const tools = whatsappTools(wa);
 * // LLM provides `to` per-call.
 * ```
 */
export function whatsappTools(
  client: WhatsAppClient,
  options: WhatsAppToolsOptions = {},
) {
  const { scopedTo } = options;

  if (scopedTo) {
    return buildScopedTools(client, scopedTo);
  }
  return buildUnscopedTools(client);
}

export interface WhatsAppToolsOptions {
  /**
   * Bind every outbound `send_*` tool to this single recipient phone. The
   * `to` parameter is removed from tool schemas, the LLM cannot specify a
   * different recipient. Use in webhook handlers to prevent agent hijacking.
   *
   * AR phone formats accepted: `+54 9 11 1234-5678`, `549112345678`, etc.
   */
  scopedTo?: string;
}

// ─────────────────────────────────────────────────────────────────────────
// Unscoped tools, LLM provides `to` per-call (batch / proactive flows).
// ─────────────────────────────────────────────────────────────────────────

function buildUnscopedTools(client: WhatsAppClient) {
  return {
    send_whatsapp_text: tool({
      description: `Send a free-form WhatsApp text message (enviar mensaje de WhatsApp, mandar un WhatsApp). Use for replies INSIDE the 24-hour customer service window (after the user has messaged you within the last 24h). For proactive messages outside that window, use send_whatsapp_template instead, free-form will fail with code 131026.

Returns: { messageId, recipient } on success. Throws WhatsAppApiError on failure (network, invalid recipient, outside-window).

The recipient phone is auto-normalized (handles +54 9 11 ..., 011 ..., etc.).`,
      inputSchema: z.object({
        to: z
          .string()
          .describe("Recipient phone (any AR format accepted: +54 9 11 1234-5678, 011 1234-5678, etc.)"),
        text: z.string().min(1).max(4096).describe("Message body (max 4096 chars)"),
        previewUrl: z
          .boolean()
          .optional()
          .describe("Render link previews in the message. Default true."),
        contextMessageId: z
          .string()
          .optional()
          .describe("wamid of the message to thread-reply to (creates a quoted reply)."),
      }),
      execute: async (input) => {
        return await client.sendText({
          to: input.to,
          text: input.text,
          ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
          ...(input.contextMessageId !== undefined ? { contextMessageId: input.contextMessageId } : {}),
        });
      },
    }),

    send_whatsapp_template: tool({
      description: `Send an APPROVED WhatsApp template message (enviar plantilla de WhatsApp). Required for any message OUTSIDE the 24-hour customer service window, i.e. proactive notifications, transactional updates, marketing, re-engagement.

Templates must be created and approved by Meta first. The template name MUST match exactly what's registered in Meta Business Suite. The bodyParams array fills the {{1}}, {{2}}, ... placeholders in the template body, in order.

Common AR languages: "es_AR" (default), "es", "en_US".

Returns: { messageId, recipient }. Throws if template doesn't exist, params don't match, or recipient is invalid.`,
      inputSchema: z.object({
        to: z.string().describe("Recipient phone (any AR format accepted)."),
        templateName: z
          .string()
          .describe("Exact template name as registered in Meta Business Suite."),
        languageCode: z
          .string()
          .optional()
          .describe('Language code, default "es_AR".'),
        bodyParams: z
          .array(z.string())
          .optional()
          .describe(
            "Positional params for the template body, fills {{1}}, {{2}}, etc. in order.",
          ),
      }),
      execute: async (input) => {
        return await client.sendTemplate({
          to: input.to,
          templateName: input.templateName,
          ...(input.languageCode !== undefined ? { languageCode: input.languageCode } : {}),
          ...(input.bodyParams !== undefined ? { bodyParams: input.bodyParams } : {}),
        });
      },
    }),

    send_whatsapp_media: tool({
      description: `Send a WhatsApp media attachment (enviar imagen, audio, video o documento por WhatsApp). Provide either a public URL (link, faster, Meta downloads) or a pre-uploaded media ID.

WhatsApp media size limits: image 5MB, audio 16MB, video 16MB, document 100MB, sticker 100KB.

Subject to the same 24-hour customer service window as send_whatsapp_text, outside the window use a template with a media header.

Returns: { messageId, recipient }.`,
      inputSchema: z.object({
        to: z.string().describe("Recipient phone."),
        type: z.enum(["image", "audio", "video", "document", "sticker"]),
        link: z
          .string()
          .url()
          .optional()
          .describe("Public URL Meta can fetch."),
        mediaId: z
          .string()
          .optional()
          .describe("Pre-uploaded media ID (alternative to link)."),
        caption: z
          .string()
          .max(1024)
          .optional()
          .describe("Caption for image/video/document. Ignored for audio/sticker."),
        filename: z
          .string()
          .optional()
          .describe("Filename hint for document type only."),
      }),
      execute: async (input) => {
        return await client.sendMedia({
          to: input.to,
          type: input.type,
          ...(input.link !== undefined ? { link: input.link } : {}),
          ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.filename !== undefined ? { filename: input.filename } : {}),
        });
      },
    }),

    send_whatsapp_buttons: tool({
      description: `Send a WhatsApp message with up to 3 reply buttons (botones de respuesta rápida). The user taps a button and you receive an interactive.button_reply event in the webhook. Useful for confirmations like "Sí / No / Cambiar".

Use for SHORT decisions in chat. For longer menus (4-10 options grouped into sections), use send_whatsapp_list.

Each button has an id (you choose, used to identify the response in the webhook) and a title (max 20 chars, shown on the button).`,
      inputSchema: z.object({
        to: z.string(),
        bodyText: z.string().min(1).max(1024),
        headerText: z.string().max(60).optional(),
        footerText: z.string().max(60).optional(),
        buttons: z
          .array(
            z.object({
              id: z.string().min(1).max(256),
              title: z.string().min(1).max(20),
            }),
          )
          .min(1)
          .max(3),
      }),
      execute: async (input) => {
        return await client.sendInteractive({
          to: input.to,
          bodyText: input.bodyText,
          ...(input.headerText !== undefined ? { headerText: input.headerText } : {}),
          ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
          buttons: input.buttons,
        });
      },
    }),

    send_whatsapp_list: tool({
      description: `Send a WhatsApp list-picker menu (menú de lista de WhatsApp), a button that opens a sectioned list of options. The user picks one and you receive an interactive.list_reply event.

Use for menus with 4+ options or when grouping options helps (e.g., "Plan Básico / Pro / Enterprise" sections by tier).

Each row has id (used in webhook), title (24 chars max), optional description (72 chars max).`,
      inputSchema: z.object({
        to: z.string(),
        bodyText: z.string().min(1).max(1024),
        headerText: z.string().max(60).optional(),
        footerText: z.string().max(60).optional(),
        buttonText: z
          .string()
          .min(1)
          .max(20)
          .describe('Label of the button that opens the list, e.g. "Ver opciones"'),
        sections: z
          .array(
            z.object({
              title: z.string().max(24).optional(),
              rows: z
                .array(
                  z.object({
                    id: z.string().min(1).max(200),
                    title: z.string().min(1).max(24),
                    description: z.string().max(72).optional(),
                  }),
                )
                .min(1)
                .max(10),
            }),
          )
          .min(1)
          .max(10),
      }),
      execute: async (input) => {
        return await client.sendInteractive({
          to: input.to,
          bodyText: input.bodyText,
          ...(input.headerText !== undefined ? { headerText: input.headerText } : {}),
          ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
          list: {
            buttonText: input.buttonText,
            sections: input.sections.map((s) => ({
              ...(s.title !== undefined ? { title: s.title } : {}),
              rows: s.rows.map((r) => ({
                id: r.id,
                title: r.title,
                ...(r.description !== undefined ? { description: r.description } : {}),
              })),
            })),
          },
        });
      },
    }),

    mark_whatsapp_read: tool({
      description: `Mark an inbound WhatsApp message as read (marcar como leído, the blue double-check). Call this from your webhook handler immediately when you process a user message, the user sees the read receipt and knows the agent received the message even if the response takes a few seconds.

Pass the messageId (wamid) from the inbound webhook event.`,
      inputSchema: z.object({
        messageId: z
          .string()
          .describe("wamid of the inbound message to mark as read."),
      }),
      execute: async ({ messageId }) => {
        await client.markAsRead(messageId);
        return { ok: true, messageId };
      },
    }),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Scoped tools, `to` is removed from schemas; bound to a single sender.
// Use in webhook handlers. Prevents agent hijacking via prompt injection.
// ─────────────────────────────────────────────────────────────────────────

function buildScopedTools(client: WhatsAppClient, scopedTo: string) {
  const SCOPE_NOTE = `\n\nThis tool is BOUND to recipient ${scopedTo} (the original WhatsApp sender). You cannot message a different number, that parameter has been removed from the schema. If the user asks you to message someone else, decline politely.`;

  return {
    send_whatsapp_text: tool({
      description:
        `Send a free-form WhatsApp text reply (responder por WhatsApp) to the conversation owner. Use for replies INSIDE the 24-hour customer service window. For proactive messages outside that window, use send_whatsapp_template instead, free-form will fail with code 131026.

Returns: { messageId, recipient }. Throws WhatsAppApiError on failure.` + SCOPE_NOTE,
      inputSchema: z.object({
        text: z.string().min(1).max(4096).describe("Message body (max 4096 chars)"),
        previewUrl: z
          .boolean()
          .optional()
          .describe("Render link previews. Default true."),
        contextMessageId: z
          .string()
          .optional()
          .describe("wamid to thread-reply to."),
      }),
      execute: async (input) => {
        return await client.sendText({
          to: scopedTo,
          text: input.text,
          ...(input.previewUrl !== undefined ? { previewUrl: input.previewUrl } : {}),
          ...(input.contextMessageId !== undefined ? { contextMessageId: input.contextMessageId } : {}),
        });
      },
    }),

    send_whatsapp_template: tool({
      description:
        `Send an APPROVED WhatsApp template message to the conversation owner (enviar plantilla de WhatsApp). Required for any message OUTSIDE the 24-hour customer service window.

Templates must be approved by Meta first. The bodyParams array fills the {{1}}, {{2}}, ... placeholders in order.

Returns: { messageId, recipient }.` + SCOPE_NOTE,
      inputSchema: z.object({
        templateName: z.string().describe("Exact name as in Meta Business Suite."),
        languageCode: z.string().optional().describe('Default "es_AR".'),
        bodyParams: z
          .array(z.string())
          .optional()
          .describe("Fills {{1}}, {{2}}, ... in order."),
      }),
      execute: async (input) => {
        return await client.sendTemplate({
          to: scopedTo,
          templateName: input.templateName,
          ...(input.languageCode !== undefined ? { languageCode: input.languageCode } : {}),
          ...(input.bodyParams !== undefined ? { bodyParams: input.bodyParams } : {}),
        });
      },
    }),

    send_whatsapp_media: tool({
      description:
        `Send a WhatsApp media attachment to the conversation owner (enviar imagen, audio, video o documento). Provide either a public URL or a pre-uploaded media ID.

Size limits: image 5MB, audio 16MB, video 16MB, document 100MB, sticker 100KB.` + SCOPE_NOTE,
      inputSchema: z.object({
        type: z.enum(["image", "audio", "video", "document", "sticker"]),
        link: z.string().url().optional(),
        mediaId: z.string().optional(),
        caption: z.string().max(1024).optional(),
        filename: z.string().optional(),
      }),
      execute: async (input) => {
        return await client.sendMedia({
          to: scopedTo,
          type: input.type,
          ...(input.link !== undefined ? { link: input.link } : {}),
          ...(input.mediaId !== undefined ? { mediaId: input.mediaId } : {}),
          ...(input.caption !== undefined ? { caption: input.caption } : {}),
          ...(input.filename !== undefined ? { filename: input.filename } : {}),
        });
      },
    }),

    send_whatsapp_buttons: tool({
      description:
        `Send a WhatsApp message with up to 3 reply buttons to the conversation owner (botones de respuesta rápida).` + SCOPE_NOTE,
      inputSchema: z.object({
        bodyText: z.string().min(1).max(1024),
        headerText: z.string().max(60).optional(),
        footerText: z.string().max(60).optional(),
        buttons: z
          .array(
            z.object({
              id: z.string().min(1).max(256),
              title: z.string().min(1).max(20),
            }),
          )
          .min(1)
          .max(3),
      }),
      execute: async (input) => {
        return await client.sendInteractive({
          to: scopedTo,
          bodyText: input.bodyText,
          ...(input.headerText !== undefined ? { headerText: input.headerText } : {}),
          ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
          buttons: input.buttons,
        });
      },
    }),

    send_whatsapp_list: tool({
      description:
        `Send a WhatsApp list-picker menu (menú de lista de WhatsApp) to the conversation owner.` + SCOPE_NOTE,
      inputSchema: z.object({
        bodyText: z.string().min(1).max(1024),
        headerText: z.string().max(60).optional(),
        footerText: z.string().max(60).optional(),
        buttonText: z.string().min(1).max(20),
        sections: z
          .array(
            z.object({
              title: z.string().max(24).optional(),
              rows: z
                .array(
                  z.object({
                    id: z.string().min(1).max(200),
                    title: z.string().min(1).max(24),
                    description: z.string().max(72).optional(),
                  }),
                )
                .min(1)
                .max(10),
            }),
          )
          .min(1)
          .max(10),
      }),
      execute: async (input) => {
        return await client.sendInteractive({
          to: scopedTo,
          bodyText: input.bodyText,
          ...(input.headerText !== undefined ? { headerText: input.headerText } : {}),
          ...(input.footerText !== undefined ? { footerText: input.footerText } : {}),
          list: {
            buttonText: input.buttonText,
            sections: input.sections.map((s) => ({
              ...(s.title !== undefined ? { title: s.title } : {}),
              rows: s.rows.map((r) => ({
                id: r.id,
                title: r.title,
                ...(r.description !== undefined ? { description: r.description } : {}),
              })),
            })),
          },
        });
      },
    }),

    mark_whatsapp_read: tool({
      description: `Mark an inbound WhatsApp message as read (marcar como leído, the blue double-check).`,
      inputSchema: z.object({
        messageId: z.string().describe("wamid of the inbound message."),
      }),
      execute: async ({ messageId }) => {
        await client.markAsRead(messageId);
        return { ok: true, messageId };
      },
    }),
  };
}

export type WhatsAppToolSet = ReturnType<typeof whatsappTools>;
