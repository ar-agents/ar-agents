# ar-agents

> AR Tools for the Vercel AI SDK — drop-in agent tools for Argentine integrations.

A monorepo of TypeScript packages that expose Argentina-specific services
(Mercado Pago, AFIP, WhatsApp Business Cloud, Meta Ads) as tools the
[Vercel AI SDK](https://ai-sdk.dev/) `Experimental_Agent` can invoke.

The thesis: building an AI agent that operates a real Argentine business
shouldn't take weeks of integration trial-and-error per platform. Each
package encapsulates the documented + undocumented gotchas as typed errors
and clean APIs.

> **Reading this as an agent?** Each package ships an `AGENTS.md` alongside
> its `README.md` — that's the format optimized for LLM consumption (tool
> selection rules, result schemas you can memorize, error patterns,
> composition with other packages, latency tables). See the table below for
> direct links.

## Packages

| Package | Status | README | AGENTS.md |
| --- | --- | --- | --- |
| [`@ar-agents/mercadopago`](./packages/mercadopago) | v0.1 alpha | [README](./packages/mercadopago/README.md) | [AGENTS.md](./packages/mercadopago/AGENTS.md) |
| [`@ar-agents/identity`](./packages/identity) | v0.1 alpha | [README](./packages/identity/README.md) | [AGENTS.md](./packages/identity/AGENTS.md) |
| `@ar-agents/whatsapp` (planned) | not yet | — | — |
| `@ar-agents/meta-ads` (planned) | not yet | — | — |

## Apps

| App | Port | Purpose |
| --- | --- | --- |
| [`apps/mp-hello`](./apps/mp-hello) | 3013 | Reference app: Vercel AI SDK + `@ar-agents/mercadopago` end-to-end demo |
| [`apps/cuit-hello`](./apps/cuit-hello) | 3014 | Reference app: CUIT/CUIL validation via `@ar-agents/identity` (agent + REST endpoints) |

## Documentation philosophy

This repo treats AI agents as first-class consumers of its docs. Inspired by
[Guillermo Rauch's "agent ergonomics" thesis](https://tech.hub.ms/azure/videos/keynote-interview-vercel-s-guillermo-rauch-on-the-agent-era-azure-cosmos-db-conf-2026)
("your customer is the agent the developer or non-developer is wielding")
and the emerging [agents.md convention](https://agents.md/), every package
ships two doc files:

| File | Audience | Contents |
| --- | --- | --- |
| `README.md` | Humans (devs evaluating the package) | Quick start, install, full API reference, examples |
| `AGENTS.md` | LLMs picking tools at runtime / agent authors | Tool selection rules, result schemas to memorize, error-recovery patterns, latency table, composition with other packages, AR context for non-AR agents |

Concrete principles applied throughout:

1. **Tool descriptions are the #1 surface.** Every tool's description tells
   the LLM WHEN to use it, WHEN NOT TO, what it returns, side effects, and
   constraints. This is the string the agent reads to decide.
2. **Pluggable adapters over global config.** Stateful or environment-dependent
   pieces (state stores, AFIP cert chains) are interfaces the consumer wires;
   the lib ships safe defaults that fail gracefully (e.g., `UnconfiguredAfipPadronAdapter`
   returns `available: false` with setup steps instead of throwing).
3. **Errors as docs.** Every typed error class carries an actionable message
   telling the user OR the agent how to recover. No cryptic codes without
   context.
4. **Progressive disclosure.** Tool results return just-in-time context
   (e.g., `next_step` field telling the agent what to do next) instead of
   bloating system prompts.
5. **JSDoc on every export.** Agents reading source for context need rich
   type-level docs, especially for the public API surface.

## Develop

Requires Node 20+ and pnpm 10+.

```bash
pnpm install
pnpm test         # run lib tests across packages
pnpm typecheck    # type-check all packages
pnpm build        # build all packages (writes dist/)
pnpm dev          # start the mp-hello demo on http://localhost:3013
```

To run the cuit-hello demo, use `pnpm --filter cuit-hello dev` (port 3014).

## Repo layout

```
ar-agents/
├── apps/
│   ├── mp-hello/                # Next.js demo for @ar-agents/mercadopago (3013)
│   └── cuit-hello/              # Next.js demo for @ar-agents/identity (3014)
├── packages/
│   ├── mercadopago/             # @ar-agents/mercadopago
│   └── identity/                # @ar-agents/identity
├── .github/workflows/ci.yml     # Typecheck + test + build on every push
├── package.json                 # workspace root
├── pnpm-workspace.yaml
└── tsconfig.base.json           # shared strict TS config
```

## Compatibility

- Node 20+
- Vercel AI SDK 6+
- Vercel AI Gateway for LLM routing (recommended; BYOK also works)
- Each package's peer deps in its own `package.json`

## License

MIT.
