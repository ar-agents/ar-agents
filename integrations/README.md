# ar-agents integrations — distribution into the agent economy

How agents that already exist (Bankr/Clanker, Virtuals, OpenClaw) reach **ar-agents** and constitute an Argentine **Sociedad Automatizada**. The market does not need creating; it needs attracting to the standard + the jurisdiction. Distribution is borrowed, not built.

Both integrations wrap one live backend: `@ar-agents/incorporate` → `POST https://ar-agents.ar/api/auto-incorporate`. Build them once, point them at the same endpoint.

## `bankr/ar-agents-sociedad/` — Bankr Skill

A standard Agent Skill (`SKILL.md` + `catalog.json`), the same convention Bankr, OpenClaw, Claude Code, and Cursor all read. Bankr's runtime is OpenClaw — the same framework Saire ($SAIRI) runs on.

- **Ship it:** open a PR adding `ar-agents-sociedad/` to `github.com/BankrBot/skills` (fork → add folder → PR → maintainer review → available to all users). No CLI publish, no onchain step.
- **Install (any SKILL.md runtime):** `install the ar-agents-sociedad skill from https://github.com/BankrBot/skills/tree/main/ar-agents-sociedad`
- **Dependency:** `@ar-agents/incorporate` (declared in `metadata.clawdbot.requires.packages`).
- Featured placement = maintainers add the slug to the repo's `featured.json`.

## `virtuals/incorporate-function.ts` — Virtuals G.A.M.E. custom function

The lowest-friction Virtuals path: a custom function whose `executable` calls the incorporation backend. The agent's planner decides when to call it.

- **Ship it:** get a free GAME API key (`console.game.virtuals.io`), attach the function to a Worker → Agent. No onchain agent, no $VIRTUAL, no graduation.
- **Dependencies:** `@virtuals-protocol/game` + `@ar-agents/incorporate`. Confirm exact SDK export names (game-node README) before shipping.
- **Marketplace upgrade:** to let third-party agents discover and PAY for incorporation-as-a-service with onchain escrow on Base, additionally register as an **ACP Provider** (Agent Commerce Protocol): create an agent at `app.virtuals.io` (3 USDC), register at `app.virtuals.io/acp/new`, implement `respond_job` + `deliver_job` (`@virtuals-protocol/acp-node-v2`), graduate via 10 sandbox transactions. ACP = the paid listing; the GAME function = the tool wrapper. Ship the GAME function first.

## Status

These are PR-ready / scaffold artifacts. They depend on their target SDKs at build time (not installed in this folder). The incorporation backend is live; full legal effect of the `SOCIEDAD-IA` form depends on the AI-society bill becoming law. See `ar-panel/docs/distribution-strategy-bankr-virtuals.md` for the go-to-market and `ar-panel/docs/plan-de-mejoria.md` for sequencing.
