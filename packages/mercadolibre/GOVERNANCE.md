# Governance — `@ar-agents/mercadolibre`

> How decisions get made, how the project survives a single maintainer, and how you become one.

## Current state

- **Maintainer:** Nazareno Clemente ([@naza00000](https://github.com/naza00000), naza@helloastro.co).
- **Bus factor:** 1.
- **Decisions:** Made by the maintainer. Documented via PRs + CHANGELOG entries. No formal review process beyond GitHub PR review.

This is honest, not aspirational. If you're evaluating this package for production adoption, weigh that bus factor against your risk tolerance.

## How decisions get made today

| Type | Process | Who decides |
| --- | --- | --- |
| **Bug fixes** | PR + green CI + maintainer LGTM | Maintainer |
| **API additions (non-breaking)** | PR + green CI + cookbook entry if user-facing | Maintainer |
| **Breaking changes** | PR + CHANGELOG with explicit BREAKING marker + version bump | Maintainer |
| **Security patches** | Privately disclosed via SECURITY.md → patch → publish → coordinated disclosure | Maintainer |
| **Strategic direction** (e.g., new subpath, ACP feed, MCP integration) | Public RFC issue → discussion → maintainer decision | Maintainer |
| **Trademark / legal** | When in doubt, defer to honesty + nominative-fair-use guidance | Maintainer |

## Bus-factor de-risking

We acknowledge this is the biggest adopter concern. Three mitigations are active:

### 1. The fork right (legal floor)

MIT-licensed. If the maintainer stops responding, anyone can fork the repo, publish under a different scope, and continue maintenance. No contractual barrier.

### 2. The co-maintainer path (active)

We are **actively seeking** a second maintainer. The bar isn't "best contributor" — it's "demonstrated commitment over time + judgment we trust."

**How to get there:**

1. **Open 3+ substantive PRs.** Bug fixes, new test coverage, cookbook recipes, doc improvements. Substance > volume.
2. **Stay engaged for 30+ days.** Respond to issue questions, review other people's PRs, answer questions on GitHub Discussions.
3. **Email** `naza@helloastro.co` with subject `[co-maintain]` and links to your PRs. The maintainer responds within 7 days.
4. **Trial period (30 days).** Triage rights on the repo. Joint decision-making on PRs.
5. **Permanent slot.** npm publish rights, GitHub admin, decision authority.

Co-maintainers receive equal credit in the README + CHANGELOG. There's no compensation today — the trade is technical reputation + a co-maintained piece of LATAM dev infrastructure.

### 3. The deprecation lane (worst case)

If maintenance halts and no co-maintainer steps in:

- The npm package will receive a `deprecate` notice with a recommended fork.
- The GitHub repo will be archived with a link to active forks.
- The MCP server entries will be unregistered from public registries.

This minimizes the risk of an abandoned-but-still-installed package shipping silent vulnerabilities.

## Strategic decisions log

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-05-09 | Keep the package name `@ar-agents/mercadolibre` despite trademark risk | Renaming would break 41 weekly downloads + cascading work in @ar-agents/mcp + bridge-hello + landing. Mitigated via prominent nominative-fair-use disclaimer. |
| 2026-05-09 | ACP feed defaults to opt-in (403 unless explicitly enabled) | The default position is "preserve marketplace-buyer relationship." Sellers explicitly opt in only when they understand the disintermediation tradeoff. |
| 2026-05-09 | HITL gates programmatic, not system-prompt | LLMs can ignore system prompts; they can't ignore a function call that doesn't fire. |

## Out-of-scope

- We do not build `@mercadolibre/*`-scoped packages. The `mercadolibre` npm scope belongs to Mercado Libre S.R.L.
- We do not ship buyer-side tools that bypass MELI's checkout (other than the opt-in feed).
- We do not maintain forks for languages other than TypeScript/JavaScript. PHP / Ruby / Python forks are welcome but live in their own repos.

## How to influence the roadmap

1. Open a GitHub Discussion describing your use case (not your proposed solution).
2. The maintainer responds within 7 days with one of: "happy to merge a PR", "out of scope, here's why", or "let me think about it (responds within 30 days)".
3. If the answer is "happy to merge", open the PR. CI must be green.

## Contact

- General: `naza@helloastro.co`
- Co-maintain: `naza@helloastro.co` subject `[co-maintain]`
- Security: `naza@helloastro.co` subject `[security]`
- Vendor / commercial: `naza@helloastro.co` subject `[vendor]`
