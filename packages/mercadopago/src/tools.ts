import { tool, type ToolSet } from "ai";
import { z } from "zod";
import type { MercadoPagoClient } from "./client";
import type { SubscriptionStateAdapter } from "./state";

export interface MercadoPagoToolsOptions {
  /** State adapter for persisting subscription records. */
  state: SubscriptionStateAdapter;
  /**
   * Default back_url used when callers don't supply one. MUST be HTTPS — MP
   * rejects http:// and localhost back URLs even in sandbox.
   */
  backUrl: string;
  /**
   * Optionally override the agent-facing tool descriptions. Pass an object
   * with keys matching tool names; values replace the default description.
   * Useful for localizing the agent's tool reasoning.
   */
  descriptions?: Partial<Record<ToolName, string>>;
}

type ToolName =
  | "create_subscription"
  | "get_subscription_status"
  | "cancel_subscription"
  | "pause_subscription"
  | "resume_subscription";

const DEFAULT_DESCRIPTIONS: Record<ToolName, string> = {
  create_subscription:
    "Create a Mercado Pago recurring subscription. Returns an init_point URL where the customer must complete the FIRST payment with their card and CVV (this is a hard MP requirement; agents cannot bypass it). After they pay, MP will auto-charge at the configured frequency without further intervention.",
  get_subscription_status:
    "Check the current status of a Mercado Pago subscription. Use this to confirm the customer completed the first payment (status becomes 'authorized') or to inspect the next charge date.",
  cancel_subscription:
    "Cancel an active Mercado Pago subscription. After cancellation, MP will not charge the customer again. This action is irreversible — confirm with the user before calling.",
  pause_subscription:
    "Pause an authorized Mercado Pago subscription. Charges stop until resumed. Only works on subscriptions in 'authorized' status.",
  resume_subscription:
    "Resume a paused Mercado Pago subscription. Charges resume on the next scheduled date. Only works on subscriptions in 'paused' status.",
};

/**
 * Build a tool set for the Vercel AI SDK that exposes Mercado Pago Subscriptions
 * to an agent. Pass directly to `Experimental_Agent`'s `tools` option, or merge
 * with other tool sets.
 *
 * @example
 * ```ts
 * import { Experimental_Agent as Agent, stepCountIs } from 'ai';
 * import { MercadoPagoClient, mercadoPagoTools, InMemoryStateAdapter } from '@ar-agents/mercadopago';
 *
 * const mp = new MercadoPagoClient({ accessToken: process.env.MP_ACCESS_TOKEN! });
 * const agent = new Agent({
 *   model: 'anthropic/claude-sonnet-4-6',
 *   tools: mercadoPagoTools(mp, {
 *     state: new InMemoryStateAdapter(),
 *     backUrl: 'https://mysite.com/done',
 *   }),
 *   stopWhen: stepCountIs(8),
 * });
 * ```
 */
export function mercadoPagoTools(
  client: MercadoPagoClient,
  options: MercadoPagoToolsOptions,
): ToolSet {
  const desc = (name: ToolName): string =>
    options.descriptions?.[name] ?? DEFAULT_DESCRIPTIONS[name];

  return {
    create_subscription: tool({
      description: desc("create_subscription"),
      inputSchema: z.object({
        customer_email: z
          .string()
          .email()
          .describe("Email of the customer who will be charged"),
        amount_ars: z
          .number()
          .positive()
          .describe("Amount in Argentine Pesos per recurring charge"),
        frequency_months: z
          .number()
          .int()
          .positive()
          .max(12)
          .describe("Frequency in months (1=monthly, 3=quarterly, 12=yearly)"),
        reason: z
          .string()
          .min(3)
          .max(120)
          .describe("Short description shown to the customer at checkout"),
        external_reference: z
          .string()
          .optional()
          .describe("Optional id from your system to track this subscription"),
      }),
      execute: async ({
        customer_email,
        amount_ars,
        frequency_months,
        reason,
        external_reference,
      }) => {
        const created = await client.createPreapproval({
          reason,
          payerEmail: customer_email,
          amount: amount_ars,
          currency: "ARS",
          frequency: frequency_months,
          frequencyType: "months",
          backUrl: options.backUrl,
          ...(external_reference !== undefined ? { externalReference: external_reference } : {}),
        });
        await options.state.set(created.id, {
          status: created.status,
          payerEmail: customer_email,
          amount: amount_ars,
          currency: "ARS",
          frequency: frequency_months,
          frequencyType: "months",
          initPoint: created.init_point,
          ...(external_reference !== undefined ? { externalReference: external_reference } : {}),
          createdAt: new Date().toISOString(),
        });
        return {
          subscription_id: created.id,
          status: created.status,
          init_point_url: created.init_point,
          next_step:
            "Send init_point_url to the customer. They must complete the first payment with card+CVV. Use get_subscription_status to confirm activation after they pay.",
        };
      },
    }),

    get_subscription_status: tool({
      description: desc("get_subscription_status"),
      inputSchema: z.object({
        subscription_id: z
          .string()
          .describe("The Mercado Pago subscription/preapproval ID"),
      }),
      execute: async ({ subscription_id }) => {
        const fresh = await client.getPreapproval(subscription_id);
        const cached = await options.state.get(subscription_id);
        return {
          subscription_id: fresh.id,
          status: fresh.status,
          payer_email: fresh.payer_email,
          amount: fresh.auto_recurring.transaction_amount,
          currency: fresh.auto_recurring.currency_id,
          next_payment_date: fresh.next_payment_date ?? null,
          last_webhook_status: cached?.lastWebhookStatus ?? null,
          last_webhook_at: cached?.lastWebhookAt ?? null,
        };
      },
    }),

    cancel_subscription: tool({
      description: desc("cancel_subscription"),
      inputSchema: z.object({
        subscription_id: z
          .string()
          .describe("The Mercado Pago subscription/preapproval ID to cancel"),
      }),
      execute: async ({ subscription_id }) => {
        const cancelled = await client.cancelPreapproval(subscription_id);
        await options.state.set(subscription_id, {
          status: cancelled.status,
          cancelledAt: new Date().toISOString(),
        });
        return {
          subscription_id: cancelled.id,
          status: cancelled.status,
          message: "Subscription cancelled. No further charges will occur.",
        };
      },
    }),

    pause_subscription: tool({
      description: desc("pause_subscription"),
      inputSchema: z.object({
        subscription_id: z.string(),
      }),
      execute: async ({ subscription_id }) => {
        const paused = await client.pausePreapproval(subscription_id);
        await options.state.set(subscription_id, { status: paused.status });
        return {
          subscription_id: paused.id,
          status: paused.status,
          message: "Subscription paused. Use resume_subscription to reactivate.",
        };
      },
    }),

    resume_subscription: tool({
      description: desc("resume_subscription"),
      inputSchema: z.object({
        subscription_id: z.string(),
      }),
      execute: async ({ subscription_id }) => {
        const resumed = await client.resumePreapproval(subscription_id);
        await options.state.set(subscription_id, { status: resumed.status });
        return {
          subscription_id: resumed.id,
          status: resumed.status,
          message: "Subscription resumed. Charges will continue on next scheduled date.",
        };
      },
    }),
  } satisfies ToolSet;
}
