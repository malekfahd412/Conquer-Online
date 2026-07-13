---
name: Production readiness audit findings
description: Key bugs and patterns found during the full production audit — things that could recur if new code follows old patterns.
---

## Patterns that caused bugs (avoid repeating)

**`store.ts` read() returns a deep clone now**
All callers of `store.read()` receive a deep-cloned copy. `mutate()` still operates on the live cache. If you add a new JsonStore usage, do not assume `read()` returns the live object.

**Serialized write queues for case-like counters**
`allocateCaseId` in `mod-config-store.ts` was a classic read-modify-write race. Any future counter that needs uniqueness under concurrency must use a Promise-chain write queue (see the `caseIdQueue` pattern). The ticket store already uses this via `mutate()`.

**Discord ActionRow button limit**
Max 5 buttons per ActionRow. Any code that maps a user-configurable array into a single ActionRow must call `.slice(0, 5)` first. Found in `welcome.service.ts` — check any future configurable button arrays.

**Auto-delete after close must re-read ticket status**
A `setTimeout` that deletes a Discord channel must re-read the ticket record inside the callback to confirm it is still closed — the ticket could be reopened before the timer fires. Pattern is in `ticket-engine.ts`.

**SLA / automation sweepers need per-iteration try/catch**
Any loop that iterates across guilds/records and calls async Discord API methods needs `try/catch` inside the loop body. One guild fetch failure should never crash the entire sweep.

**Transcript deliver() should iterate formats array**
When delivering transcripts, iterate `cfg.transcript.formats` and attach one file per format. Do not short-circuit with `includes('html') ? html : md`.

**`permissionOverwrites.edit(target, {})` is a no-op**
Passing an empty options object to `permissionOverwrites.edit` makes no changes. To fully restore a channel's permission overwrites use `channel.permissionOverwrites.set(overwrites)`.

**Verification emoji wrong-click must track failures**
All verification method handlers (button, modal, emoji) must call `incrementFail()` + `upsertAttempt()` on failure so attempt counts are consistent. The emoji handler was missing this.

**Ghost-ping mention cache needs a periodic prune**
Any module-level `Map` used as a time-bounded cache must have `setInterval(prune, TTL)` wired in the `start()` method, not just a `pruneCache` function that is never called.
