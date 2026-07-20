# @ar-agents/cli

## 0.1.1

### Patch Changes

- [#233](https://github.com/ar-agents/ar-agents/pull/233) [`63492f5`](https://github.com/ar-agents/ar-agents/commit/63492f5fddc8010ef38720af5c4ec502f247094a) Thanks [@naza00000](https://github.com/naza00000)! - `ar-agents chat` works again: the bin entry now injects `process.stdin` (it never did, so chat always printed the needs-a-TTY message, even in a real terminal), and piped-stdin journeys exit cleanly on EOF instead of crashing with "readline was closed". Found by the M1-4e live terminal run.

## Unreleased

- `ar-agents chat`: an interactive session with the studio's coach, streaming
  the `POST /api/agent` UI-message response (text incrementally, plus tool
  activity such as `preview_society` drafts) and keeping message history
  across turns. The stream parser and message-history builder are pure and
  unit-tested against recorded fixtures; the readline loop itself stays thin
  and is exercised against a live model separately.

## 0.1.0

### Minor Changes

- Initial release: `ar-agents login` (mint an anonymous studio account, or
  attach an existing token with `--token`) and `ar-agents whoami` (print the
  active account's id, usage, monthly cap, and society status). Talks to
  the studio's `/api/account` contract over plain `fetch`; the session token
  is stored under the OS config directory with `0600` permissions and is
  never printed to stdout or stderr.
