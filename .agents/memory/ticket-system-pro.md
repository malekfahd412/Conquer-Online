---
name: Ticket System Pro architecture
description: Multi-engine ticket system under community/tickets/ — file layout, migration approach, and extension points not obvious from a single file read.
---

# Ticket System Pro

Replaced a single-file legacy ticket service (`discord/tickets/*`) with 10 focused engines under `community/tickets/`, unified behind a `ticketSystem` facade (`community/tickets/index.ts`). Each engine owns exactly one JSON file under `data/tickets/` via a shared `JsonStore<T>` helper — no engine reaches into another's file directly.

**Why:** the spec required per-concern separation (naming, permissions, categories, questions, transcripts, automation, statistics, templates, panels, ticket lifecycle) instead of one god-object service.

**How to apply:** when adding a new ticket feature, identify which engine owns the relevant concern before writing code — don't add ad-hoc fields to whichever engine is most convenient. `records.json` (ticket instances/counters) and `logChannelId` on the panel model were necessary additions beyond an initial spec's named file/field list — check the actual legacy data shape before assuming a spec's field list is exhaustive; preserving existing behavior takes priority over literal spec compliance.

## Migration pattern
`migration.ts` runs once on `ticketSystem.init()`, gated by a `migratedFromLegacy` flag in `settings.json`. It reads the legacy flat JSON file, converts shapes, and calls each engine's `importRaw()`. The legacy file is left in place untouched as a passive backup — never deleted.

**Why:** the old file is a live production backup; deleting it removes a safety net for zero extra benefit.

**How to apply:** any future one-time migration in this codebase should follow the same idempotent-flag + non-destructive-source pattern.

## Custom ID contract must not change
Discord panel messages already posted keep their buttons working only if the `tk:*` custom ID scheme is preserved exactly (`tk:open:<panelId>:<ticketType>`, `tk:claim:`, `tk:close:`, etc.). New interaction types (select menus, modals) were added as new prefixes (`tk:select:`, `tk:modal:`) rather than changing existing ones.

**Why:** existing Discord messages can't be edited retroactively to point at new custom IDs — breaking the scheme orphans every already-posted panel.
