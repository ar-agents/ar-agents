import {
  AttestationClient,
  identityAttestTools,
  WhatsAppOtpAdapter,
  EmailMagicLinkAdapter,
  type EmailSender,
} from "@ar-agents/identity-attest";
import type { ToolSet } from "ai";
import { getWhatsAppClient } from "./whatsapp";

/**
 * Build @ar-agents/identity-attest tools if ATTEST_SIGNING_SECRET is set
 * and at least one adapter can be configured (WhatsApp client present
 * OR email sender configured via SMTP_URL / RESEND_API_KEY).
 */
export function buildIdentityAttestTools(): ToolSet | null {
  const signingSecret = process.env.ATTEST_SIGNING_SECRET?.trim();
  if (!signingSecret) return null;

  const adapters: Record<string, ConstructorParameters<typeof AttestationClient>[0]["adapters"][string]> = {};

  // WhatsApp OTP — requires WhatsApp client
  const wa = getWhatsAppClient();
  if (wa) {
    adapters["whatsapp_otp"] = new WhatsAppOtpAdapter({
      whatsappClient: wa,
      businessName: process.env.BUSINESS_NAME?.trim() ?? "this app",
    });
  }

  // Email magic-link — requires Resend API key + callback URL
  const resendKey = process.env.RESEND_API_KEY?.trim();
  const callbackUrl = process.env.ATTEST_CALLBACK_URL?.trim();
  if (resendKey && callbackUrl) {
    const fromEmail = process.env.ATTEST_FROM_EMAIL?.trim() ?? "noreply@example.com";
    const sender: EmailSender = async ({ to, subject, html, text }) => {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ from: fromEmail, to, subject, html, text }),
      });
      if (!res.ok) {
        throw new Error(`Resend send failed: ${res.status} ${await res.text()}`);
      }
    };
    adapters["email_magic_link"] = new EmailMagicLinkAdapter({
      sender,
      callbackBaseUrl: callbackUrl,
      businessName: process.env.BUSINESS_NAME?.trim() ?? "this app",
    });
  }

  if (Object.keys(adapters).length === 0) return null;

  const client = new AttestationClient({ signingSecret, adapters });
  return identityAttestTools(client) as ToolSet;
}

export function describeIdentityAttestConfig(): string {
  const signingSecret = process.env.ATTEST_SIGNING_SECRET?.trim();
  if (!signingSecret) return "not configured (set ATTEST_SIGNING_SECRET)";
  const adapters: string[] = [];
  if (getWhatsAppClient()) adapters.push("whatsapp_otp");
  if (process.env.RESEND_API_KEY?.trim() && process.env.ATTEST_CALLBACK_URL?.trim())
    adapters.push("email_magic_link");
  if (adapters.length === 0)
    return "configured but no adapters (set WhatsApp creds and/or RESEND_API_KEY + ATTEST_CALLBACK_URL)";
  return adapters.join(", ");
}
