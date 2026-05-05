import { tool } from "ai";
import { z } from "zod";
import type { WhatsAppClient } from "./client";

/**
 * Build the WhatsApp tool set for a Vercel AI SDK agent.
 *
 * Wires the methods of `WhatsAppClient` into named, schema-validated tools
 * that the LLM can invoke. The tool descriptions are written for the LLM —
 * they explain when to use each tool and when NOT to.
 *
 * @example
 * ```ts
 * import { Experimental_Agent as Agent, stepCountIs } from "ai";
 * import { whatsappTools, WhatsAppClient } from "@ar-agents/whatsapp";
 *
 * const wa = new WhatsAppClient({
 *   accessToken: process.env.WA_ACCESS_TOKEN!,
 *   phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
 * });
 *
 * const agent = new Agent({
 *   model: "anthropic/claude-sonnet-4-6",
 *   instructions: "...",
 *   tools: whatsappTools(wa),
 *   stopWhen: stepCountIs(8),
 * });
 * ```
 */
export function whatsappTools(client: WhatsAppClient) {
  return {
    send_whatsapp_text: tool({
      description: `Send a free-form text message to a WhatsApp recipient. Use for replies INSIDE the 24-hour customer service window (after the user has messaged you within the last 24h). For proactive messages outside that window, use send_whatsapp_template instead — free-form will fail with code 131026.

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
      description: `Send an APPROVED WhatsApp template message. Required for any message OUTSIDE the 24-hour customer service window — i.e. proactive notifications, transactional updates, marketing, re-engagement.

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
            "Positional params for the template body — fills {{1}}, {{2}}, etc. in order.",
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
      description: `Send a media attachment (image / audio / video / document / sticker). Provide either a public URL (link, faster — Meta downloads) or a pre-uploaded media ID.

WhatsApp media size limits: image 5MB, audio 16MB, video 16MB, document 100MB, sticker 100KB.

Subject to the same 24-hour customer service window as send_whatsapp_text — outside the window use a template with a media header.

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
      description: `Send a message with up to 3 reply buttons. The user taps a button and you receive an interactive.button_reply event in the webhook. Useful for confirmations like "Sí / No / Cambiar".

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
      description: `Send a list-picker menu — a button that opens a sectioned list of options. The user picks one and you receive an interactive.list_reply event.

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
      description: `Mark an inbound WhatsApp message as read (the blue double-check). Call this from your webhook handler immediately when you process a user message — the user sees the read receipt and knows the agent received the message even if the response takes a few seconds.

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

export type WhatsAppToolSet = ReturnType<typeof whatsappTools>;
