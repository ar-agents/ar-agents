# @ar-agents/identity-attest

> The "RENAPER workaround" pattern. Orchestrate identity verification (WhatsApp OTP, email magic-link, Auth0, MercadoPago Identity, SID gov) and get back a signed attestation with a trust level. Designed for AI agents that need to do KYC without institutional API access.

[![npm](https://img.shields.io/npm/v/@ar-agents/identity-attest.svg)](https://www.npmjs.com/package/@ar-agents/identity-attest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm provenance](https://img.shields.io/badge/npm%20provenance-SLSA%20v1-7C3AED?logo=npm)](https://docs.npmjs.com/generating-provenance-statements)

## The problem

RENAPER (the Argentine national identity registry) is closed to indie devs: $60/transaction, requires formal institutional agreement. There is no public API for "is this person who they say they are" in Argentina.

## The pattern

The agent doesn't verify directly. It **orchestrates** the user proving themselves via a third-party provider (WhatsApp OTP, email magic-link, Auth0, etc.) and receives a cryptographically-signed `Attestation` with a `trustLevel` (0..1). The agent then decides if the trust is sufficient for the action requested.

Think of it as: agent acts as the verifier of verifiers, not the verifier itself.

## Install

```bash
pnpm add @ar-agents/identity-attest ai zod
```

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import {
  AttestationClient,
  identityAttestTools,
  WhatsAppOtpAdapter,
  EmailMagicLinkAdapter,
} from "@ar-agents/identity-attest";
import { WhatsAppClient } from "@ar-agents/whatsapp";

const wa = new WhatsAppClient({
  accessToken: process.env.WA_ACCESS_TOKEN!,
  phoneNumberId: process.env.WA_PHONE_NUMBER_ID!,
});

const attestation = new AttestationClient({
  signingSecret: process.env.ATTEST_SIGNING_SECRET!, // openssl rand -hex 32
  adapters: {
    whatsapp_otp: new WhatsAppOtpAdapter({
      whatsappClient: wa,
      businessName: "LautaroSaaS",
    }),
    email_magic_link: new EmailMagicLinkAdapter({
      sender: async ({ to, subject, html }) => {
        // Your email provider here (Resend / SES / SMTP)
        await resend.emails.send({ from: "noreply@yourapp.com", to, subject, html });
      },
      callbackBaseUrl: "https://yourapp.com/api/identity-attest/callback",
      businessName: "LautaroSaaS",
    }),
  },
});

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  instructions: `Sos el asistente de billing. Para cobros > $20.000 requerís
trust >= 0.5 (email verificado). Para > $100.000 requerís 0.85+.
Si el usuario no tiene attestation suficiente, kickeá un verification flow.`,
  tools: identityAttestTools(attestation),
  stopWhen: stepCountIs(8),
});
```

## The two flow shapes

### OTP (WhatsApp / SMS / Email OTP)

```
agent → request_identity_verification(method="whatsapp_otp", subject=phone)
          → adapter sends 6-digit code via WhatsApp
agent → "Te mandé un código por WhatsApp, decime cuando lo recibas"
user → "el código es 482917"
agent → submit_otp_code(request_id, "482917") → returns Attestation
```

### Magic-link (Email)

```
agent → request_identity_verification(method="email_magic_link", subject=email)
          → adapter sends magic-link email
agent → "Te mandé un mail con un link, hacé click ahí"
user clicks link → handleAttestationCallback() validates token, signs attestation
agent (polling) → check_verification_status(request_id) → status="verified"
```

## Wire the magic-link callback

```ts
// app/api/identity-attest/callback/route.ts (Next.js app router)
import { NextRequest, NextResponse } from "next/server";
import { handleAttestationCallback } from "@ar-agents/identity-attest";
import { attestation } from "@/lib/attestation";

export async function GET(req: NextRequest) {
  const result = await handleAttestationCallback({
    query: Object.fromEntries(new URL(req.url).searchParams),
    client: attestation,
  });
  if (result.kind === "verified") {
    return new NextResponse(
      "<h1>Verificado ✓</h1><p>Volvé al chat.</p>",
      { headers: { "Content-Type": "text/html" } },
    );
  }
  return new NextResponse(`<h1>Error: ${result.reason}</h1>`, {
    status: 400,
    headers: { "Content-Type": "text/html" },
  });
}
```

## Trust levels

| Trust | Adapter | Proves |
|---|---|---|
| 0.3 | `WhatsAppOtpAdapter` | Controls a phone number right now |
| 0.5 | `EmailMagicLinkAdapter` | Controls an email right now |
| 0.7 | Auth0 / Cognito (planned for v0.2) | Has account at federated IdP |
| 0.85 | MercadoPago Identity (planned for v0.3) | Passed MP KYC |
| 0.95 | SID gov (planned, blocked on rollout) | Official identity |

## Tools provided

| Tool | Purpose |
|---|---|
| `list_verification_methods` | Returns registered adapters with trust levels |
| `request_identity_verification` | Start a verification flow |
| `submit_otp_code` | Submit OTP the user dictated back |
| `check_verification_status` | Poll status (for magic-link flows) |
| `get_attestation` | Fetch signed attestation for a completed verification |

See [AGENTS.md](./AGENTS.md) for when to use each.

## Persistence

Default `InMemoryAttestationStore` is fine for dev / single-process. For production / serverless, implement `AttestationStore`:

```ts
import type { AttestationStore } from "@ar-agents/identity-attest";

class RedisAttestationStore implements AttestationStore {
  async saveRequest(request, internal) { /* ... */ }
  async updateRequest(requestId, patch) { /* ... */ }
  async getRequest(requestId) { /* ... */ }
  async saveAttestation(attestation) { /* ... */ }
  async getAttestation(requestId) { /* ... */ }
  async listAttestationsForSubject(type, value) { /* ... */ }
}

const attestation = new AttestationClient({
  signingSecret: process.env.ATTEST_SIGNING_SECRET!,
  adapters: { ... },
  store: new RedisAttestationStore({ ... }),
});
```

## Adapters provided

- `WhatsAppOtpAdapter`: OTP via WhatsApp Cloud API (uses `@ar-agents/whatsapp`)
- `EmailMagicLinkAdapter`: magic link via your email provider (Resend / SES / SMTP: pluggable sender)

Building your own adapter is ~50 lines: implement the `AttestAdapter` interface (3 methods).

## Roadmap

- v0.2: `Auth0Adapter`, `CognitoAdapter`, `MagicLinkSdkAdapter`
- v0.3: `MercadoPagoIdentityAdapter` (uses MP's KYC level data)
- v0.x: `SidGovAdapter` when AR's SID API opens to private dev access

## License

MIT: © Nazareno Clemente

## Stability

This package is **pre-1.0**. Per [npm convention](https://docs.npmjs.com/about-semantic-versioning), **0.x minor versions may include breaking changes**. We document every breaking change in `CHANGELOG.md` under the corresponding minor bump and flag it explicitly. To avoid surprises:

```bash
# Pin to exact version (recommended for production):
pnpm add @ar-agents/<package>@<exact-version>
```

We commit to **no breaking changes within a patch version**, and we publish `1.0.0` once the public API has stabilized across at least two consecutive minor releases.
