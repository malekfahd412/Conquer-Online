---
name: Per-button ticket category override
description: How ticket panel buttons/select-options can each open in a different Discord category, overriding the panel default.
---

`TicketButtonConfig` and `TicketSelectMenuOption` (types.ts) carry an optional `categoryId`. `ticketEngine.createChannel()` takes a `categoryOverride` param used as `parent` before falling back to `panel.openCategory`. `TicketSystem.resolveEntryCategoryId()` in `community/tickets/index.ts` looks up the override by ticketType (primary button → additionalButtons → selectMenu options), mirroring the existing `resolveEntryFormId` pattern.

**Why:** the panel previously only had one global `openCategory`, so every ticket type landed in the same Discord category regardless of which button opened it.

**How to apply:** the Ticket Panel Designer's per-button edit modals (primary/extra button, select option) already have a "Category ID" text field wired end-to-end — follow the same `resolveEntry*` lookup pattern for any other future per-button override (e.g. per-button log channel).
