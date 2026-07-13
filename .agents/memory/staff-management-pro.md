---
name: Staff Management Pro architecture
description: Event-bus decoupled staff tracking/shift/points/goals/reports subsystem for the Discord bot; how it hooks into Tickets, Moderation, Verification, and AI tools without those systems depending on it.
---

## Event-bus decoupling pattern
A single `staffEventBus` (EventEmitter singleton) is the only coupling point between Staff Management Pro and every action-producing system (Tickets, Moderation, Verification, voice-control AI tools, security-report tool). Those systems call `staffEventBus.emitAction({ guildId, userId, action, ... })` as a one-line fire-and-forget addition at their existing success sites — they never import or call staff service code. `staff.service.ts` is the sole listener and the sole writer of all staff storage files.

**Why:** avoids circular imports (staff service would otherwise need to import ticket/mod/verification internals and vice versa) and avoids duplicating counters that those systems already track for their own purposes (mirrors the precedent set by `statistics-engine.ts` for tickets).

**How to apply:** when adding a new staff-trackable action anywhere in the bot, add an `emitAction` call at the point where the action already succeeds — do not add new storage or counting logic at the call site.

## Dashboard entry point without a CC category
Discord Control Center categories build a `StringSelectMenuBuilder` requiring ≥1 option (`cc-renderer.ts::buildCategoryPanel`); a category with zero AI tools (like Staff Management Pro, which has no `ITool`s of its own) would crash Discord.js when navigated to. Rather than adding a `'staff'` `CategoryKey`, the dashboard is entered via a plain button (`sm:dash`) injected directly into the existing `'moderation'` category panel in `cc-panel.service.ts`, next to the "Mod System Pro" button.

**Why:** `checkCount`'s validators in `cc-debug.ts` treat 0-length option arrays as valid (`min:0`), so the crash risk is at Discord.js's own select-menu build step, not caught by the app's own render audit — this is a real crash, not just a lint warning.

**How to apply:** any future subsystem with zero AI-tool-driven interactions needs its own dashboard entry button on an existing category page, not a new `CategoryKey`.

## executorId plumbing
`ITool.execute`, `Executor.execute`, and `ai.service.ts`'s `runPipeline` call chain all thread an optional `executorId?: string` end-to-end (added as an extra trailing parameter, non-breaking since TS permits fewer params in implementations). Only tools that need to attribute a staff action (voice moderation tools, `security-report.tool.ts`) read it and call `staffEventBus.emitAction` when it's present and the action succeeded.

**Why:** slash-command-driven and button-driven staff actions (tickets, `/warn`, `/ban`, etc.) already have a natural actor id at the call site; AI-tool-driven actions only had `guild`, so there was no way to know who ran the command without this plumbing.

**How to apply:** any new AI tool that should count as a staff action must accept the third `executorId` param and emit only on success with a non-empty executorId — don't emit for tool calls with no identified actor.
