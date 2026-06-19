# incorporate-agent

An [eve](https://vercel.com/blog/introducing-eve) agent that incorporates and operates an Argentine **Sociedad Automatizada** (art. 14 of the draft General Companies Law), built on [ar-agents](https://ar-agents.ar).

It turns incorporation into a conversation: the agent gathers the company data, validates the administrator's CUIT against the Argentine state, drafts the plan, and then **pauses for a human to approve before the company is constituted**. That pause is not UX polish. Art. 102 makes the human administrator liable for what the AI does and bars delegating the supervision duty, so a person signs off on the irreversible step. In eve that is one line: `needsApproval: always()`. Every action lands in a signed, offline-verifiable audit log (RFC-004/006), which is the art. 101/102 evidence.

## How it is wired

| eve slot | What it does |
| --- | --- |
| `agent/agent.ts` | Model via the AI Gateway (Opus 4.8, provider fallbacks). |
| `agent/instructions.md` | The incorporation assistant, in Argentine Spanish. |
| `agent/connections/ar-agents.ts` | MCP connection to `https://ar-agents.ar/api/mcp` (zero-credential Argentine tools: CUIT/CBU validation, fiscal calculators, BCRA lookups). No code change needed; ar-agents' MCP speaks Streamable HTTP, which is what eve consumes. |
| `agent/tools/incorporar_sociedad.ts` | Incorporates via `POST /api/auto-incorporate`. `needsApproval: always()` (art. 102). |
| `agent/tools/registrar_decision.ts` | Appends a signed entry to El Auditor's audit log. |
| `agent/skills/*.md` | The legal rules (Sociedad Automatizada) and the AFIP/ARCA landmines, loaded on demand. |
| `evals/*.eval.ts` | The denomination + supervision facts, and the safety property that incorporation parks for approval. |

## Run it

eve requires Node >= 24.

```bash
cd apps/incorporate-agent
pnpm install
pnpm dev          # eve dev, opens the chat UI on localhost
pnpm eval         # eve eval, runs the evals
```

Env:

- `AI_GATEWAY_API_KEY` (or a provider key) for the model.
- `AUDITOR_API_KEY` (optional, from `POST /api/auditor/activate`) to write durable signed audit entries. Without it, `registrar_decision` returns a structured "not configured" result.

The regime is a draft bill in the Senate, not law yet. This is a reference implementation and a verifiable demo, not a registered company.
