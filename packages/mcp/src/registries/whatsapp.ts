import { WhatsAppClient, whatsappTools } from "@ar-agents/whatsapp";
import type { ToolSet } from "ai";

export function buildWhatsAppTools(): ToolSet | null {
  const accessToken = process.env.WA_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) return null;
  return whatsappTools(new WhatsAppClient({ accessToken, phoneNumberId })) as ToolSet;
}

export function describeWhatsAppConfig(): string {
  const accessToken = process.env.WA_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId)
    return "not configured (set WA_ACCESS_TOKEN + WA_PHONE_NUMBER_ID)";
  return `phone_number_id=${phoneNumberId.slice(0, 6)}…`;
}

/** Returns the configured client, used by identity-attest's WhatsAppOtpAdapter. */
export function getWhatsAppClient(): WhatsAppClient | null {
  const accessToken = process.env.WA_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WA_PHONE_NUMBER_ID?.trim();
  if (!accessToken || !phoneNumberId) return null;
  return new WhatsAppClient({ accessToken, phoneNumberId });
}
