import { eveChannel } from "eve/channels/eve";
import { localDev, vercelOidc } from "eve/channels/auth";

// Web channel: a chat UI for the incorporation assistant. Open on localhost
// during development; gated behind Vercel OIDC once deployed.
export default eveChannel({
  auth: [localDev(), vercelOidc()],
});
