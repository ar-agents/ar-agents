import type { WhatsAppClient } from "@ar-agents/whatsapp";

/**
 * Mock WhatsAppClient for demo / testing without real Meta credentials.
 *
 * Records every send_* call into an in-memory list and returns plausible-looking
 * fake message IDs. Lets the agent flow run end-to-end so the LLM can chain
 * tool calls, even though no real WhatsApp message is sent.
 *
 * The recorded messages are surfaced to the UI via `getRecordedSends()` so the
 * demo can show what would have been sent if real creds were wired.
 */
export class MockWhatsAppClient implements Pick<
  WhatsAppClient,
  | "sendText"
  | "sendTemplate"
  | "sendMedia"
  | "sendInteractive"
  | "markAsRead"
  | "downloadMedia"
> {
  private records: Array<{
    method: string;
    args: unknown;
    fakeMessageId: string;
    timestamp: string;
  }> = [];

  private nextFakeId(): string {
    return (
      "wamid.MOCK_" +
      Math.random().toString(36).slice(2, 10).toUpperCase()
    );
  }

  private record(method: string, args: unknown) {
    const fakeMessageId = this.nextFakeId();
    this.records.push({
      method,
      args,
      fakeMessageId,
      timestamp: new Date().toISOString(),
    });
    return fakeMessageId;
  }

  async sendText(args: { to: string; text: string }) {
    const messageId = this.record("sendText", args);
    return { messageId, recipient: args.to };
  }

  async sendTemplate(args: { to: string; templateName: string }) {
    const messageId = this.record("sendTemplate", args);
    return { messageId, recipient: args.to };
  }

  async sendMedia(args: { to: string; type: string }) {
    const messageId = this.record("sendMedia", args);
    return { messageId, recipient: args.to };
  }

  async sendInteractive(args: { to: string; bodyText: string }) {
    const messageId = this.record("sendInteractive", args);
    return { messageId, recipient: args.to };
  }

  async markAsRead(messageId: string): Promise<void> {
    this.record("markAsRead", { messageId });
  }

  async downloadMedia(_mediaId: string): Promise<{
    bytes: ArrayBuffer;
    mimeType: string | null;
    filename: string | null;
    sha256: string | null;
  }> {
    throw new Error("MockWhatsAppClient does not support downloadMedia — wire real WA_ACCESS_TOKEN + WA_PHONE_NUMBER_ID");
  }

  getRecordedSends() {
    return [...this.records];
  }

  reset() {
    this.records = [];
  }
}
