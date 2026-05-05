# ar-agents

> AR Tools for the Vercel AI SDK — drop-in agent tools for Argentine integrations.

A monorepo of TypeScript packages that expose Argentina-specific services
(Mercado Pago, AFIP, WhatsApp Business Cloud, Meta Ads) as tools the
[Vercel AI SDK](https://ai-sdk.dev/) `Experimental_Agent` can invoke.

The thesis: building an AI agent that operates a real Argentine business
shouldn't take weeks of integration trial-and-error per platform. Each
package encapsulates the documented + undocumented gotchas as typed errors
and clean APIs.

## Packages

| Package                                          | Status      | Purpose                                        |
| ------------------------------------------------ | ----------- | ---------------------------------------------- |
| [`@ar-agents/mercadopago`](./packages/mercadopago) | v0.1 alpha  | Mercado Pago Subscriptions for AI agents       |
| `@ar-agents/identity` (planned)                  | not yet     | CUIT validation + AFIP webservices             |
| `@ar-agents/whatsapp` (planned)                  | not yet     | WhatsApp Business Cloud API helpers            |
| `@ar-agents/meta-ads` (planned)                  | not yet     | Meta Marketing API for AR ad accounts          |

## Apps

| App                         | Purpose                                              |
| --------------------------- | ---------------------------------------------------- |
| [`apps/mp-hello`](./apps/mp-hello) | Reference app: Vercel AI SDK + `@ar-agents/mercadopago` end-to-end demo |

## Develop

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm test         # run lib tests
pnpm typecheck    # type-check all packages
pnpm build        # build all packages (writes dist/)
pnpm dev          # start the mp-hello demo app on http://localhost:3013
```

## Repo layout

```
ar-agents/
├── apps/
│   └── mp-hello/                # Next.js demo app
├── packages/
│   └── mercadopago/             # @ar-agents/mercadopago
├── package.json                 # workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json           # shared TS config
```

## Compatibility

- Node 20+
- Vercel AI SDK 6+
- Vercel AI Gateway for LLM routing (recommended; BYOK also works)

## License

MIT.
