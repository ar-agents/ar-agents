/**
 * Error classes thrown by `@ar-agents/whatsapp`. All extend the base
 * `WhatsAppError` so callers can do `catch (err) if (err instanceof WhatsAppError)`.
 *
 * # Why typed errors?
 *
 * Tools surface failures back to the LLM as part of the tool result, but for
 * code paths outside the agent (webhook handlers, batch jobs) the typed
 * errors let you switch on the error class instead of regexing messages.
 */
export class WhatsAppError extends Error {
  public override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "WhatsAppError";
    if (cause !== undefined) this.cause = cause;
  }
}

/** Construction-time configuration error (missing accessToken / phoneNumberId). */
export class WhatsAppNotConfiguredError extends WhatsAppError {
  constructor(message?: string) {
    super(
      message ??
        "WhatsAppClient requires `accessToken` and `phoneNumberId`. Get both from Meta Business Suite → WhatsApp → API Setup.",
    );
    this.name = "WhatsAppNotConfiguredError";
  }
}

/**
 * Meta Graph API returned a 4xx with a structured error body. Includes the
 * Meta error code so callers can branch on common cases:
 *
 * - 131009: phone number not on WhatsApp
 * - 131026: outside 24-hour customer service window (need template)
 * - 131031: app is not associated with this phone number
 * - 131056: invalid recipient phone number
 * - 132000: template params don't match the approved template
 * - 190: access token expired or invalid
 *
 * Full reference: https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export class WhatsAppApiError extends WhatsAppError {
  constructor(
    message: string,
    public readonly code: number,
    public readonly httpStatus: number,
    public readonly metaSubcode?: number,
    public readonly fbtraceId?: string,
    cause?: unknown,
  ) {
    super(message, cause);
    this.name = "WhatsAppApiError";
  }
}

/**
 * The recipient phone number doesn't match a WhatsApp account. Maps to Meta
 * code 131009. Surface this to the user as "ese número no está en WhatsApp".
 */
export class WhatsAppRecipientNotOnPlatformError extends WhatsAppApiError {
  constructor(metaMessage: string, fbtraceId?: string) {
    super(
      `Recipient is not registered on WhatsApp: ${metaMessage}`,
      131009,
      400,
      undefined,
      fbtraceId,
    );
    this.name = "WhatsAppRecipientNotOnPlatformError";
  }
}

/**
 * Tried to send a free-form message outside the 24-hour customer service
 * window. Maps to Meta code 131026 / 131047. The fix is to send an approved
 * template message instead.
 */
export class WhatsAppOutsideWindowError extends WhatsAppApiError {
  constructor(metaMessage: string, fbtraceId?: string) {
    super(
      `Cannot send free-form message outside 24-hour window — use a template instead. Meta said: ${metaMessage}`,
      131026,
      400,
      undefined,
      fbtraceId,
    );
    this.name = "WhatsAppOutsideWindowError";
  }
}

/** Webhook signature verification failed — the request is not from Meta. */
export class WhatsAppWebhookSignatureError extends WhatsAppError {
  constructor(message: string = "Webhook signature mismatch") {
    super(message);
    this.name = "WhatsAppWebhookSignatureError";
  }
}
