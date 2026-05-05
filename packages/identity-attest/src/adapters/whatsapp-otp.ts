import type { AttestAdapter } from "./base";
import { randomOtp } from "./base";
import { AttestAdapterError } from "../errors";

/**
 * Verifies that the user controls a given WhatsApp number by sending them a
 * 6-digit OTP and asking them to echo it back.
 *
 * Trust level: 0.3 — proves "controls this WhatsApp number at this moment".
 * Doesn't prove identity (someone with the phone can verify), so use with
 * caution for high-stakes flows. Combine with stronger adapters via step-up.
 *
 * # Usage
 *
 * ```ts
 * import { WhatsAppClient } from "@ar-agents/whatsapp";
 * import { WhatsAppOtpAdapter } from "@ar-agents/identity-attest";
 *
 * const wa = new WhatsAppClient({ accessToken, phoneNumberId });
 * const adapter = new WhatsAppOtpAdapter({
 *   whatsappClient: wa,
 *   templateName: "verification_code", // optional, falls back to free-form text
 *   businessName: "LautaroSaaS",
 * });
 * ```
 *
 * # Outside the 24-hour window
 *
 * Free-form WhatsApp messages only work within 24h of the user's last message
 * to you. For first-time verification (cold outreach), pass an approved
 * `templateName` — the lib will use `send_whatsapp_template` instead. Most
 * accounts ship with a pre-approved "verification code" template.
 *
 * # The WhatsApp client requirement
 *
 * The adapter doesn't import `@ar-agents/whatsapp` directly to avoid making
 * it a hard peer dep. You pass the client instance. Anything that
 * implements the `WhatsAppLikeClient` shape works (mock, Twilio, etc.).
 */

export interface WhatsAppLikeClient {
  sendText(params: { to: string; text: string }): Promise<unknown>;
  sendTemplate?(params: {
    to: string;
    templateName: string;
    languageCode?: string;
    bodyParams?: string[];
  }): Promise<unknown>;
}

export interface WhatsAppOtpAdapterOptions {
  whatsappClient: WhatsAppLikeClient;
  /** OTP digits — default 6. */
  otpDigits?: number;
  /**
   * Approved WhatsApp template name. Required for messages OUTSIDE the
   * 24h customer service window (i.e., cold verification outreach). The
   * template's body should accept the OTP code as the first param.
   */
  templateName?: string;
  /** Template language. Default "es_AR". */
  templateLanguage?: string;
  /**
   * Your business name to mention in the OTP message body (free-form text
   * fallback only). Default "this app".
   */
  businessName?: string;
  /**
   * If true (default), tries `sendTemplate` first; falls back to `sendText`
   * if no templateName configured. If false, always uses `sendText` —
   * useful when you've already messaged the user within the 24h window.
   */
  preferTemplate?: boolean;
}

export class WhatsAppOtpAdapter implements AttestAdapter {
  readonly id = "whatsapp_otp";
  readonly trustLevel = 0.3;

  private readonly client: WhatsAppLikeClient;
  private readonly otpDigits: number;
  private readonly templateName: string | undefined;
  private readonly templateLanguage: string;
  private readonly businessName: string;
  private readonly preferTemplate: boolean;

  constructor(options: WhatsAppOtpAdapterOptions) {
    this.client = options.whatsappClient;
    this.otpDigits = options.otpDigits ?? 6;
    this.templateName = options.templateName;
    this.templateLanguage = options.templateLanguage ?? "es_AR";
    this.businessName = options.businessName ?? "this app";
    this.preferTemplate = options.preferTemplate ?? true;
  }

  generateSecret(): string {
    return randomOtp(this.otpDigits);
  }

  async deliverChallenge(params: {
    requestId: string;
    subject: { type: string; value: string };
    secret: string;
  }): Promise<void> {
    const useTemplate = this.preferTemplate && this.templateName && this.client.sendTemplate;
    try {
      if (useTemplate && this.client.sendTemplate) {
        await this.client.sendTemplate({
          to: params.subject.value,
          templateName: this.templateName!,
          languageCode: this.templateLanguage,
          bodyParams: [params.secret],
        });
      } else {
        const text = `Tu código de verificación para ${this.businessName} es: ${params.secret}\n\nVence en 15 minutos. No lo compartas con nadie.`;
        await this.client.sendText({ to: params.subject.value, text });
      }
    } catch (err) {
      throw new AttestAdapterError(
        this.id,
        `Failed to deliver OTP via WhatsApp: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async verify(params: {
    storedSecret: string;
    submitted: { code?: string };
  }): Promise<{ verified: true } | { verified: false; reason: string }> {
    const submitted = (params.submitted.code ?? "").trim();
    if (!submitted) {
      return { verified: false, reason: "No code submitted" };
    }
    if (submitted === params.storedSecret) {
      return { verified: true };
    }
    return { verified: false, reason: "OTP code does not match" };
  }
}
