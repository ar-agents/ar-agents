---
"@ar-agents/cli": patch
---

`ar-agents chat` works again: the bin entry now injects `process.stdin` (it never did, so chat always printed the needs-a-TTY message, even in a real terminal), and piped-stdin journeys exit cleanly on EOF instead of crashing with "readline was closed". Found by the M1-4e live terminal run.
