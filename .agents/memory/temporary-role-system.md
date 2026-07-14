---
name: Temporary Role System
description: Architecture and wiring for the /role add duration= feature — persistent timer-based temp roles.
---

## Design

- **Store**: `community/moderation/temp-role-store.ts` → `data/temporary-roles.json` (flat array)
- **Manager**: `community/moderation/temp-role-manager.ts` → singleton `tempRoleManager`
- Entry ID is a composite key `{guildId}:{userId}:{roleId}` — guarantees dedup at upsert time

## Startup wiring (ai.service.ts)

`tempRoleManager.setClient(client)` + `tempRoleManager.start()` called in `start()`.
Four event listeners also added there: `guildMemberUpdate`, `guildMemberRemove`, `roleDelete`, `guildDelete`.

## Timer pattern

Mirrors the existing `ExpiryManager` (used for tempban/temptimeout):
- Overdue entries on startup → expired immediately, removed from disk, client action attempted gracefully
- Pending entries → `setTimeout` scheduled; JSMAX re-schedule for >24.8 day durations
- In-memory `timers: Map<id, timeout>` used as fast O(1) check in `onRoleRemoved` — only touches disk when a temp role is actually affected

## parseDuration extension (types.ts)

Added `mo` (30 days) to the existing `s|m|h|d|w` set. Regex: `/^(\d+)\s*(mo|s|m|h|d|w)$/i` — `mo` must precede `m` in alternation or "1mo" matches as minutes.

## Logging

- **Role added with duration** → `sendTempRoleAddedLog()` posts a "⏱️ Temporary Role Assigned" embed to the `role_given` log channel (in addition to the natural `guildMemberUpdate` log). Fields: role, member, granted-by, duration, expires-at.
- **Auto-removal** → `emitExpiryLog()` posts a "⏰ Temporary Role Expired" embed to the `role_removed` log channel. Fields: role, member, granted-by, duration, expired-at.

## Case record

`execRoleChange` sets `active: true` on temp-role cases (so they appear as pending in case history) and stores `extra.temporary`, `extra.durationMs`, `extra.expiresAt`.

**Why:** permanent role cases stay `active: false` — only temp roles are "active" pending resolution.
