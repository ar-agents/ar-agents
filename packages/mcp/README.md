# @ar-agents/mcp

> One MCP server that bundles the entire `@ar-agents/*` toolkit: CUIT validation, AFIP/ARCA padron lookup, identity attestation, MercadoPago Payments + Subscriptions + Cuotas, WhatsApp Business: into any MCP host (Claude Desktop, Cursor, Codeium, Continue, Cline, etc.).

[![npm](https://img.shields.io/npm/v/@ar-agents/mcp.svg)](https://www.npmjs.com/package/@ar-agents/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm provenance](https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7C3AED?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)
[![ar-agents on Glama](https://glama.ai/mcp/servers/ar-agents/ar-agents/badges/score.svg)](https://glama.ai/mcp/servers/ar-agents/ar-agents)
[![MCP Registry](https://img.shields.io/badge/MCP%20Registry-io.github.ar--agents%2Fmcp-181717?logo=github)](https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ar-agents/mcp)

## What is this

This package is the **MCP server wrapper** around the `@ar-agents/*` packages. If you're building agents in Vercel AI SDK 6 directly, you don't need this: install the individual packages. If you want to use the AR toolkit from **Claude Desktop, Cursor, Codeium, or any MCP host**, this is your one-stop install.

## Quick start (Claude Desktop)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "ar-agents": {
      "command": "npx",
      "args": ["-y", "@ar-agents/mcp"],
      "env": {
        // All env vars are optional: set the ones for the integrations you need.
        // Without any: only `validate_cuit` (algorithm-only) is available.

        // MercadoPago: enables 21 payment / subscription tools
        "MP_ACCESS_TOKEN": "TEST-...-or-APP_USR-...",
        "MP_BACK_URL": "https://yourapp.com/done",

        // AFIP/ARCA: enables `lookup_cuit_afip` (real padron data)
        "AFIP_CUIT_REPRESENTADO": "20XXXXXXXXY",
        "AFIP_CERT_PEM": "-----BEGIN CERTIFICATE-----\n...",
        "AFIP_KEY_PEM": "-----BEGIN PRIVATE KEY-----\n...",
        "AFIP_ENV": "prod", // or "homo"

        // WhatsApp Business: enables 6 messaging tools
        "WA_ACCESS_TOKEN": "EAA...",
        "WA_PHONE_NUMBER_ID": "...",

        // Identity Attestation: enables 5 verification tools
        "ATTEST_SIGNING_SECRET": "openssl rand -hex 32 result here",
        "BUSINESS_NAME": "Your Company",
        "RESEND_API_KEY": "re_...",                // optional, enables email_magic_link adapter
        "ATTEST_CALLBACK_URL": "https://yourapp.com/api/identity-attest/callback",
        "ATTEST_FROM_EMAIL": "noreply@yourapp.com"
      }
    }
  }
}
```

Restart Claude Desktop. Look for the wrench icon → ar-agents tools should appear.

## Quick start (Cursor)

Edit `~/.cursor/mcp.json`:

```jsonc
{
  "mcpServers": {
    "ar-agents": {
      "command": "npx",
      "args": ["-y", "@ar-agents/mcp"],
      "env": {
        "MP_ACCESS_TOKEN": "TEST-...",
        // ... same env vars as above
      }
    }
  }
}
```

Restart Cursor. The tools appear in your chat panel's tool picker.

## Quick start (any other MCP host)

Same pattern. Anything that supports MCP stdio servers works:
- **Codeium**: set in `Settings → MCP servers`
- **Continue**: `~/.continue/config.json` → `experimental.modelContextProtocolServers`
- **Cline**: `cline_mcp_settings.json`

## What tools you get

The set of tools depends on which env vars you set. Without any env vars: only `validate_cuit` (algorithm-only) is registered. With all env vars set:

| Source | Tools |
|---|---|
| `@ar-agents/identity` (always on) | `validate_cuit`, `lookup_cuit_afip` (when AFIP vars set) |
| `@ar-agents/identity-attest` (when `ATTEST_SIGNING_SECRET` set) | `list_verification_methods`, `request_identity_verification`, `submit_otp_code`, `check_verification_status`, `get_attestation` |
| `@ar-agents/mercadopago` (when `MP_ACCESS_TOKEN` set) | 21 tools: `create_payment_preference`, `create_payment`, `search_payments`, `refund_payment`, `calculate_installments`, `create_subscription`, `create_customer`, `list_customer_cards`, `list_payment_methods`, `get_account_info`, `cancel_payment`, `capture_payment`, `list_refunds`, `get_payment`, `get_payment_preference`, `find_customer_by_email`, `delete_customer_card`, `pause_subscription`, `resume_subscription`, `cancel_subscription`, `get_subscription_status` |
| `@ar-agents/whatsapp` (when WA vars set) | 6 tools: `send_whatsapp_text`, `send_whatsapp_template`, `send_whatsapp_media`, `send_whatsapp_buttons`, `send_whatsapp_list`, `mark_whatsapp_read` |

**Total: up to 34 tools** for AR agents in one MCP install.

## Verifying it works

Run the binary directly to see the registered-tools summary:

```bash
npx @ar-agents/mcp
# Outputs to stderr (stdout is reserved for MCP protocol):
#   ar-agents@0.1.0 starting with N tools registered:
#     identity      → validate_cuit + lookup_cuit_afip (AFIP cert configured)
#     mercadopago   → PROD mode · back_url=...
#     whatsapp      → phone_number_id=...
#     identity-attest → whatsapp_otp, email_magic_link
```

If you see "not configured", check your env vars match what each package expects.

## When to use this vs the individual packages

| Use this (`@ar-agents/mcp`) | Use the individual packages |
|---|---|
| Claude Desktop / Cursor / Codeium user | Building a Vercel AI SDK 6 agent in your own Node app |
| Want the toolkit available in your IDE | Want fine-grained control over which tools an Agent registers |
| Don't want to write any code | Already have an `Agent({ tools })` setup |

The npm packages and the MCP server expose **identical functionality**: same tool names, same schemas, same behavior. The MCP server is just a different transport.

## Troubleshooting

**"validate_cuit only": no other tools showing**
→ You haven't set any env vars. Check the env section of your MCP config.

**MercadoPago tool calls fail with 401**
→ Your `MP_ACCESS_TOKEN` is wrong or expired. Test users in sandbox have their own tokens; don't mix prod/test.

**AFIP `lookup_cuit_afip` returns "not configured"**
→ You set `MP_ACCESS_TOKEN` but missed `AFIP_CUIT_REPRESENTADO` + cert vars. Each integration is independent.

**Magic-link adapter not registered (identity-attest)**
→ You set `ATTEST_SIGNING_SECRET` but not `RESEND_API_KEY` + `ATTEST_CALLBACK_URL`. The adapter needs both.

**Tool names collide**
→ Open an issue at github.com/ar-agents/ar-agents: we'll prefix tool names in v0.2 if collisions become common.

## License

MIT: © Nazareno Clemente

## Stability

This package is **pre-1.0**. Per [npm convention](https://docs.npmjs.com/about-semantic-versioning), **0.x minor versions may include breaking changes**. We document every breaking change in `CHANGELOG.md` under the corresponding minor bump and flag it explicitly. To avoid surprises:

```bash
# Pin to exact version (recommended for production):
pnpm add @ar-agents/<package>@<exact-version>
```

We commit to **no breaking changes within a patch version**, and we publish `1.0.0` once the public API has stabilized across at least two consecutive minor releases.
