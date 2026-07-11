---
name: Discord bot workflow restart can leave a zombie process
description: WorkflowsRestart on the Discord bot sometimes leaves the old tsx process alive, producing duplicate gateway connections and confusing interaction errors.
---

Restarting the `Discord Bot` workflow does not guarantee the previous `tsx src/index.ts` process
(and its child) actually exit. Both the old and new process can end up logged into the Discord
gateway simultaneously with the same bot token, both receiving the same `INTERACTION_CREATE`
events.

**Why:** two processes racing to handle the same interaction produces a very misleading error
pair: one process's `deferReply()`/`reply()` succeeds, and the other's fails with
`DiscordAPIError[10062]: Unknown interaction` immediately followed by
`DiscordAPIError[40060]: Interaction has already been acknowledged` when the fallback error-reply
also tries to respond. This can look exactly like a rendering/validation bug (e.g. it was mistaken
for the unrelated "Invalid number value" builder-validation issue) even though the actual render
code is fine — the symptom is nondeterministic and often "fixes itself" or reappears depending on
which process wins the race.

**How to apply:** if Control Center / slash-command errors look inconsistent, contradictory, or
"already fixed but still happening" right after a workflow restart, check
`ps aux | grep src/index.ts` for more than one pair of tsx processes before re-diagnosing the
application code. Kill the stale PIDs directly, then restart the workflow again and re-check
`ps aux` shows exactly one pair before concluding a code fix worked or failed.
