# `@ar-agents/cli` agent guide

Runtime guide for LLM agents that shell out to this CLI. Read once.

## What this package is

A thin command-line client for the ar-agents studio's account API:
`ar-agents login` (mint an anonymous account, or attach an existing token)
and `ar-agents whoami` (print the active account's usage, monthly cap, and
society status). No model calls, no live network required to run its own
test suite.

## When to use which command

| Goal | Command | Notes |
|---|---|---|
| Start a session with a brand-new account | `ar-agents login` | No flags: mints a fresh anonymous account and stores the token locally |
| Attach an existing account | `ar-agents login --token <t>` | Validates the token against the studio before storing it |
| Check the active account | `ar-agents whoami` | Exits 1 with a hint if no session is stored yet |

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
- Any command beyond `login` / `whoami` / `help` / `version`
