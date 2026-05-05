# Security Policy

## Reporting a vulnerability

If you discover a security vulnerability in any `@ar-agents/*` package, please report it privately rather than opening a public GitHub issue.

**Email:** clementenaza@gmail.com

Include in your report:
- Affected package and version
- A description of the vulnerability and its impact
- A minimal proof of concept (if you have one)
- Any suggested mitigation

We aim to acknowledge reports within 48 hours and provide a remediation plan within 7 days for confirmed issues. Critical issues are patched as quickly as practical and a fix is published with a CVE assignment if appropriate.

## Supported versions

Only the latest minor of each package on npm is actively maintained. We do not backport security fixes to older minors during the 0.x phase.

| Package | Supported |
| --- | --- |
| `@ar-agents/mercadopago` | Latest 0.x |
| `@ar-agents/identity` | Latest 0.x |

## Scope

In-scope vulnerabilities include:
- Code execution from untrusted input passed to library functions
- Token / secret leakage via library logging or error messages
- Bypass of typed validation (e.g., a CUIT that passes `validate_cuit` but isn't valid per AFIP)
- Webhook signature validation bypass in `@ar-agents/mercadopago`'s `verifyWebhookSignature`
- Anything that lets an attacker make Mercado Pago / AFIP / WhatsApp API calls on behalf of a consumer of these libs

Out of scope:
- Vulnerabilities in upstream services (Mercado Pago, AFIP, Vercel, Upstash). Report those to the respective vendor.
- Security misconfigurations in apps that consume these libs (that's the consumer's responsibility).
- Vulnerabilities in the `apps/*` reference apps unless you can show they affect the published packages too.

## Disclosure timeline

We follow coordinated disclosure. Please give us a reasonable window (typically 90 days for critical issues, 30 days for low-severity) before publishing the vulnerability publicly. We'll credit reporters in the published advisory unless requested otherwise.
