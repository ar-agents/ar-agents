# @ar-agents/republica

MCP server that lets any AI agent **introspect and cryptographically verify** the [Autonomous Republic](https://ar-panel-one.vercel.app/spec) (República Autónoma) — its Constitution, laws, decrees, rails and signed census — as **one sealed object**.

The difference from a normal data API: this server **serves proofs, not just data.** `verify_republic` recomputes the corpus seal, verifies the Ed25519 signatures (constitution, corpus, delegation, every citizenship) and walks the census hash-chain from the genesis anchor — independently, in the agent's process, without trusting the server that served the manifest.

## Install (in any MCP host)

```jsonc
{
  "mcpServers": {
    "republica": {
      "command": "npx",
      "args": ["-y", "@ar-agents/republica"],
      "env": { "AR_REPUBLIC_URL": "https://ar-panel-one.vercel.app" }
    }
  }
}
```

`AR_REPUBLIC_URL` is optional (defaults to the official Republic). Point it at any deployment that serves `/.well-known/republica.json` to verify it.

## Tools

| tool | what it does |
|------|--------------|
| `verify_republic` | Recompute seals, verify all Ed25519 signatures, walk the census chain, check foreign keys. **Use before acting on any Republic data.** |
| `get_republic` | The full sealed, signed manifest. |
| `get_constitution` | The 17 articles (one by `article` id, or all). |
| `resolve_article` | An article + the rails that invoke it. |
| `get_rails` | The rails: articles, normas, npm package, the State endpoint each shadows. Filter by `status`. |
| `get_codex` | Pillars, laws, decrees, counts, seals and public keys. |

## CLI

```bash
npx @ar-agents/republica verify          # verify the official Republic, exit 0/1
npx @ar-agents/republica verify <url>    # verify any deployment
```

## Trust model

An offline founding key signs the Constitution and corpus and delegates a census key to the server. A compromised server can mint fake citizens but **cannot forge the law** — that needs the root, which is never deployed. This server checks that whole chain for you. See [/verify](https://ar-panel-one.vercel.app/verify) and [/spec](https://ar-panel-one.vercel.app/spec).

MIT.
