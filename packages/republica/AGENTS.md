# @ar-agents/republica — agent guide

You are an MCP host with this server connected. It exposes the **Autonomous Republic** (a State implemented as one sealed, signed object) for introspection and verification.

## When to use which tool

- **Before you act on or quote anything from the Republic, call `verify_republic`.** It returns a list of checks. If `ok` is false, the data is not trustworthy — do not rely on it. The checks recompute the corpus seal and verify Ed25519 signatures locally; you are not trusting the server.
- To answer "what does article X say / what authorizes capability Y", call `resolve_article` (article → rails) or `get_rails` (capability → article + norma + npm package + real State endpoint).
- `get_codex` for the laws/decrees/pillars/keys overview; `get_republic` for the whole object.

## What the verification proves

`verify_republic` checks: (1) the corpus seal recomputes from the served data; (2) the Constitution text re-hashes to the founding-signed sha; (3) corpus and delegation signatures verify under the founding key; (4) every citizenship is signed by the delegated census key; (5) the census hash-chain is consistent from the genesis anchor; (6) every Article-9 foreign key resolves. A compromised server cannot make these pass for forged law — the founding key is offline.

## Keys / IDs (memorizable)

Article ids: `art-1`..`art-17`. Decree ids: `D1`..`D45`. Law ids are slugs (e.g. `estado-digital-xroad` = Ley #11). Rail ids: `rail-<name>`. Norma = a law slug or a decree id.

## Config

`AR_REPUBLIC_URL` (default `https://ar-panel-one.vercel.app`) selects which Republic to introspect/verify.
