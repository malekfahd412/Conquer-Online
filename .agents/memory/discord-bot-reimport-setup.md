---
name: Discord bot re-import setup steps
description: What breaks every time this project is freshly imported/re-imported, and what to fix before the bot runs.
---

Every fresh import of this project starts broken in two ways, both expected and quick to fix:

1. `node_modules` is not preserved — the Discord Bot workflow fails with `tsx: command not found`. Fix: run `pnpm install` at the repo root.
2. Secrets (`DISCORD_BOT_TOKEN`, `GEMINI_API_KEY`) are not preserved — the bot then fails with `Missing required environment variable`. Fix: request them from the user via `requestSecrets`.

**Why:** import/re-import does not carry over installed deps or secrets, so this sequence recurs on every re-import even though the code itself is unchanged and previously verified working.

**How to apply:** on a "set up the imported project" task for this repo, check both `node_modules` presence and secret existence before diagnosing further — don't assume the code regressed.
