---
name: Per-button ticket category override
description: How ticket panel buttons/select-options can each open in a different Discord category, overriding the panel default.
---

Superseded: the original single `categoryId` field on `TicketButtonConfig`/`TicketSelectMenuOption` was migrated into `TicketTypeOverrides.openCategory` (types.ts has a one-time migration that moves legacy `categoryId` into `overrides.openCategory` and strips the old field). The current, correct mechanism is `resolveTicketType(panel, ticketType)` (merges overrides onto panel defaults) + `setEntryOverrides(panel, ref, overrides)` (read-modify-write save) — see the Ticket Type Designer topic file for the full per-entry editor built on top of this.

**Why:** the panel previously only had one global `openCategory`; the overrides system generalized this to every per-entry field (categories, roles, naming, etc.), not just category.

**Known dead code:** the Ticket Panel Designer's *legacy* per-button edit modals (primary/extra button, select option — in tp-designer.service.ts/tp-renderer.ts) still reference the removed `categoryId` property directly, causing a pre-existing `tsc` compile error. It doesn't crash at runtime (the bot runs via `tsx`, which doesn't type-check), but treat `categoryId` there as dead/stale — don't copy that pattern. Use `overrides.openCategory` via `setEntryOverrides` instead, as the Ticket Type Designer's Categories page does.
