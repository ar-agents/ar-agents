# `@ar-agents/cli` agent guide

Runtime guide for LLM agents that shell out to this CLI. Read once.

## What this package is

A thin command-line client for the ar-agents studio's account + agent APIs:
`ar-agents login` (mint an anonymous account, or attach an existing token),
`ar-agents whoami` (print the active account's usage, monthly cap, and
society status), and `ar-agents chat` (an interactive session with the
studio's coach, streaming `POST /api/agent`'s UI-message response). The
stream parser and message-history builder are pure and unit-tested against
recorded fixtures; only the readline loop itself needs a live model call.

## When to use which command

| Goal | Command | Notes |
|---|---|---|
| Start a session with a brand-new account | `ar-agents login` | No flags: mints a fresh anonymous account and stores the token locally |
| Attach an existing account | `ar-agents login --token <t>` | Validates the token against the studio before storing it |
| Check the active account | `ar-agents whoami` | Exits 1 with a hint if no session is stored yet |
| Talk to the coach | `ar-agents chat` | Exits 1 with a hint if no session is stored yet; needs a TTY (stdin) to run interactively |

## Where state lives

The token and studio URL are written to a config file under the OS config
directory (see README.md), with `0600` permissions. The token is never
printed to stdout or stderr by any command.

## Error model

- `AccountClientError`: non-2xx or malformed response from the studio;
  the CLI surfaces its message and returns exit code 1, it does not retry.

## What this package does NOT cover (v0.1)

- Constituting or managing a sociedad (see the studio app + `@ar-agents/*`
  toolkit packages for that)
- Any command beyond `login` / `whoami` / `chat` / `help` / `version`
- `chat`'s tools are read-only/dry-run on the server side (notably
  `preview_society`): there is no "constitute" tool reachable from chat
