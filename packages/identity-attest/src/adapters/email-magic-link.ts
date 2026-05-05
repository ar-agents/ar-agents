import type { AttestAdapter } from "./base";
import { randomToken } from "./base";
import { AttestAdapterError } from "../errors";

/**
 * Verifies that the user controls a given email by emailing them a one-time
 * magic link they must click.
 *
 * Trust level: 0.5 — proves "controls this email at this moment". Stronger
 * than phone OTP (email is harder to SIM-swap) but still doesn't prove
 * identity. Use with KYC step-up for high-stakes flows.
 *
 * # Email sender (pluggable)
 *
 * The adapter doesn't bundle an email client — pass an `EmailSender`
 * function that calls Resend/SES/SMTP/whatever. The signature is
 * intentionally minimal so any provider is trivial to wrap.
 *
 * ```ts
 * import { EmailMagicLinkAdapter } from "@ar-agents/identity-attest";
 * import { Resend } from "resend";
 * const resend = new Resend(process.env.RESEND_API_KEY!);
 *
 * const adapter = new EmailMagicLinkAdapter({
 *   sender: async ({ to, subject, html }) => {
 *     await resend.emails.send({ from: "noreply@yourapp.com", to, subject, html });
 *   },
 *   businessName: "LautaroSaaS",
 *   callbackBaseUrl: "https://yourapp.com/api/identity-attest/callback",
 * });
 * ```
 *
 * # The callback URL
 *
 * The lib generates URLs like:
 *   `${callbackBaseUrl}?request_id=...&token=...`
 *
 * You wire `handleAttestationCallback` into a route handler at
 * `callbackBaseUrl` to validate + complete the verification.
 */

export interface EmailSender {
  (params: {
    to: string;
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

export interface EmailMagicLinkAdapterOptions {
  sender: EmailSender;
  /** Public URL where `handleAttestationCallback` listens. Required. */
  callbackBaseUrl: string;
  /** Your business name in email subject + body. */
  businessName?: string;
  /** Sender display name (the "From" value). Affects email body, not the SMTP sender. */
  fromDisplayName?: string;
  /** Token length — default 32 chars URL-safe. */
  tokenLength?: number;
}

export class EmailMagicLinkAdapter implements AttestAdapter {
  readonly id = "email_magic_link";
  readonly trustLevel = 0.5;

  private readonly sender: EmailSender;
  private readonly callbackBaseUrl: string;
  private readonly businessName: string;
  private readonly fromDisplayName: string;
  private readonly tokenLength: number;

  constructor(options: EmailMagicLinkAdapterOptions) {
    this.sender = options.sender;
    this.callbackBaseUrl = options.callbackBaseUrl;
    this.businessName = options.businessName ?? "this app";
    this.fromDisplayName = options.fromDisplayName ?? this.businessName;
    this.tokenLength = options.tokenLength ?? 32;
  }

  generateSecret(): string {
    return randomToken(this.tokenLength);
  }

  buildVerificationUrl(params: { requestId: string; secret: string }): string {
    const url = new URL(this.callbackBaseUrl);
    url.searchParams.set("request_id", params.requestId);
    url.searchParams.set("token", params.secret);
    return url.toString();
  }

  async deliverChallenge(params: {
    requestId: string;
    subject: { type: string; value: string };
    secret: string;
    verificationUrl?: string;
  }): Promise<void> {
    const link =
      params.verificationUrl ??
      this.buildVerificationUrl({ requestId: params.requestId, secret: params.secret });
    const subject = `Verificá tu email para ${this.businessName}`;
    const text = `Para confirmar que sos el dueño de este email, hacé click en el siguiente link:\n\n${link}\n\nEl link vence en 15 minutos. Si no fuiste vos, ignorá este mensaje.\n\n— ${this.fromDisplayName}`;
    const html = `<p>Para confirmar que sos el dueño de este email, hacé click en el siguiente link:</p>
<p><a href="${link}" style="display:inline-block;padding:12px 24px;background:#0a0a0a;color:white;border-radius:8px;text-decoration:none;font-weight:500">Confirmar email</a></p>
<p style="color:#52525b;font-size:13px">El link vence en 15 minutos. Si no fuiste vos, ignorá este mensaje.</p>
<p style="color:#71717a;font-size:12px">— ${this.fromDisplayName}</p>`;

    try {
      await this.sender({ to: params.subject.value, subject, html, text });
    } catch (err) {
      throw new AttestAdapterError(
        this.id,
        `Failed to deliver magic link via email: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async verify(params: {
    storedSecret: string;
    submitted: { token?: string };
  }): Promise<{ verified: true } | { verified: false; reason: string }> {
    const submitted = (params.submitted.token ?? "").trim();
    if (!submitted) return { verified: false, reason: "No token submitted" };
    if (submitted === params.storedSecret) return { verified: true };
    return { verified: false, reason: "Token does not match (link may have been forged or already used)" };
  }
}
