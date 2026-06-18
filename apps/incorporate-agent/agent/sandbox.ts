import { defineSandbox, defaultBackend } from "eve/sandbox";

// eve gives the agent an isolated sandbox for its framework tools (bash, file
// IO). This agent does its real work through typed tools + the MCP connection
// in the eve runtime, not through shell commands, so the sandbox needs NO
// network egress. Locking it to "deny-all" means a prompt-injected model that
// reaches for bash cannot exfiltrate anything: the irreversible legal/fiscal
// data this agent handles never leaves through the sandbox.
//
// This is the "the infra is the output of your creation" idea as one control:
// the right network posture for an incorporation agent, expressed as a file.
export default defineSandbox({
  backend: defaultBackend({ vercel: { networkPolicy: "deny-all" } }),
});
