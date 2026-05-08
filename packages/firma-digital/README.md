# `@ar-agents/firma-digital`

> Argentine Firma Digital (Ley 25.506 / ONTI) verification primitives as drop-in tools for the Vercel AI SDK 6.

```bash
pnpm add @ar-agents/firma-digital ai zod
```

Part of the [`Arg`](https://ar-agents.vercel.app) toolkit — open infrastructure for the Argentine AI agent jurisdiction.

## What this gives you

- **Parse X.509 certs** issued under AR Firma Digital and extract subject info, CUIT (when embedded), validity dates, public-key info.
- **Verify cert chains** anchored at AC-Raíz Argentina / ONTI. Heuristic root detection (matches subject DN patterns) plus explicit trust-anchor pinning by fingerprint.
- **Verify CMS / PKCS#7 detached signatures** over arbitrary payloads (e.g., `firma.p7s` produced by AR signing tools).
- **Pure helpers** for AR-ONTI heuristic checks, exported standalone.

This package is for **VERIFICATION**, not signing. AR Firma Digital signing requires a hardware token (eToken, smartcard) or a managed-CSP service that exposes a remote-signing API — out of scope here.

## Quick start

```ts
import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { firmaDigitalTools } from "@ar-agents/firma-digital";

const agent = new Agent({
  model: "anthropic/claude-sonnet-4-6",
  tools: firmaDigitalTools(),
  stopWhen: stepCountIs(6),
});

const { text } = await agent.generate({
  prompt:
    "Tengo este cert PEM `-----BEGIN CERTIFICATE-----...`. ¿Es de Firma Digital argentina? ¿Quién es el titular?",
});
```

## Direct API

```ts
import { parseCert, verifyChain, verifyDetachedCmsSignature } from "@ar-agents/firma-digital";

// Parse a cert.
const cert = parseCert(pem);
console.log(cert.commonName, cert.cuit, cert.isOntiIssued);

// Verify a chain (leaf-first PEM bundle).
const result = verifyChain(chainPem);
if (!result.valid) console.error(result.reason);

// Verify a detached CMS signature (e.g., contents of firma.p7s).
const verified = verifyDetachedCmsSignature(p7sPem, payloadBytes);
console.log(verified.valid, verified.signers[0]?.cert.cuit);
```

## Tool surface

| Tool                          | Purpose                                                    |
| ----------------------------- | ---------------------------------------------------------- |
| `firma_inspect_cert`          | Parse one PEM cert → structured info.                      |
| `firma_verify_chain`          | Validate a chain leaf → root anchored at AC-Raíz / ONTI.   |
| `firma_is_onti_issued`        | Quick yes/no for "AR Firma Digital".                       |
| `firma_verify_cms_signature`  | Verify a detached PKCS#7 over a base64 payload.            |

See [`AGENTS.md`](./AGENTS.md) for tool selection rules.

## What this is NOT

- **NOT a signing library.** Argentine Firma Digital signing requires hardware tokens or managed-CSP API.
- **NOT a full PAdES verifier.** PAdES-LTV (timestamp-token validation, OCSP, CRL) is out of scope. For long-term-validity scenarios pair with a dedicated PDF library.
- **NOT a TSL trust list resolver.** The package ships heuristic AR-ONTI matching plus explicit fingerprint pinning. Production callers should pass current AC-Raíz certs from [argentina.gob.ar/jefatura/innovacion-publica/ic/ac-raiz](https://www.argentina.gob.ar/jefatura/innovacion-publica/ic/ac-raiz).

## License

MIT © Nazareno Clemente
